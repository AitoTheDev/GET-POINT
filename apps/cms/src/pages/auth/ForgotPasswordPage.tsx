import { MailOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Result } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiSend, errorMessage } from '../../api/client';
import { colors } from '../../theme';
import { AuthShell } from './AuthShell';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async ({ email }: { email: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      await apiSend('POST', '/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const backToLogin = (
    <Link to="/login" style={{ color: colors.brandRed, fontWeight: 600 }}>
      กลับไปหน้าเข้าสู่ระบบ
    </Link>
  );

  if (sent) {
    return (
      <AuthShell title="ตรวจสอบอีเมลของคุณ" footer={backToLogin}>
        <Result
          status="success"
          title="ส่งคำขอเรียบร้อยแล้ว"
          subTitle="หากอีเมลนี้มีอยู่ในระบบ คุณจะได้รับลิงก์สำหรับตั้งรหัสผ่านใหม่ ลิงก์ใช้ได้ภายใน 30 นาที"
        />
        <Alert
          type="info"
          showIcon
          message="หากไม่ได้รับอีเมล สามารถให้ผู้ดูแลระบบรีเซ็ตรหัสผ่านให้จากหน้าผู้ใช้งานและสิทธิ์"
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="ลืมรหัสผ่าน"
      subtitle="กรอกอีเมลที่ใช้เข้าสู่ระบบ เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้"
      footer={backToLogin}
    >
      <Form layout="vertical" size="large" requiredMark={false} onFinish={onFinish}>
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
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={submitting}
          className="gp-auth__submit"
        >
          ส่งลิงก์ตั้งรหัสผ่านใหม่
        </Button>
      </Form>
    </AuthShell>
  );
}
