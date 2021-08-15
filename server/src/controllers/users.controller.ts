import {
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Request,
} from '@nestjs/common';
import { AuthenticationService } from '../authenticators/authentication.service';
import { REQUEST } from '@nestjs/core';
import { User } from '../models/user.entity';
import * as bcrypt from 'bcrypt';
import makeid from '../utils/makeid';
import JwtService from '../services/jwt';

@Controller('users')
export class UsersController {
  constructor(
    @Inject(REQUEST) private request: Request,
    private jwtService: JwtService,
    private authenticationService: AuthenticationService,
  ) {}

  @Get('/who-am-i')
  async WhoAmI(): Promise<any> {
    return await this.authenticationService.getAuthenticatedUser();
  }

  @Post('/signup')
  async SignUp(): Promise<any> {
    const username = this.request.body['username'];
    const password = bcrypt.hashSync(this.request.body['password'], 10);
    const enableClientSideEncryption =
      this.request.body['enableClientSideEncryption'];

    let existingUser = await User.findOne({ name: username });
    if (existingUser) {
      throw new ConflictException(`username ${username} already taken`);
    }

    let user = new User();
    user.name = username;
    user.password = password;
    user.bearer_token = '';
    if (enableClientSideEncryption) {
      user.client_side_encryption = this.request.body['client_side_encryption'];
    } else {
      user.client_side_encryption = '';
    }
    await user.save();

    return {};
  }

  @Post('/login')
  async Login(): Promise<any> {
    const username = this.request.body['username'];
    const password = this.request.body['password'];

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
  async ChangePassword(): Promise<any> {
    const newClientSideEncryptionParams =
      this.request.body['newClientSideEncryptionParams'];
    const oldPassword = this.request.body['oldPassword'];
    const newPassword = this.request.body['newPassword'];
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
