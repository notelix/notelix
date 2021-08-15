import Authenticator from './authenticator';
import { User } from '../../models/user.entity';
import { ForbiddenException, Injectable } from '@nestjs/common';

/**
 * @deprecated use JwtAuth instead
 */
@Injectable()
export class BearerAuth implements Authenticator {
  getAuthenticatorName() {
    return 'bearer';
  }

  async authenticate(params) {
    if (!params || !params.trim()) {
      throw new ForbiddenException('bearer token cannot be empty');
    }

    const user = await User.findOne({ bearer_token: params });

    if (!user) {
      throw new ForbiddenException('invalid bearer token');
    }

    return user;
  }
}

export default BearerAuth;
