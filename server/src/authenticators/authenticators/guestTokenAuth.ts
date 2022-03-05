import Authenticator from './authenticator';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GuestToken } from '../../models/guestToken.entity';
import { User } from '../../models/user.entity';

@Injectable()
export class GuestTokenAuth implements Authenticator {
  getAuthenticatorName() {
    return 'guest-token';
  }

  async authenticate(params) {
    if (!params || !params.trim()) {
      throw new ForbiddenException('guest-token cannot be empty');
    }

    const guestToken = params.trim();
    if (guestToken.length !== 64) {
      throw new BadRequestException('guest-token must be 64 characters long');
    }

    let guestTokenEntity = await GuestToken.getRepository().findOne({
      relations: ['user'],
      where: { guestToken: guestToken },
    });

    if (!guestTokenEntity) {
      // sign up automatically
      let user = new User();
      user.name = `guest_${guestToken}`;
      user.password = guestToken;
      user.client_side_encryption = '';
      user = await user.save();

      guestTokenEntity = new GuestToken();
      guestTokenEntity.guestToken = guestToken;
      guestTokenEntity.user = user;
      guestTokenEntity = await guestTokenEntity.save();
    }

    return guestTokenEntity.user;
  }
}

export default GuestTokenAuth;
