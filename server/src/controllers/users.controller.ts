import {
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Request,
} from '@nestjs/common';
import { AuthenticationService } from '../authenticators/authentication.service';
import { User } from '../models/user.entity';
import * as bcrypt from 'bcrypt';
import makeid from '../utils/makeid';
import JwtService from '../services/jwt';

@Controller('users')
export class UsersController {
  constructor(
    private jwtService: JwtService,
    private authenticationService: AuthenticationService,
  ) {}

  @Get('/who-am-i')
  async WhoAmI(): Promise<any> {
    return await this.authenticationService.getAuthenticatedUser();
  }

  @Post('/signup')
  async SignUp(@Req() request: Request): Promise<any> {
    const username = request.body['username'];
    const password = bcrypt.hashSync(request.body['password'], 10);
    const enableClientSideEncryption =
      request.body['enableClientSideEncryption'];

    let existingUser = await User.findOne({ name: username });
    if (existingUser) {
      throw new ConflictException(`username ${username} already taken`);
    }

    let user = new User();
    user.name = username;
    user.password = password;
    user.bearer_token = '';
    if (enableClientSideEncryption) {
      user.client_side_encryption = request.body['client_side_encryption'];
    } else {
      user.client_side_encryption = '';
    }
    await user.save();

    return {};
  }

  @Post('/login')
  async Login(@Req() request: Request): Promise<any> {
    const username = request.body['username'];
    const password = request.body['password'];

    let user = await User.findOne({ name: username });
    if (!user) {
      throw new ForbiddenException(`user ${username} does not exist`);
    }

    if (!bcrypt.compareSync(password, user.password)) {
      throw new ForbiddenException(`incorrect password`);
    }

    user.bearer_token = makeid(32);
    await user.save();

    return { ...user, jwt: this.jwtService.signForUser(user) };
  }

  @Post('/change-password')
  async ChangePassword(@Req() request: Request): Promise<any> {
    const newClientSideEncryptionParams =
      request.body['newClientSideEncryptionParams'];
    const oldPassword = request.body['oldPassword'];
    const newPassword = request.body['newPassword'];
    const user = await this.authenticationService.getAuthenticatedUser();

    if (!bcrypt.compareSync(oldPassword, user.password)) {
      throw new ForbiddenException(`incorrect password`);
    }

    user.password = bcrypt.hashSync(newPassword, 10);
    user.client_side_encryption = newClientSideEncryptionParams || '';
    await user.save();

    return { ...user };
  }
}
