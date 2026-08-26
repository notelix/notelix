import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Post,
} from '@nestjs/common';
import { AuthenticationService } from '../authenticators/authentication.service';
import { User } from '../models/user.entity';
import * as bcrypt from 'bcrypt';
import JwtService from '../services/jwt';
import { ChangePasswordDto, LoginDto, SignUpDto } from '../dto/users.dto';

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
  async SignUp(@Body() request: SignUpDto): Promise<any> {
    const username = request.username;
    const password = await bcrypt.hash(request.password, 10);
    const enableClientSideEncryption = request.enableClientSideEncryption;

    const existingUser = await User.findOne({ where: { name: username } });
    if (existingUser) {
      throw new ConflictException(`username ${username} already taken`);
    }

    const user = new User();
    user.name = username;
    user.password = password;
    if (enableClientSideEncryption) {
      user.client_side_encryption = request.client_side_encryption;
    } else {
      user.client_side_encryption = '';
    }
    await user.save();

    return {};
  }

  @Post('/login')
  async Login(@Body() request: LoginDto): Promise<any> {
    const username = request.username;
    const password = request.password;

    const user = await User.findOne({ where: { name: username } });
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
  async ChangePassword(@Body() request: ChangePasswordDto): Promise<any> {
    const newClientSideEncryptionParams = request.newClientSideEncryptionParams;
    const oldPassword = request.oldPassword;
    const newPassword = request.newPassword;
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
