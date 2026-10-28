import { BellOutlined, DownOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { App, Avatar, Badge, Divider, Dropdown, Layout, Menu, Space, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import { findNavItem, mainNav, settingsNav } from '../navigation';
import { colors } from '../theme';

const { Sider, Header, Content } = Layout;

const SIDER_WIDTH = 270;

export function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const current = findNavItem(pathname);

  const logout = () => message.info('การเข้าสู่ระบบจะเปิดใช้งานใน Session 1');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        className="gp-sider"
        width={SIDER_WIDTH}
        breakpoint="lg"
        collapsedWidth={0}
        style={{ borderRight: `1px solid ${colors.border}`, position: 'sticky', top: 0, height: '100vh' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 12px' }}>
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
            items={mainNav.map((item) => ({ key: item.path, icon: item.icon, label: item.label }))}
            style={{ flex: 1, overflowY: 'auto' }}
          />

          <Divider style={{ margin: '12px 0' }} />
          <Menu
            mode="inline"
            selectedKeys={current?.path === settingsNav.path ? [settingsNav.path] : []}
            onClick={({ key }) => (key === 'logout' ? logout() : navigate(key))}
            items={[
              { key: settingsNav.path, icon: settingsNav.icon, label: settingsNav.label },
              { key: 'logout', icon: <LogoutOutlined />, label: 'ออกจากระบบ' },
            ]}
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
            <Badge dot color={colors.brandRed} offset={[-3, 3]}>
              <BellOutlined style={{ fontSize: 24, color: colors.ink, cursor: 'pointer' }} />
            </Badge>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'ออกจากระบบ' }],
                onClick: logout,
              }}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size={44} icon={<UserOutlined />} style={{ background: '#D9DCE1' }} />
                <Typography.Text style={{ fontSize: 16 }}>Admin</Typography.Text>
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
