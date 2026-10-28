import { PASSWORD_MIN_LENGTH } from '@getpoint/shared';
import type { Rule } from 'antd/es/form';

/** Same rule as the API (apps/api/src/auth/dto.ts IsStrongPassword). */
export const newPasswordRules: Rule[] = [
  { required: true, message: 'กรุณากรอกรหัสผ่านใหม่' },
  { min: PASSWORD_MIN_LENGTH, message: `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร` },
  { max: 72, message: 'รหัสผ่านต้องไม่เกิน 72 ตัวอักษร' },
  { pattern: /[A-Za-z]/, message: 'ต้องมีตัวอักษรภาษาอังกฤษอย่างน้อย 1 ตัว' },
  { pattern: /\d/, message: 'ต้องมีตัวเลขอย่างน้อย 1 ตัว' },
];

export const confirmPasswordRules = (field = 'newPassword'): Rule[] => [
  { required: true, message: 'กรุณายืนยันรหัสผ่าน' },
  ({ getFieldValue }) => ({
    validator: (_, value) =>
      !value || getFieldValue(field) === value
        ? Promise.resolve()
        : Promise.reject(new Error('รหัสผ่านไม่ตรงกัน')),
  }),
];

export const PASSWORD_HINT = `อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร มีทั้งตัวอักษรภาษาอังกฤษและตัวเลข`;
