import {
  BadRequestException,
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
import { Throttle } from '@nestjs/throttler';
import { AppDataSource } from '../database';

const invalidPasswordHash =
  '$2b$10$oceFgf0/W/UqgGnRi6t7PO43LgiW0xIYFsWbf0qlvC4ajEpwHMLAe';

function userResponse(user: User) {
  return {
    id: user.id,
    name: user.name,
    client_side_encryption: user.client_side_encryption,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'driverError' in error &&
    (error as { driverError?: { code?: string } }).driverError?.code === '23505'
  );
}

function assertEncryptionModeUnchanged(
  currentEncryptionParams: string,
  newEncryptionParams: string,
): void {
  if (Boolean(currentEncryptionParams) !== Boolean(newEncryptionParams)) {
    throw new BadRequestException(
      'client-side encryption cannot be enabled or disabled during a password change',
    );
  }
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
  @Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 } })
  async SignUp(@Body() request: SignUpDto): Promise<any> {
    const username = request.username.trim();
    const enableClientSideEncryption = request.enableClientSideEncryption;

    const existingUser = await User.findOne({ where: { name: username } });
    if (existingUser) {
      throw new ConflictException(`username ${username} already taken`);
    }

    const user = new User();
    user.name = username;
    user.password = await bcrypt.hash(request.password, 10);
    if (enableClientSideEncryption) {
      user.client_side_encryption = request.client_side_encryption;
    } else {
      user.client_side_encryption = '';
    }
    try {
      await user.save();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`username ${username} already taken`);
      }
      throw error;
    }

    return {};
  }

  @Post('/login')
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  async Login(@Body() request: LoginDto): Promise<any> {
    const username = request.username.trim();
    const password = request.password;

    const user = await User.findOne({ where: { name: username } });
    const passwordMatches = await bcrypt.compare(
      password,
      user?.password || invalidPasswordHash,
    );
    if (!user || !passwordMatches) {
      throw new ForbiddenException('invalid username or password');
    }

    return { ...userResponse(user), jwt: this.jwtService.signForUser(user) };
  }

  @Post('/change-password')
  @Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 } })
  async ChangePassword(@Body() request: ChangePasswordDto): Promise<any> {
    const newClientSideEncryptionParams =
      request.newClientSideEncryptionParams || '';
    const oldPassword = request.oldPassword;
    const newPassword = request.newPassword;
    const authenticatedUser =
      await this.authenticationService.getAuthenticatedUser();

    if (!(await bcrypt.compare(oldPassword, authenticatedUser.password))) {
      throw new ForbiddenException(`incorrect password`);
    }
    assertEncryptionModeUnchanged(
      authenticatedUser.client_side_encryption,
      newClientSideEncryptionParams,
    );
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    return AppDataSource.transaction(async (manager) => {
      const repository = manager.getRepository(User);
      const user = await repository.findOne({
        where: { id: authenticatedUser.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
        throw new ForbiddenException(`incorrect password`);
      }
      assertEncryptionModeUnchanged(
        user.client_side_encryption,
        newClientSideEncryptionParams,
      );

      user.password = newPasswordHash;
      user.client_side_encryption = newClientSideEncryptionParams;
      user.tokenVersion += 1;
      await repository.save(user);
      return userResponse(user);
    });
  }
}
