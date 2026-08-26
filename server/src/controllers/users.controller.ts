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
import JwtService from '../services/jwt';

function userResponse(user: User) {
  return {
    id: user.id,
    name: user.name,
    client_side_encryption: user.client_side_encryption,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

@Controller('users')
export class UsersController {
  constructor(
    private jwtService: JwtService,
    private authenticationService: AuthenticationService,
  ) {}

  @Get('/who-am-i')
  async WhoAmI(): Promise<any> {
    const user = await this.authenticationService.getAuthenticatedUser();
    return userResponse(user);
  }

  @Post('/signup')
  async SignUp(@Req() request: Request): Promise<any> {
    const username = request.body['username'];
    const password = await bcrypt.hash(request.body['password'], 10);
    const enableClientSideEncryption =
      request.body['enableClientSideEncryption'];

    const existingUser = await User.findOne({ name: username });
    if (existingUser) {
      throw new ConflictException(`username ${username} already taken`);
    }

    const user = new User();
    user.name = username;
    user.password = password;
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

    const user = await User.findOne({ name: username });
    if (!user) {
      throw new ForbiddenException(`user ${username} does not exist`);
    }

    if (!(await bcrypt.compare(password, user.password))) {
      throw new ForbiddenException(`incorrect password`);
    }

    await user.save();

    return { ...userResponse(user), jwt: this.jwtService.signForUser(user) };
  }

  @Post('/change-password')
  async ChangePassword(@Req() request: Request): Promise<any> {
    const newClientSideEncryptionParams =
      request.body['newClientSideEncryptionParams'];
    const oldPassword = request.body['oldPassword'];
    const newPassword = request.body['newPassword'];
    const user = await this.authenticationService.getAuthenticatedUser();

    if (!(await bcrypt.compare(oldPassword, user.password))) {
      throw new ForbiddenException(`incorrect password`);
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.client_side_encryption = newClientSideEncryptionParams || '';
    await user.save();

    return userResponse(user);
  }
}
