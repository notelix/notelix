import Authenticator from './authenticator';
import { Injectable } from '@nestjs/common';
import JwtService from '../../services/jwt';
import { InvalidAuthenticationCredentialError } from '../invalidAuthenticationCredential.error';

@Injectable()
export class JwtAuth implements Authenticator {
  constructor(private jwtService: JwtService) {}

  getAuthenticatorName() {
    return 'jwt';
  }

  async authenticate(params) {
    if (!params || !params.trim()) {
      throw new InvalidAuthenticationCredentialError('jwt cannot be empty');
    }

    return await this.jwtService.getUserFromToken(params.trim());
  }
}

export default JwtAuth;
