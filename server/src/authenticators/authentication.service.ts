import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import Authenticator from './authenticators/authenticator';
import JwtAuth from './authenticators/jwtAuth';
import StaticTokenAuth from './authenticators/staticTokenAuth';
import { InvalidAuthenticationCredentialError } from './invalidAuthenticationCredential.error';

@Injectable()
export class AuthenticationService {
  authenticators: Authenticator[] = [];

  constructor(
    @Inject(REQUEST) private request: Request,
    private jwtAuth: JwtAuth,
    private staticTokenAuth: StaticTokenAuth,
  ) {
    this.authenticators.push(jwtAuth, staticTokenAuth);
  }

  async getAuthenticatedUser() {
    const header = this.request.headers.authorization;
    if (typeof header !== 'string') {
      throw this.authenticationFailed(false);
    }
    const match = /^(\S+)\s+(.+)$/.exec(header.trim());
    if (!match) {
      throw this.authenticationFailed(false);
    }
    const authenticatorType = match[1].toLowerCase();
    const authenticatorParam = match[2];
    const authenticator = this.authenticators.find(
      (candidate) =>
        candidate.getAuthenticatorName().toLowerCase() === authenticatorType,
    );
    if (!authenticator) {
      throw this.authenticationFailed(false);
    }

    try {
      return await authenticator.authenticate(authenticatorParam);
    } catch (error) {
      if (error instanceof InvalidAuthenticationCredentialError) {
        throw this.authenticationFailed(true);
      }
      throw new ServiceUnavailableException({
        message: 'authentication temporarily unavailable',
        retryable: true,
      });
    }
  }

  private authenticationFailed(clearClientCredentials: boolean) {
    return new UnauthorizedException({
      message: 'authentication failed',
      clearClientCredentials,
    });
  }
}
