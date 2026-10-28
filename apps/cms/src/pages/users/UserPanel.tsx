import {
  ExportOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { formatThaiDateTime, Menu, SystemRole } from '@getpoint/shared';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Divider,
  Dropdown,
  Flex,
  Form,
  Select,
  Switch,
  Typography,
} from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type ScopeInput,
  type UserRow,
  useResetUserPassword,
  useRoles,
  useUnlockUser,
  useUpdateUser,
} from '../../api/users';
import { useAuth } from '../../auth/useAuth';
import { PermissionMatrix } from '../../components/PermissionMatrix';
import { colors } from '../../theme';
import { rowToScope } from './scope';
import { ScopePicker } from './ScopePicker';

interface UserPanelProps {
  /** Render with key={user.id} so the form resets when another user is selected. */
  user: UserRow;
  onEditRoles: () => void;
  onTemporaryPassword: (password: string) => void;
}

/** Right-hand "กำหนดสิทธิ์ผู้ใช้งาน" card from the mockup. */
export function UserPanel({ user, onEditRoles, onTemporaryPassword }: UserPanelProps) {
  const { user: me, can } = useAuth();
  const { message, modal } = App.useApp();
  const roles = useRoles();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();
  const unlock = useUnlockUser();

  const [roleId, setRoleId] = useState(user.role.id);
  const [scope, setScope] = useState<ScopeInput>(() => rowToScope(user));
  const [active, setActive] = useState(user.status === 'ACTIVE');
  const [error, setError] = useState<string | null>(null);

  /** "ยกเลิก": discard unsaved edits. */
  const revert = () => {
    setRoleId(user.role.id);
    setScope(rowToScope(user));
    setActive(user.status === 'ACTIVE');
    setError(null);
  };

  const canManage = can(Menu.USERS, 'manage');
  const isSelf = user.id === me?.id;
  const role = roles.data?.find((r) => r.id === roleId);
  const isAdminRole = role?.key === SystemRole.ADMIN;
  const scopeMissing =
    !isAdminRole && !scope.all && !scope.communityIds.length && !scope.locationIds.length;

  const save = async () => {
    setError(null);
    try {
      await updateUser.mutateAsync({
        id: user.id,
        roleId,
        status: active ? 'ACTIVE' : 'SUSPENDED',
        scope,
      });
      message.success('บันทึกสิทธิ์ผู้ใช้งานเรียบร้อยแล้ว');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const reset = (method: 'temporary' | 'email') =>
    modal.confirm({
      title: method === 'temporary' ? 'รีเซ็ตรหัสผ่านชั่วคราว?' : 'ส่งลิงก์ตั้งรหัสผ่านทางอีเมล?',
      content:
        method === 'temporary'
          ? `ระบบจะสร้างรหัสผ่านชั่วคราวใหม่ให้ ${user.name} และออกจากระบบทุกอุปกรณ์ของผู้ใช้งานนี้`
          : `ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${user.email}`,
      okText: 'ยืนยัน',
      cancelText: 'ยกเลิก',
      onOk: async () => {
        try {
          const result = await resetPassword.mutateAsync({ id: user.id, method });
          if (result.method === 'temporary') {
            onTemporaryPassword(result.temporaryPassword);
          } else if (result.emailConfigured) {
            message.success(`ส่งลิงก์ไปที่ ${user.email} แล้ว`);
          } else {
            message.warning('ยังไม่ได้ตั้งค่าอีเมล (SMTP) ลิงก์ถูกแสดงในหน้าต่าง API แทน', 6);
          }
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });

  return (
    <Card style={{ height: '100%' }} styles={{ body: { padding: 24 } }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        กำหนดสิทธิ์ผู้ใช้งาน
      </Typography.Title>

      <Flex gap={16} align="center" style={{ marginBottom: 16 }}>
        <Avatar size={64} icon={<UserOutlined />} style={{ background: '#D9DCE1' }} />
        <div>
          <Typography.Text strong style={{ fontSize: 18 }}>
            {user.name}
          </Typography.Text>
          <br />
          <Typography.Text type="secondary">{user.email}</Typography.Text>
        </div>
      </Flex>
      <Divider style={{ margin: '8px 0 16px' }} />

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {user.lockedUntil && (
        <Alert
          type="warning"
          showIcon
          icon={<LockOutlined />}
          style={{ marginBottom: 16 }}
          message={`บัญชีถูกล็อกถึง ${formatThaiDateTime(user.lockedUntil)} (ใส่รหัสผ่านผิดหลายครั้ง)`}
          action={
            canManage && (
              <Button
                size="small"
                loading={unlock.isPending}
                onClick={() =>
                  unlock
                    .mutateAsync(user.id)
                    .then(() => message.success(`ปลดล็อก ${user.name} แล้ว`))
                    .catch((err: unknown) => message.error(errorMessage(err)))
                }
              >
                ปลดล็อก
              </Button>
            )
          }
        />
      )}
      {isSelf && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="ไม่สามารถเปลี่ยนบทบาทหรือระงับบัญชีของตัวเองได้"
        />
      )}

      <Form layout="horizontal" labelCol={{ flex: '130px' }} labelAlign="left" colon={false}>
        <Form.Item label="บทบาท" style={{ marginBottom: 12 }}>
          <Select
            aria-label="บทบาท"
            value={roleId}
            onChange={setRoleId}
            disabled={!canManage || isSelf}
            loading={roles.isLoading}
            options={roles.data?.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>
        <Form.Item
          label="สถานที่ที่เข้าถึงได้"
          style={{ marginBottom: 12 }}
          validateStatus={scopeMissing ? 'error' : undefined}
          help={scopeMissing ? 'กรุณาเลือกสถานที่อย่างน้อย 1 แห่ง' : undefined}
        >
          <ScopePicker
            value={scope}
            onChange={setScope}
            forceAll={isAdminRole}
            disabled={!canManage}
          />
        </Form.Item>
        <Form.Item label="สถานะบัญชี" style={{ marginBottom: 0 }}>
          <Flex align="center" gap={12}>
            <Switch
              aria-label="สถานะบัญชี"
              checked={active}
              onChange={setActive}
              disabled={!canManage || isSelf}
            />
            <span>{active ? 'เปิดใช้งาน' : 'ระงับ'}</span>
          </Flex>
        </Form.Item>
      </Form>

      <Divider style={{ margin: '16px 0' }} />
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        สิทธิ์ตามบทบาท
      </Typography.Title>
      {role && <PermissionMatrix value={role.permissions} />}

      <Flex
        gap={8}
        align="center"
        style={{
          background: colors.pageBg,
          borderRadius: 10,
          padding: '10px 14px',
          margin: '12px 0',
        }}
      >
        <InfoCircleOutlined style={{ color: colors.textMuted }} />
        <Typography.Text type="secondary">สิทธิ์มีผลเฉพาะสถานที่ที่กำหนด</Typography.Text>
      </Flex>

      <Flex justify="space-between" align="center" wrap gap={8}>
        <Flex gap={12} align="center" wrap>
          <Button
            type="link"
            icon={<SettingOutlined />}
            onClick={onEditRoles}
            style={{ padding: 0 }}
          >
            แก้ไขบทบาทและสิทธิ์ <ExportOutlined />
          </Button>
          {canManage && user.status === 'ACTIVE' && (
            <Dropdown
              menu={{
                items: [
                  { key: 'temporary', icon: <KeyOutlined />, label: 'สร้างรหัสผ่านชั่วคราว' },
                  { key: 'email', icon: <MailOutlined />, label: 'ส่งลิงก์ตั้งรหัสผ่านทางอีเมล' },
                ],
                onClick: ({ key }) => reset(key as 'temporary' | 'email'),
              }}
            >
              <Button icon={<KeyOutlined />}>รีเซ็ตรหัสผ่าน</Button>
            </Dropdown>
          )}
        </Flex>
        {canManage && (
          <Flex gap={8}>
            <Button size="large" onClick={revert}>
              ยกเลิก
            </Button>
            <Button
              size="large"
              type="primary"
              onClick={save}
              loading={updateUser.isPending}
              disabled={scopeMissing}
            >
              บันทึก
            </Button>
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
