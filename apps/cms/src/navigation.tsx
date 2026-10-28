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
import { Menu, MenuLabel } from '@getpoint/shared';
import type { ReactNode } from 'react';

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  /** Menu permission needed to see this page. */
  menu: Menu;
  /** Session that delivers this page; shown on placeholders until then. */
  session: number;
}

const item = (path: string, menu: Menu, icon: ReactNode, session: number): NavItem => ({
  path,
  label: MenuLabel[menu],
  icon,
  menu,
  session,
});

/** Sidebar order and labels follow the mockups. */
export const mainNav: NavItem[] = [
  item('/', Menu.DASHBOARD, <HomeOutlined />, 7),
  item('/receipts/review', Menu.RECEIPT_REVIEW, <FileSearchOutlined />, 5),
  item('/receipts/history', Menu.RECEIPT_HISTORY, <HistoryOutlined />, 5),
  item('/members', Menu.MEMBERS, <TeamOutlined />, 3),
  item('/point-rules', Menu.POINT_RULES, <DatabaseOutlined />, 4),
  item('/shops', Menu.SHOPS, <ShopOutlined />, 2),
  item('/reports', Menu.REPORTS, <BarChartOutlined />, 7),
  item('/users', Menu.USERS, <UserSwitchOutlined />, 1),
  item('/activity-log', Menu.ACTIVITY_LOG, <FileTextOutlined />, 7),
];

export const settingsNav: NavItem = item('/settings', Menu.SETTINGS, <SettingOutlined />, 6);

export const allNav = [...mainNav, settingsNav];

export const findNavItem = (pathname: string): NavItem | undefined =>
  allNav.find((nav) => (nav.path === '/' ? pathname === '/' : pathname.startsWith(nav.path)));
