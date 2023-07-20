import Authenticator from './authenticator';
import {BadRequestException, ForbiddenException, Injectable,} from '@nestjs/common';
import {StaticToken} from '../../models/staticToken.entity';
import {User} from '../../models/user.entity';

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

        let staticTokenEntity = await StaticToken.getRepository().findOne({
            relations: ['user'],
            where: {staticToken: staticToken},
        });

        if (!staticTokenEntity) {
            // sign up automatically
            let user = new User();
            user.name = `guest_${staticToken}`;
            user.password = staticToken;
            user.client_side_encryption = '';
            user = await user.save();

            staticTokenEntity = new StaticToken();
            staticTokenEntity.staticToken = staticToken;
            staticTokenEntity.user = user;
            staticTokenEntity = await staticTokenEntity.save();
        }

        return staticTokenEntity.user;
    }
}

export default StaticTokenAuth;
