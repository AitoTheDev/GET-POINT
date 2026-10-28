import { DownOutlined, KeyOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Divider, Dropdown, Flex, Layout, Menu, Space, Typography } from 'antd';
import { Menu as MenuKey } from '@getpoint/shared';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useReceiptSummary } from '../api/receipts';
import logo from '../assets/logo.png';
import { useAuth } from '../auth/useAuth';
import { findNavItem, mainNav, settingsNav } from '../navigation';
import { colors } from '../theme';
import { NotificationBell } from './NotificationBell';

const { Sider, Header, Content } = Layout;

const SIDER_WIDTH = 270;

export function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, can, logout } = useAuth();
  const current = findNavItem(pathname);

  const visibleNav = mainNav.filter((item) => can(item.menu));
  // Orange count next to ตรวจสอบใบเสร็จ, like the mockup.
  const pending = useReceiptSummary(can(MenuKey.RECEIPT_REVIEW)).data?.PENDING_REVIEW ?? 0;
  const bottomItems = [
    ...(can(settingsNav.menu)
      ? [{ key: settingsNav.path, icon: settingsNav.icon, label: settingsNav.label }]
      : []),
    { key: 'logout', icon: <LogoutOutlined />, label: 'ออกจากระบบ' },
  ];

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        className="gp-sider"
        width={SIDER_WIDTH}
        breakpoint="lg"
        collapsedWidth={0}
        style={{
          borderRight: `1px solid ${colors.border}`,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 12px' }}
        >
          <img
            src={logo}
            alt="GET POINT"
            style={{ width: 170, margin: '0 0 24px 20px', cursor: 'pointer' }}
            onClick={() => navigate('/')}
          />

          <Menu
            mode="inline"
            selectedKeys={current ? [current.path] : []}
            onClick={({ key }) => navigate(key)}
            items={visibleNav.map((item) => ({
              key: item.path,
              icon: item.icon,
              label:
                item.menu === MenuKey.RECEIPT_REVIEW && pending > 0 ? (
                  <Flex justify="space-between" align="center">
                    {item.label}
                    <span
                      aria-label={`รอตรวจสอบ ${pending} ใบ`}
                      style={{
                        background: colors.warningBg,
                        color: colors.warning,
                        borderRadius: 999,
                        padding: '0 10px',
                        lineHeight: '26px',
                        fontWeight: 700,
                      }}
                    >
                      {pending > 99 ? '99+' : pending}
                    </span>
                  </Flex>
                ) : (
                  item.label
                ),
            }))}
            style={{ flex: 1, overflowY: 'auto' }}
          />

          <Divider style={{ margin: '12px 0' }} />
          <Menu
            mode="inline"
            selectedKeys={current?.path === settingsNav.path ? [settingsNav.path] : []}
            onClick={({ key }) => (key === 'logout' ? onLogout() : navigate(key))}
            items={bottomItems}
          />
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            height: 76,
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${colors.border}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Typography.Title level={3} style={{ margin: 0, fontWeight: 700 }}>
            {current?.label ?? ''}
          </Typography.Title>

          <Space size={28}>
            <NotificationBell />
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'change-password', icon: <KeyOutlined />, label: 'เปลี่ยนรหัสผ่าน' },
                  { type: 'divider' },
                  { key: 'logout', icon: <LogoutOutlined />, label: 'ออกจากระบบ', danger: true },
                ],
                onClick: ({ key }) =>
                  key === 'logout' ? onLogout() : navigate('/change-password'),
              }}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size={44} icon={<UserOutlined />} style={{ background: '#D9DCE1' }} />
                <Flex vertical style={{ lineHeight: 1.25 }}>
                  <Typography.Text style={{ fontSize: 16 }}>{user?.name}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {user?.role.name}
                  </Typography.Text>
                </Flex>
                <DownOutlined style={{ fontSize: 12 }} />
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ padding: '28px 32px' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
