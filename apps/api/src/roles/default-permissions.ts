import { Menu, MENUS, type MenuPermission, SystemRole } from '@getpoint/shared';

type Grant = 'view' | 'manage';

const grants = (map: Partial<Record<Menu, Grant>>): MenuPermission[] =>
  MENUS.map((menu) => ({
    menu,
    canView: Boolean(map[menu]),
    canManage: map[menu] === 'manage',
  }));

/** Full access for every menu. The ADMIN role is always kept at this level. */
export const ALL_PERMISSIONS = grants(
  Object.fromEntries(MENUS.map((menu) => [menu, 'manage'])) as Record<Menu, Grant>,
);

/**
 * Seeded defaults, agreed in planning:
 * - Admin: everything, including users/permissions and settings
 * - Staff: receipts, members and reports
 * - Community Manager: locations/shops and point rules
 * - Staff and Community Manager: Activity Log "view" = their own actions only
 * Admins can change Staff and Community Manager from the Roles & Permissions tab.
 */
export const SYSTEM_ROLES: {
  key: SystemRole;
  name: string;
  description: string;
  permissions: MenuPermission[];
}[] = [
  {
    key: SystemRole.ADMIN,
    name: 'ผู้ดูแลระบบ',
    description: 'จัดการผู้ใช้งาน สิทธิ์ และการตั้งค่าทั้งหมดของระบบ',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: SystemRole.STAFF,
    name: 'เจ้าหน้าที่',
    description: 'ตรวจสอบใบเสร็จ ดูแลสมาชิก และดูรายงาน',
    permissions: grants({
      [Menu.DASHBOARD]: 'view',
      [Menu.RECEIPT_REVIEW]: 'manage',
      [Menu.RECEIPT_HISTORY]: 'view',
      [Menu.MEMBERS]: 'manage',
      [Menu.REPORTS]: 'view',
      // Own actions only (everyone's needs "manage").
      [Menu.ACTIVITY_LOG]: 'view',
    }),
  },
  {
    key: SystemRole.COMMUNITY_MANAGER,
    name: 'ผู้จัดการ Community',
    description: 'จัดการสถานที่ ร้านค้า และเงื่อนไขการให้แต้ม',
    permissions: grants({
      [Menu.DASHBOARD]: 'view',
      [Menu.POINT_RULES]: 'manage',
      [Menu.SHOPS]: 'manage',
      [Menu.REPORTS]: 'view',
      [Menu.ACTIVITY_LOG]: 'view',
    }),
  },
];
