import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Request,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import JwtAuth from './authenticators/jwtAuth';
import BearerAuth from './authenticators/bearerAuth';

@Injectable()
export class AuthenticationService {
  authenticators = [];

  constructor(
    @Inject(REQUEST) private request: Request,
    private jwtAuth: JwtAuth,
    private bearerAuth: BearerAuth,
  ) {
    this.authenticators.push(jwtAuth, bearerAuth);
  }

  async getAuthenticatedUser() {
    const header = this.request.headers['authorization'];
    const indexOfSpace = header.indexOf(' ');
    const authenticatorType = header.substr(0, indexOfSpace);
    const authenticatorParam = header.substr(indexOfSpace + 1);
    for (let authenticator of this.authenticators) {
      if (authenticator.getAuthenticatorName() === authenticatorType) {
        try {
          return await authenticator.authenticate(authenticatorParam);
        } catch (e) {
          throw new ForbiddenException({
            message: `authentication failed: ${e.toString()}`,
            clearClientCredentials: true,
          });
        }
      }
    }
    throw new BadRequestException(
      `unsupported authenticator ${authenticatorType}`,
    );
  }
}