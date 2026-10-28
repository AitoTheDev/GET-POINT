import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
type Status = (typeof STATUSES)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Trim, and turn "" into null so optional text can be cleared. */
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

const NAME_REQUIRED = { message: 'กรุณากรอกชื่อ' };

// ---------- Communities ----------

export class CreateCommunityDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, NAME_REQUIRED)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

export class UpdateCommunityDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, NAME_REQUIRED)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

// ---------- Locations ----------

export class CreateLocationDto {
  @IsUUID('all', { message: 'กรุณาเลือก Community' })
  communityId: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, NAME_REQUIRED)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsUUID()
  communityId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, NAME_REQUIRED)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

export class ListLocationsQuery {
  @IsOptional()
  @IsUUID()
  communityId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

// ---------- Shops ----------

export class CreateShopDto {
  @IsUUID('all', { message: 'กรุณาเลือกสถานที่' })
  locationId: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, NAME_REQUIRED)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(150)
  receiptName?: string | null;

  @IsOptional()
  @IsBoolean()
  participating?: boolean;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

export class UpdateShopDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, NAME_REQUIRED)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(150)
  receiptName?: string | null;

  @IsOptional()
  @IsBoolean()
  participating?: boolean;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

export class ListShopsQuery {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  participating?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

/** Export uses the same filters as the list, without paging. */
export class ExportShopsQuery {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

// ---------- Categories ----------

export class CreateCategoryDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, NAME_REQUIRED)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, NAME_REQUIRED)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}
