/** CMS menus that permissions are granted on. Order = order shown in the permission matrix. */
export const Menu = {
  DASHBOARD: 'DASHBOARD',
  RECEIPT_REVIEW: 'RECEIPT_REVIEW',
  RECEIPT_HISTORY: 'RECEIPT_HISTORY',
  MEMBERS: 'MEMBERS',
  POINT_RULES: 'POINT_RULES',
  SHOPS: 'SHOPS',
  REPORTS: 'REPORTS',
  USERS: 'USERS',
  ACTIVITY_LOG: 'ACTIVITY_LOG',
  SETTINGS: 'SETTINGS',
} as const;
export type Menu = (typeof Menu)[keyof typeof Menu];

export const MENUS = Object.values(Menu);

export const MenuLabel: Record<Menu, string> = {
  DASHBOARD: 'Dashboard',
  RECEIPT_REVIEW: 'ตรวจสอบใบเสร็จ',
  RECEIPT_HISTORY: 'ประวัติใบเสร็จ',
  MEMBERS: 'สมาชิก',
  POINT_RULES: 'เงื่อนไขการให้แต้ม',
  SHOPS: 'ร้านค้าและสถานที่',
  REPORTS: 'รายงาน',
  USERS: 'ผู้ใช้งานและสิทธิ์',
  ACTIVITY_LOG: 'Activity Log',
  SETTINGS: 'ตั้งค่า',
};

export type PermissionLevel = 'view' | 'manage';

export interface MenuPermission {
  menu: Menu;
  canView: boolean;
  canManage: boolean;
}

/** Keys of the seeded system roles. */
export const SystemRole = {
  ADMIN: 'ADMIN',
  STAFF: 'STAFF',
  COMMUNITY_MANAGER: 'COMMUNITY_MANAGER',
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];

/** "manage" always implies "view". */
export function hasPermission(
  permissions: readonly MenuPermission[],
  menu: Menu,
  level: PermissionLevel,
): boolean {
  const grant = permissions.find((p) => p.menu === menu);
  if (!grant) return false;
  return level === 'view' ? grant.canView || grant.canManage : grant.canManage;
}

/** Shape of GET /api/auth/me and of the user returned at login. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
  role: { id: string; key: string; name: string };
  permissions: MenuPermission[];
  scope: {
    all: boolean;
    communityIds: string[];
    locationIds: string[];
  };
}

export const PASSWORD_MIN_LENGTH = 8;
