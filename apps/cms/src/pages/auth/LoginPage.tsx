import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Flex, Form, Input } from 'antd';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { colors } from '../../theme';
import { AuthShell } from './AuthShell';

interface LoginForm {
  email: string;
  password: string;
  rememberMe: boolean;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async (values: LoginForm) => {
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(values.email, values.password, values.rememberMe);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(user.mustChangePassword ? '/change-password' : (from ?? '/'), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="เข้าสู่ระบบ CMS"
      subtitle="สำหรับผู้ดูแลระบบ"
      footer="ติดต่อผู้ดูแลระบบ หากไม่สามารถเข้าสู่ระบบได้"
    >
      <Form<LoginForm>
        layout="vertical"
        size="large"
        requiredMark={false}
        initialValues={{ rememberMe: false }}
        onFinish={onFinish}
      >
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

        <Form.Item
          label={<strong>อีเมล</strong>}
          name="email"
          rules={[
            { required: true, message: 'กรุณากรอกอีเมล' },
            { type: 'email', message: 'รูปแบบอีเมลไม่ถูกต้อง' },
          ]}
        >
          <Input
            prefix={<MailOutlined style={{ color: colors.textMuted }} />}
            placeholder="name@company.com"
            autoComplete="username"
            autoFocus
          />
        </Form.Item>

        <Form.Item
          label={<strong>รหัสผ่าน</strong>}
          name="password"
          rules={[{ required: true, message: 'กรุณากรอกรหัสผ่าน' }]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: colors.textMuted }} />}
            placeholder="รหัสผ่าน"
            autoComplete="current-password"
          />
        </Form.Item>

        <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
          <Form.Item name="rememberMe" valuePropName="checked" noStyle>
            <Checkbox>จดจำการเข้าสู่ระบบ</Checkbox>
          </Form.Item>
          <Link to="/forgot-password" style={{ color: colors.brandRed, fontWeight: 600 }}>
            ลืมรหัสผ่าน?
          </Link>
        </Flex>

        <Button
          type="primary"
          htmlType="submit"
          block
          loading={submitting}
          className="gp-auth__submit"
        >
          เข้าสู่ระบบ
        </Button>
      </Form>
    </AuthShell>
  );
}
