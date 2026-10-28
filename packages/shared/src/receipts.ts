/** Why staff rejected a receipt (confirmed list, 2026-10-22). */
export type RejectReason =
  | 'UNREADABLE'
  | 'DUPLICATE'
  | 'SHOP_NOT_PARTICIPATING'
  | 'NOT_A_RECEIPT'
  | 'INCOMPLETE'
  | 'TOO_OLD'
  | 'SHOP_NOT_FOUND'
  | 'ALTERED'
  | 'OTHER';

export const REJECT_REASONS: RejectReason[] = [
  'UNREADABLE',
  'DUPLICATE',
  'SHOP_NOT_PARTICIPATING',
  'NOT_A_RECEIPT',
  'INCOMPLETE',
  'TOO_OLD',
  'SHOP_NOT_FOUND',
  'ALTERED',
  'OTHER',
];

export const RejectReasonLabel: Record<RejectReason, string> = {
  UNREADABLE: 'รูปภาพไม่ชัดเจน อ่านไม่ได้',
  DUPLICATE: 'ใบเสร็จซ้ำ',
  SHOP_NOT_PARTICIPATING: 'ร้านค้าไม่ร่วมรายการ',
  NOT_A_RECEIPT: 'ไม่ใช่ใบเสร็จรับเงิน',
  INCOMPLETE: 'ใบเสร็จไม่ครบถ้วน',
  TOO_OLD: 'ใบเสร็จเกินระยะเวลาที่กำหนด',
  SHOP_NOT_FOUND: 'ไม่พบร้านค้าในระบบ',
  ALTERED: 'ใบเสร็จถูกแก้ไขหรือไม่ถูกต้อง',
  OTHER: 'อื่นๆ (ระบุเหตุผล)',
};

/**
 * Text the member sees in LINE. "Other" notes are written for staff and may be internal,
 * so the member gets a general message instead.
 */
export function memberRejectMessage(reason: RejectReason): string {
  return reason === 'OTHER'
    ? 'ใบเสร็จไม่ผ่านการตรวจสอบ กรุณาติดต่อเจ้าหน้าที่'
    : RejectReasonLabel[reason];
}

/** Upload limits agreed for member submissions. */
export const RECEIPT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const RECEIPT_MAX_FILES = 10;
export const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

/** Default for "ส่งใบเสร็จได้ภายใน N วัน" on new point rules. */
export const DEFAULT_CLAIM_DAYS = 30;

/** Receipt number as typed → comparable form: "a 00125" / "A-00125" → "A00125". */
export const normalizeReceiptNo = (value: string) => value.toUpperCase().replace(/[\s\-_/.#]/g, '');

/** Whole days from `from` to `to`, both "YYYY-MM-DD" calendar days. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
