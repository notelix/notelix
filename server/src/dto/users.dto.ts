import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const nonWhitespace = /\S/;

export class SignUpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(nonWhitespace)
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  password: string;

  @IsOptional()
  @IsBoolean()
  enableClientSideEncryption?: boolean;

  @ValidateIf((request) => request.enableClientSideEncryption)
  @IsString()
  @MaxLength(4096)
  client_side_encryption?: string;
}

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(nonWhitespace)
  username: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  oldPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  newPassword: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  newClientSideEncryptionParams?: string;
}
