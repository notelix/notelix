import Authenticator from './authenticator';
import { Injectable } from '@nestjs/common';
import { StaticToken } from '../../models/staticToken.entity';
import { User } from '../../models/user.entity';
import { AppDataSource } from '../../database';
import { randomBytes } from 'crypto';
import { digestStaticToken } from '../../security/staticToken';
import { readStaticTokenProvisioningConfig } from '../../security/staticTokenProvisioning';
import { verifyStaticTokenDigest } from '../../security/staticTokenVerifier';
import { InvalidAuthenticationCredentialError } from '../invalidAuthenticationCredential.error';

// This is a valid bcrypt hash of a discarded random value. Static-token-only
// accounts must have no usable password, and provisioning should not spend a
// bcrypt operation on every new account.
const staticTokenOnlyPasswordHash =
  '$2b$10$OMs94UKu6b4hrVocX6MrHefLtaoLMn5St/XcyyeFnM9jNb4TYEmYu';

@Injectable()
export class StaticTokenAuth implements Authenticator {
  private readonly provisioning = readStaticTokenProvisioningConfig();

  getAuthenticatorName() {
    return 'static-token';
  }

  async authenticate(params) {
    if (!params || !params.trim()) {
      throw new InvalidAuthenticationCredentialError(
        'static-token cannot be empty',
      );
    }

    const staticToken = params.trim();
    if (staticToken.length !== 64) {
      throw new InvalidAuthenticationCredentialError(
        'static-token must be 64 characters long',
      );
    }
    const tokenDigest = digestStaticToken(staticToken);

    const existingToken = await StaticToken.findOne({
      relations: { user: true },
      where: { tokenDigest },
    });
    if (existingToken) {
      return existingToken.user;
    }

    if (!this.provisioning.enabled) {
      throw new InvalidAuthenticationCredentialError(
        'static-token is not registered',
      );
    }

    if (
      this.provisioning.verifier &&
      !(await verifyStaticTokenDigest(tokenDigest, this.provisioning.verifier))
    ) {
      throw new InvalidAuthenticationCredentialError(
        'static-token is not registered',
      );
    }

    return AppDataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`notelix-static-token:${tokenDigest}`],
      );

      const staticTokenRepository = manager.getRepository(StaticToken);
      let staticTokenEntity = await staticTokenRepository.findOne({
        relations: { user: true },
        where: { tokenDigest },
      });

      if (!staticTokenEntity) {
        const [provisioningLock] = await manager.query(
          'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
          ['notelix-static-token-provisioning'],
        );
        if (!provisioningLock?.acquired) {
          throw new Error('static-token provisioning is busy');
        }

        const accountCount = await staticTokenRepository.count();
        if (accountCount >= this.provisioning.accountLimit) {
          throw new InvalidAuthenticationCredentialError(
            'static-token provisioning limit reached',
          );
        }

        let user = new User();
        user.name = `guest_${randomBytes(16).toString('hex')}`;
        user.password = staticTokenOnlyPasswordHash;
        user.client_side_encryption = '';
        user = await manager.save(user);

        staticTokenEntity = new StaticToken();
        staticTokenEntity.tokenDigest = tokenDigest;
        staticTokenEntity.user = user;
        staticTokenEntity = await staticTokenRepository.save(staticTokenEntity);
      }

      return staticTokenEntity.user;
    });
  }
}

export default StaticTokenAuth;
