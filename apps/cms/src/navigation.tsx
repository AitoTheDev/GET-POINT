import {
  BarChartOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HistoryOutlined,
  HomeOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  /** Session that delivers this page; shown on placeholders until then. */
  session: number;
}

/** Sidebar order and labels follow the mockups. */
export const mainNav: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <HomeOutlined />, session: 7 },
  { path: '/receipts/review', label: 'ตรวจสอบใบเสร็จ', icon: <FileSearchOutlined />, session: 5 },
  { path: '/receipts/history', label: 'ประวัติใบเสร็จ', icon: <HistoryOutlined />, session: 5 },
  { path: '/members', label: 'สมาชิก', icon: <TeamOutlined />, session: 3 },
  { path: '/point-rules', label: 'เงื่อนไขการให้แต้ม', icon: <DatabaseOutlined />, session: 4 },
  { path: '/shops', label: 'ร้านค้าและสถานที่', icon: <ShopOutlined />, session: 2 },
  { path: '/reports', label: 'รายงาน', icon: <BarChartOutlined />, session: 7 },
  { path: '/users', label: 'ผู้ใช้งานและสิทธิ์', icon: <UserSwitchOutlined />, session: 1 },
  { path: '/activity-log', label: 'Activity Log', icon: <FileTextOutlined />, session: 7 },
];

export const settingsNav: NavItem = {
  path: '/settings',
  label: 'ตั้งค่า',
  icon: <SettingOutlined />,
  session: 6,
};

export const findNavItem = (pathname: string): NavItem | undefined =>
  [...mainNav, settingsNav].find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  );
