import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SaveAnnotationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  uid: string;

  @IsOptional()
  @IsString()
  @MaxLength(32768)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32768)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32768)
  host?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class DeleteAnnotationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  uid: string;

  // Older extension and embedded builds included the page URL in delete
  // requests. Deletion is still authorized exclusively by user + uid, but
  // accepting this ignored field keeps those deployed clients compatible.
  @IsOptional()
  @IsString()
  @MaxLength(32768)
  url?: string;
}

export class QueryAnnotationsByUrlDto {
  @IsString()
  @MaxLength(32768)
  url: string;
}

export class ListDiffDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  sinceId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ListSnapshotPageDto {
  @IsOptional()
  @IsUUID('4')
  snapshotId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  afterId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(250)
  limit?: number;
}

export class SearchAnnotationsDto {
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  q?: string;
}

export class FindAnnotationsDto {
  @IsOptional()
  @IsObject()
  selectors?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  groupBy?: string;
}
