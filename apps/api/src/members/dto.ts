import { normalizeThaiMobile, THAI_MOBILE_MESSAGE, THAI_MOBILE_PATTERN } from '@getpoint/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
type Status = (typeof STATUSES)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Trim, and turn "" into null so optional text can be cleared. */
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
/** "081-234-5678" / "+66812345678" → "0812345678"; anything else is left for @Matches to reject. */
const toMobile = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (normalizeThaiMobile(value) ?? value.trim()) : value;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = { message: 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD' };

export class CreateMemberDto {
  @IsUUID('all', { message: 'กรุณาเลือก Community' })
  communityId: string;

  @Transform(toMobile)
  @IsString()
  @Matches(THAI_MOBILE_PATTERN, { message: THAI_MOBILE_MESSAGE })
  phone: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกชื่อ' })
  @MaxLength(100)
  firstName: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  lastName?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/** Community can't change: a member belongs to one Community. */
export class UpdateMemberDto {
  @IsOptional()
  @Transform(toMobile)
  @IsString()
  @Matches(THAI_MOBILE_PATTERN, { message: THAI_MOBILE_MESSAGE })
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกชื่อ' })
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  lastName?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}

/** Filters shared by the list and the Excel export. */
export class MemberFilterQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID()
  communityId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;

  /** Registered on or after this day (Bangkok time). */
  @IsOptional()
  @Matches(DATE, DATE_MESSAGE)
  registeredFrom?: string;

  /** Registered on or before this day (Bangkok time). */
  @IsOptional()
  @Matches(DATE, DATE_MESSAGE)
  registeredTo?: string;
}

export class ListMembersQuery extends MemberFilterQuery {
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

export class BalancesQuery {
  /** Comma-separated member IDs (one page of the list). */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids: string[];
}
