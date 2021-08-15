import { Injectable, OnModuleInit } from '@nestjs/common';
import { JwtPrivateKey } from '../models/jwtPrivateKey.entity';
import { User } from '../models/user.entity';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

function genRsaKeyPair(): Promise<{ publicKey; privateKey }> {
  return new Promise((resolve) => {
    crypto.generateKeyPair(
      'rsa',
      {
        modulusLength: 4096,
        publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      },
      (err, publicKey, privateKey) => {
        if (!err) {
          resolve({ publicKey, privateKey });
        } else {
          throw err;
        }
      },
    );
  });
}

const JwtParams = {
  algorithm: 'RS256',
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
    return jwt.sign({ id: user.id }, this.getPrivateKey(), JwtParams);
  }

  getUserFromToken(token: string): Promise<User> {
    return new Promise((resolve, reject) => {
      jwt.verify(token, this.getPublicKey(), function (err, decoded) {
        if (err) {
          reject('failed to verify jwt as ' + err.toString());
          return;
        }
        resolve(User.findOne(decoded.id));
      });
    });
  }

  private async loadJwtPrivateKey(): Promise<JwtPrivateKey> {
    const jwtPrivateKey = await JwtPrivateKey.findOne({});
    if (!jwtPrivateKey) {
      await this.createJwtPrivateKey();
      return this.loadJwtPrivateKey();
    }
    return jwtPrivateKey;
  }

  private async createJwtPrivateKey() {
    const key = new JwtPrivateKey();
    const keyPair = await genRsaKeyPair();
    key.publicKey = keyPair.publicKey;
    key.privateKey = keyPair.privateKey;
    await key.save();
  }
}
