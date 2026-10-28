import type { ThemeConfig } from 'antd';

/** Colors picked from the GET POINT CMS mockups. */
export const colors = {
  brandRed: '#E3141B',
  ink: '#1F2430', // dark buttons, headings, active sidebar bar
  text: '#2B303B',
  textMuted: '#8A909C',
  border: '#E6E8EC',
  pageBg: '#F6F7F9',
  sidebarActiveBg: '#EEF0F3',
  success: '#22A45D',
  successBg: '#E9F7EF',
  warning: '#F29D12',
  warningBg: '#FEF4E2',
  danger: '#E5484D',
  dangerBg: '#FDECEC',
};

export const fontFamily = "'Noto Sans Thai Looped', 'Noto Sans Thai', system-ui, sans-serif";

export const theme: ThemeConfig = {
  token: {
    colorPrimary: colors.ink,
    colorError: colors.danger,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorText: colors.text,
    colorTextSecondary: colors.textMuted,
    colorBorder: colors.border,
    colorBorderSecondary: colors.border,
    colorBgLayout: colors.pageBg,
    borderRadius: 10,
    fontFamily,
    fontSize: 15,
  },
  components: {
    Layout: { siderBg: '#FFFFFF', headerBg: '#FFFFFF', bodyBg: colors.pageBg },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: colors.sidebarActiveBg,
      itemSelectedColor: colors.ink,
      itemHoverBg: colors.sidebarActiveBg,
      itemColor: colors.text,
      itemHeight: 52,
      itemBorderRadius: 10,
      iconSize: 22,
      fontSize: 16,
    },
    Card: { borderRadiusLG: 14 },
    Table: { headerBg: '#F2F3F5', headerColor: colors.text },
  },
};
