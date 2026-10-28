export type MemberStatus = 'ACTIVE' | 'SUSPENDED';

export const MemberStatusLabel: Record<MemberStatus, string> = {
  ACTIVE: 'ใช้งาน',
  SUSPENDED: 'ระงับ',
};

/** Where the member signed up: created by staff in the CMS, or by the member through LINE. */
export type MemberChannel = 'CMS' | 'LINE';

export const MemberChannelLabel: Record<MemberChannel, string> = {
  CMS: 'สมัครผ่าน CMS',
  LINE: 'สมัครผ่าน LINE',
};

/** Whether the member has been matched to (or created in) LOGA. */
export type LogaLinkStatus = 'NOT_LINKED' | 'LINKED' | 'ERROR';

export const LogaLinkStatusLabel: Record<LogaLinkStatus, string> = {
  NOT_LINKED: 'ยังไม่เชื่อม LOGA',
  LINKED: 'เชื่อม LOGA แล้ว',
  ERROR: 'เชื่อม LOGA ไม่สำเร็จ',
};

/** Thai mobile number: 10 digits starting with 06, 08 or 09. */
export const THAI_MOBILE_PATTERN = /^0[689]\d{8}$/;

export const THAI_MOBILE_MESSAGE = 'เบอร์มือถือต้องมี 10 หลัก และขึ้นต้นด้วย 06, 08 หรือ 09';

/**
 * Normalise what people type ("081-234-5678", "+66 81 234 5678", "66812345678")
 * to the stored form "0812345678". Returns null when it isn't a Thai mobile number.
 */
export function normalizeThaiMobile(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+66')) digits = `0${digits.slice(3)}`;
  else if (/^66[689]\d{8}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return THAI_MOBILE_PATTERN.test(digits) ? digits : null;
}

/** "0812345678" → "081-234-5678" */
export function formatThaiMobile(phone: string): string {
  return THAI_MOBILE_PATTERN.test(phone)
    ? `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`
    : phone;
}

/** "0812345678" → "08X-XXX-5678" (as in the Members mockup list). */
export function maskThaiMobile(phone: string): string {
  return THAI_MOBILE_PATTERN.test(phone) ? `${phone.slice(0, 2)}X-XXX-${phone.slice(6)}` : phone;
}

/** Display name: first name plus last name when there is one. */
export const memberFullName = (m: { firstName: string; lastName: string | null }) =>
  m.lastName ? `${m.firstName} ${m.lastName}` : m.firstName;
