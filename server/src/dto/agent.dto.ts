import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AgentSyncConfigDto {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  url: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  token: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Matches(/^(?:[a-f\d]{2})*$/i)
  clientSideEncryptionKey?: string;
}

export class SetAgentSyncDto {
  @ValidateNested()
  @Type(() => AgentSyncConfigDto)
  config: AgentSyncConfigDto;
}
