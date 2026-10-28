import { normalizeThaiMobile, THAI_MOBILE_MESSAGE, THAI_MOBILE_PATTERN } from '@getpoint/shared';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const toMobile = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (normalizeThaiMobile(value) ?? value.trim()) : value;

export class SessionDto {
  /** ID token from liff.getIDToken() (or "mock:…" in development). */
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  idToken: string;
}

export class SendCodeDto {
  @Transform(toMobile)
  @IsString()
  @Matches(THAI_MOBILE_PATTERN, { message: THAI_MOBILE_MESSAGE })
  phone: string;
}

export class RegisterDto {
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

  /** The SMS code, when phone checking is switched on. */
  @IsOptional()
  @Transform(trim)
  @Matches(/^\d{6}$/, { message: 'รหัสยืนยันต้องเป็นตัวเลข 6 หลัก' })
  code?: string;
}
