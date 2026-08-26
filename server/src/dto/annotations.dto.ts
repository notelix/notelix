import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
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
