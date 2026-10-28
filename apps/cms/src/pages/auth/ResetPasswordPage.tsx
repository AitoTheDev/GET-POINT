import { LockOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Result } from 'antd';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiSend, errorMessage } from '../../api/client';
import { colors } from '../../theme';
import { AuthShell } from './AuthShell';
import { confirmPasswordRules, newPasswordRules, PASSWORD_HINT } from './passwordRules';

/** Opened from the link in the "forgot password" email. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const backToLogin = (
    <Link to="/login" style={{ color: colors.brandRed, fontWeight: 600 }}>
      กลับไปหน้าเข้าสู่ระบบ
    </Link>
  );

  if (!token) {
    return (
      <AuthShell title="ตั้งรหัสผ่านใหม่" footer={backToLogin}>
        <Result
          status="warning"
          title="ลิงก์ไม่ถูกต้อง"
          subTitle="กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง"
        />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="ตั้งรหัสผ่านใหม่">
        <Result
          status="success"
          title="ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว"
          subTitle="กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่"
          extra={
            <Button
              type="primary"
              size="large"
              onClick={() => navigate('/login', { replace: true })}
            >
              เข้าสู่ระบบ
            </Button>
          }
        />
      </AuthShell>
    );
  }

  const onFinish = async ({ newPassword }: { newPassword: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      await apiSend('POST', '/auth/reset-password', { token, newPassword });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="ตั้งรหัสผ่านใหม่" subtitle={PASSWORD_HINT} footer={backToLogin}>
      <Form layout="vertical" size="large" requiredMark={false} onFinish={onFinish}>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form.Item
          label={<strong>รหัสผ่านใหม่</strong>}
          name="newPassword"
          rules={newPasswordRules}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" autoFocus />
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
