import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
type UserStatusValue = (typeof USER_STATUSES)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ScopeDto {
  /** true = all Communities and Locations (ทุกสถานที่). */
  @IsBoolean()
  all: boolean;

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  communityIds: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  locationIds: string[];
}

export class CreateUserDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกชื่อผู้ใช้งาน' })
  @MaxLength(100)
  name: string;

  @Transform(trimLower)
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  @MaxLength(200)
  email: string;

  @IsUUID('all', { message: 'กรุณาเลือกบทบาท' })
  roleId: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatusValue;

  @ValidateNested()
  @Type(() => ScopeDto)
  scope: ScopeDto;
}

export class UpdateUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'กรุณากรอกชื่อผู้ใช้งาน' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatusValue;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScopeDto)
  scope?: ScopeDto;
}

export class ListUsersQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatusValue;

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

export class AdminResetPasswordDto {
  /** temporary = show a one-time password to the admin; email = send the user a reset link. */
  @IsIn(['temporary', 'email'])
  method: 'temporary' | 'email';
}
