import { PASSWORD_MIN_LENGTH } from '@getpoint/shared';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Password rule shared by every endpoint that sets a password. */
export function IsStrongPassword(): PropertyDecorator {
  return (target, key) => {
    IsString()(target, key);
    MinLength(PASSWORD_MIN_LENGTH, {
      message: `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`,
    })(target, key);
    MaxLength(72, { message: 'รหัสผ่านต้องไม่เกิน 72 ตัวอักษร' })(target, key);
    Matches(/[A-Za-z]/, { message: 'รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษอย่างน้อย 1 ตัว' })(
      target,
      key,
    );
    Matches(/\d/, { message: 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว' })(target, key);
  };
}

export class LoginDto {
  @Transform(trimLower)
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'กรุณากรอกรหัสผ่าน' })
  @MaxLength(200)
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsStrongPassword()
  newPassword: string;
}

export class ForgotPasswordDto {
  @Transform(trimLower)
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @IsStrongPassword()
  newPassword: string;
}
