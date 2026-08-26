import { Injectable, OnModuleInit } from '@nestjs/common';
import { JwtPrivateKey } from '../models/jwtPrivateKey.entity';
import { User } from '../models/user.entity';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { AppDataSource } from '../database';
import { InvalidAuthenticationCredentialError } from '../authenticators/invalidAuthenticationCredential.error';

export function genRsaKeyPair(): Promise<{ publicKey; privateKey }> {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      'rsa',
      {
        modulusLength: 4096,
        publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      },
      (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ publicKey, privateKey });
      },
    );
  });
}

export function validateJwtExpiration(
  value: string,
): jwt.SignOptions['expiresIn'] {
  const errorMessage =
    'JWT_EXPIRES_IN must be a positive duration with a unit, such as 15m or 30d';
  try {
    const validationToken = jwt.sign({}, 'jwt-expiration-validation', {
      expiresIn: value as jwt.SignOptions['expiresIn'],
    });
    const decoded = jwt.decode(validationToken);
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      !Number.isInteger(decoded.iat) ||
      !Number.isInteger(decoded.exp) ||
      decoded.exp <= decoded.iat
    ) {
      throw new Error(errorMessage);
    }
  } catch (_error) {
    throw new Error(errorMessage);
  }
  return value as jwt.SignOptions['expiresIn'];
}

const JwtParams: jwt.SignOptions = {
  algorithm: 'RS256',
  expiresIn: validateJwtExpiration(process.env.JWT_EXPIRES_IN || '30d'),
  issuer: 'notelix',
};

@Injectable()
export default class JwtService implements OnModuleInit {
  private jwtPrivateKey: JwtPrivateKey;

  async onModuleInit() {
    this.jwtPrivateKey = await this.loadJwtPrivateKey();
  }

  getPrivateKey(): string {
    return this.jwtPrivateKey.privateKey;
  }

  getPublicKey(): string {
    return this.jwtPrivateKey.publicKey;
  }

  signForUser(user: User): string {
    return jwt.sign(
      { id: user.id, tokenVersion: user.tokenVersion ?? 0 },
      this.getPrivateKey(),
      JwtParams,
    );
  }

  async getUserFromToken(token: string): Promise<User> {
    let decoded: jwt.JwtPayload | string;
    try {
      decoded = jwt.verify(token, this.getPublicKey(), {
        algorithms: ['RS256'],
        issuer: 'notelix',
      });
    } catch (_error) {
      throw new InvalidAuthenticationCredentialError('jwt is invalid');
    }
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      !Number.isInteger(decoded.id) ||
      decoded.id <= 0
    ) {
      throw new InvalidAuthenticationCredentialError(
        'jwt payload does not contain a user id',
      );
    }
    const tokenVersion = decoded.tokenVersion ?? 0;
    if (!Number.isInteger(tokenVersion) || tokenVersion < 0) {
      throw new InvalidAuthenticationCredentialError(
        'jwt payload contains an invalid token version',
      );
    }

    const user = await User.findOne({ where: { id: decoded.id } });
    if (!user) {
      throw new InvalidAuthenticationCredentialError(
        'jwt user no longer exists',
      );
    }
    if ((user.tokenVersion ?? 0) !== tokenVersion) {
      throw new InvalidAuthenticationCredentialError('jwt has been revoked');
    }
    return user;
  }

  private async loadJwtPrivateKey(): Promise<JwtPrivateKey> {
    return AppDataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'notelix-jwt-private-key',
      ]);
      const repository = manager.getRepository(JwtPrivateKey);
      const existingKey = await repository.findOne({
        where: {},
        order: { id: 'ASC' },
      });
      if (existingKey) {
        return existingKey;
      }

      const keyPair = await genRsaKeyPair();
      const key = repository.create({
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
      });
      return repository.save(key);
    });
  }
}
