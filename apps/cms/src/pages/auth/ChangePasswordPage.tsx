import { LockOutlined } from '@ant-design/icons';
import type { AuthUser } from '@getpoint/shared';
import { Alert, App, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiSend, errorMessage } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { colors } from '../../theme';
import { AuthShell } from './AuthShell';
import { confirmPasswordRules, newPasswordRules, PASSWORD_HINT } from './passwordRules';

interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
}

/**
 * Forced after an admin reset / new account (temporary password), and also reachable
 * from the user menu for a voluntary change.
 */
export function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const forced = Boolean(user?.mustChangePassword);

  const onFinish = async ({ currentPassword, newPassword }: ChangePasswordForm) => {
    setError(null);
    setSubmitting(true);
    try {
      // Only these two fields: the API rejects unknown ones such as confirmPassword.
      const updated = await apiSend<AuthUser>('POST', '/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setUser(updated);
      message.success('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const footer = forced ? (
    <a
      onClick={async () => {
        await logout();
        navigate('/login', { replace: true });
      }}
      style={{ color: colors.brandRed, fontWeight: 600 }}
    >
      ออกจากระบบ
    </a>
  ) : (
    <Link to="/" style={{ color: colors.brandRed, fontWeight: 600 }}>
      ยกเลิก กลับไปหน้าหลัก
    </Link>
  );

  return (
    <AuthShell
      title={forced ? 'ตั้งรหัสผ่านของคุณ' : 'เปลี่ยนรหัสผ่าน'}
      subtitle={PASSWORD_HINT}
      footer={footer}
    >
      <Form<ChangePasswordForm>
        layout="vertical"
        size="large"
        requiredMark={false}
        onFinish={onFinish}
      >
        {forced && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="คุณกำลังใช้รหัสผ่านชั่วคราว กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งานระบบ"
          />
        )}
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form.Item
          label={<strong>{forced ? 'รหัสผ่านชั่วคราว' : 'รหัสผ่านปัจจุบัน'}</strong>}
          name="currentPassword"
          rules={[{ required: true, message: 'กรุณากรอกรหัสผ่านปัจจุบัน' }]}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="current-password" autoFocus />
        </Form.Item>
        <Form.Item
          label={<strong>รหัสผ่านใหม่</strong>}
          name="newPassword"
          rules={newPasswordRules}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label={<strong>ยืนยันรหัสผ่านใหม่</strong>}
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={confirmPasswordRules()}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={submitting}
          className="gp-auth__submit"
        >
          บันทึกรหัสผ่านใหม่
        </Button>
      </Form>
    </AuthShell>
  );
}
