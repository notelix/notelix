import Authenticator from './authenticator';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { StaticToken } from '../../models/staticToken.entity';
import { User } from '../../models/user.entity';
import { AppDataSource } from '../../database';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class StaticTokenAuth implements Authenticator {
  getAuthenticatorName() {
    return 'static-token';
  }

  async authenticate(params) {
    if (!params || !params.trim()) {
      throw new ForbiddenException('static-token cannot be empty');
    }

    const staticToken = params.trim();
    if (staticToken.length !== 64) {
      throw new BadRequestException('static-token must be 64 characters long');
    }

    const existingToken = await StaticToken.findOne({
      relations: { user: true },
      where: { staticToken },
    });
    if (existingToken) {
      return existingToken.user;
    }

    return AppDataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`notelix-static-token:${staticToken}`],
      );

      const staticTokenRepository = manager.getRepository(StaticToken);
      let staticTokenEntity = await staticTokenRepository.findOne({
        relations: { user: true },
        where: { staticToken },
      });

      if (!staticTokenEntity) {
        let user = new User();
        user.name = `guest_${staticToken}`;
        user.password = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
        user.client_side_encryption = '';
        user = await manager.save(user);

        staticTokenEntity = new StaticToken();
        staticTokenEntity.staticToken = staticToken;
        staticTokenEntity.user = user;
        staticTokenEntity = await staticTokenRepository.save(staticTokenEntity);
      }

      return staticTokenEntity.user;
    });
  }
}

export default StaticTokenAuth;
