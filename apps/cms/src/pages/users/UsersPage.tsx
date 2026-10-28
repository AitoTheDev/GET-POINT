import { PlusOutlined, SafetyOutlined, TeamOutlined } from '@ant-design/icons';
import { Menu } from '@getpoint/shared';
import { Button, Tabs } from 'antd';
import { useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { PageHeader } from '../../components/PageHeader';
import { CreateUserModal } from './CreateUserModal';
import { RolesTab } from './RolesTab';
import { TemporaryPasswordModal } from './TemporaryPasswordModal';
import { UsersTab } from './UsersTab';

type TabKey = 'users' | 'roles';

export function UsersPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<TabKey>('users');
  const [creating, setCreating] = useState(false);
  const [tempPassword, setTempPassword] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);

  return (
    <>
      <PageHeader
        title="ผู้ใช้งานและสิทธิ์"
        extra={
          can(Menu.USERS, 'manage') && (
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => setCreating(true)}
            >
              เพิ่มผู้ใช้งาน
            </Button>
          )
        }
      />

      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as TabKey)}
        type="card"
        size="large"
        items={[
          {
            key: 'users',
            label: (
              <span>
                <TeamOutlined /> ผู้ใช้งาน
              </span>
            ),
            children: (
              <UsersTab
                onEditRoles={() => setTab('roles')}
                onTemporaryPassword={(user, password) =>
                  setTempPassword({ name: user.name, email: user.email, password })
                }
              />
            ),
          },
          {
            key: 'roles',
            label: (
              <span>
                <SafetyOutlined /> บทบาทและสิทธิ์
              </span>
            ),
            children: <RolesTab />,
          },
        ]}
      />

      <CreateUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(user, password) => {
          setCreating(false);
          setTempPassword({ name: user.name, email: user.email, password });
        }}
      />
      <TemporaryPasswordModal value={tempPassword} onClose={() => setTempPassword(null)} />
    </>
  );
}
