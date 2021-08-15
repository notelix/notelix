import Authenticator from './authenticator';
import { User } from '../../models/user.entity';
import { ForbiddenException, Injectable } from '@nestjs/common';
import JwtService from '../../services/jwt';

@Injectable()
export class JwtAuth implements Authenticator {
  constructor(private jwtService: JwtService) {}

  getAuthenticatorName() {
    return 'jwt';
  }

  async authenticate(params) {
    if (!params || !params.trim()) {
      throw new ForbiddenException('jwt token cannot be empty');
    }

    return await this.jwtService.getUserFromToken(params.trim());
  }
}

export default JwtAuth;
