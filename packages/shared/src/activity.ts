/** Thai wording for each audit action (Activity Log). Unknown actions show their code. */
export const ActivityLabel: Record<string, string> = {
  'auth.login': 'เข้าสู่ระบบ',
  'auth.login_failed': 'เข้าสู่ระบบไม่สำเร็จ',
  'auth.logout': 'ออกจากระบบ',
  'auth.password_changed': 'เปลี่ยนรหัสผ่าน',
  'auth.password_reset_requested': 'ขอลิงก์รีเซ็ตรหัสผ่าน',
  'auth.password_reset_completed': 'ตั้งรหัสผ่านใหม่จากลิงก์',
  'user.created': 'เพิ่มผู้ใช้งาน',
  'user.updated': 'แก้ไขผู้ใช้งาน',
  'user.password_reset_by_admin': 'ออกรหัสผ่านชั่วคราว',
  'user.password_reset_emailed': 'ส่งลิงก์รีเซ็ตรหัสผ่าน',
  'role.created': 'เพิ่มบทบาท',
  'role.updated': 'แก้ไขบทบาทและสิทธิ์',
  'role.deleted': 'ลบบทบาท',
  'community.created': 'เพิ่ม Community',
  'community.updated': 'แก้ไข Community',
  'location.created': 'เพิ่มสถานที่',
  'location.updated': 'แก้ไขสถานที่',
  'shop.created': 'เพิ่มร้านค้า',
  'shop.updated': 'แก้ไขร้านค้า',
  'shop.exported': 'Export ร้านค้า',
  'shop_category.created': 'เพิ่มหมวดหมู่ร้านค้า',
  'shop_category.updated': 'แก้ไขหมวดหมู่ร้านค้า',
  'shop_category.deleted': 'ลบหมวดหมู่ร้านค้า',
  'member.created': 'เพิ่มสมาชิก',
  'member.updated': 'แก้ไขสมาชิก',
  'member.suspended': 'ระงับสมาชิก',
  'member.reactivated': 'เปิดใช้งานสมาชิก',
  'member.exported': 'Export สมาชิก',
  'member.loga_linked': 'เชื่อมสมาชิกกับ LOGA',
  'member.loga_link_failed': 'เชื่อมสมาชิกกับ LOGA ไม่สำเร็จ',
  'member.registered_line': 'สมาชิกสมัครผ่าน LINE',
  'member.line_linked': 'สมาชิกเชื่อมบัญชี LINE',
  'point_rule.created': 'เพิ่มเงื่อนไขการให้แต้ม',
  'point_rule.updated': 'แก้ไขเงื่อนไขการให้แต้ม',
  'receipt.created': 'เพิ่มใบเสร็จ',
  'receipt.submitted': 'สมาชิกส่งใบเสร็จผ่าน LINE',
  'receipt.approved': 'อนุมัติใบเสร็จ',
  'receipt.rejected': 'ไม่อนุมัติใบเสร็จ',
  'receipt.needs_check': 'ส่งใบเสร็จตรวจเพิ่ม',
  'receipt.exported': 'Export ใบเสร็จ',
  'transfer.succeeded': 'ส่งแต้มไป LOGA สำเร็จ',
  'transfer.failed': 'ส่งแต้มไป LOGA ไม่สำเร็จ',
  'transfer.unknown': 'ส่งแต้มไป LOGA ไม่ทราบผล',
  'setting.updated': 'แก้ไขการตั้งค่า',
  'loga.connection_tested': 'ทดสอบการเชื่อมต่อ LOGA',
  'loga.mock_mode_changed': 'เปลี่ยนโหมด LOGA จำลอง',
  'report.exported': 'Export รายงาน',
};

export const activityLabel = (action: string) => ActivityLabel[action] ?? action;

/** Groups for the Activity Log filter (action prefix → label). */
export const ActivityGroupLabel: Record<string, string> = {
  auth: 'การเข้าสู่ระบบ',
  user: 'ผู้ใช้งาน',
  role: 'บทบาทและสิทธิ์',
  community: 'Community',
  location: 'สถานที่',
  shop: 'ร้านค้า',
  shop_category: 'หมวดหมู่ร้านค้า',
  member: 'สมาชิก',
  point_rule: 'เงื่อนไขการให้แต้ม',
  receipt: 'ใบเสร็จ',
  transfer: 'ส่งแต้มไป LOGA',
  setting: 'การตั้งค่า',
  loga: 'LOGA',
  report: 'รายงาน',
};

/** Date range presets on the Dashboard and Reports (Bangkok calendar days). */
export type RangePreset = 'today' | '7d' | '30d' | 'month' | 'custom';

export const RangePresetLabel: Record<RangePreset, string> = {
  today: 'วันนี้',
  '7d': '7 วันล่าสุด',
  '30d': '30 วันล่าสุด',
  month: 'เดือนนี้',
  custom: 'กำหนดเอง',
};

/** "YYYY-MM-DD" of `today` minus `days`. */
const minusDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** The from/to days (inclusive) of a preset, given today's Bangkok date. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: string) {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: minusDays(today, 6), to: today };
    case '30d':
      return { from: minusDays(today, 29), to: today };
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

/** Every calendar day from `from` to `to` (inclusive), for chart axes with no gaps. */
export function daysInRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (
    let t = Date.parse(`${from}T00:00:00Z`);
    t <= Date.parse(`${to}T00:00:00Z`);
    t += 86_400_000
  ) {
    days.push(new Date(t).toISOString().slice(0, 10));
    if (days.length > 400) break; // guard against a huge range
  }
  return days;
}
