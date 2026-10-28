import { MailOutlined } from '@ant-design/icons';
import {
  formatNumber,
  formatThaiDateTime,
  LOGIN_SECURITY_LIMITS,
  type SettingsValues,
} from '@getpoint/shared';
import { Alert, App, Button, Col, Descriptions, Form, Row, Space } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { type CheckResult, type SettingsPage, useTestEmail } from '../../api/settings';
import { AddonNumber } from '../../components/AddonNumber';
import { StatusPill } from '../../components/StatusPill';
import { SettingCard } from './SettingCard';
import { useSettingSave } from './useSettingSave';

interface TabProps {
  data: SettingsPage;
  canManage: boolean;
}

/** "1,234,567 bytes" → "1.2 MB" */
function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** "ระบบ" tab: email status with a test, and system information. */
export function SystemTab({ data, canManage }: TabProps) {
  const { message } = App.useApp();
  const test = useTestEmail();
  const [result, setResult] = useState<CheckResult | null>(null);
  const { email, system, loga } = data;

  const sendTest = async () => {
    setResult(null);
    try {
      setResult(await test.mutateAsync());
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Row gutter={[20, 20]}>
      <Col xs={24} xl={12}>
        <LoginSecurityCard data={data} canManage={canManage} />
      </Col>
      <Col xs={24} xl={12}>
        <SettingCard
          title="อีเมล (SMTP)"
          description="ใช้ส่งลิงก์รีเซ็ตรหัสผ่าน ค่าการเชื่อมต่อเก็บในไฟล์ .env ของเซิร์ฟเวอร์"
        >
          <Descriptions
            column={1}
            size="small"
            bordered
            styles={{ label: { width: 150 } }}
            items={[
              {
                label: 'สถานะ',
                children: email.configured ? (
                  <StatusPill tone="success">ตั้งค่าแล้ว</StatusPill>
                ) : (
                  <StatusPill tone="neutral">ยังไม่ได้ตั้งค่า</StatusPill>
                ),
              },
              { label: 'เซิร์ฟเวอร์', children: email.host ?? '-' },
              { label: 'ผู้ส่ง', children: email.from },
            ]}
          />
          {canManage && (
            <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
              <Button icon={<MailOutlined />} loading={test.isPending} onClick={sendTest}>
                ส่งอีเมลทดสอบถึงฉัน
              </Button>
              {result && (
                <Alert type={result.ok ? 'success' : 'error'} showIcon message={result.message} />
              )}
            </Space>
          )}
        </SettingCard>
      </Col>
      <Col xs={24} xl={12}>
        <SettingCard title="ข้อมูลระบบ">
          <Descriptions
            column={1}
            size="small"
            bordered
            styles={{ label: { width: 170 } }}
            items={[
              {
                label: 'ฐานข้อมูล',
                children:
                  system.database === 'up' ? (
                    <StatusPill tone="success">ปกติ</StatusPill>
                  ) : (
                    <StatusPill tone="danger">เชื่อมต่อไม่ได้</StatusPill>
                  ),
              },
              { label: 'สภาพแวดล้อม', children: system.environment },
              { label: 'Node.js', children: system.nodeVersion },
              { label: 'เริ่มทำงานเมื่อ', children: formatThaiDateTime(system.startedAt) },
              { label: 'ใบเสร็จทั้งหมด', children: `${formatNumber(system.receipts)} ใบ` },
              {
                label: 'พื้นที่ไฟล์ใบเสร็จ',
                children: `${size(system.storage.bytes)} (${formatNumber(system.storage.files)} ไฟล์)`,
              },
              {
                label: 'ส่งแต้มไป LOGA ล่าสุด',
                children: loga.transfers.lastSentAt
                  ? formatThaiDateTime(loga.transfers.lastSentAt)
                  : '-',
              },
            ]}
          />
        </SettingCard>
      </Col>
    </Row>
  );
}

/** Staff login: wrong passwords in a row before the account locks, and for how long. */
function LoginSecurityCard({ data, canManage }: TabProps) {
  const [form] = Form.useForm<SettingsValues['loginSecurity']>();
  const { save, saving, error } = useSettingSave('loginSecurity');
  const { maxFailedAttempts, lockMinutes } = LOGIN_SECURITY_LIMITS;
  return (
    <SettingCard
      title="ความปลอดภัยการเข้าสู่ระบบ"
      description="ใส่รหัสผ่านผิดติดกันครบจำนวนนี้ บัญชีจะถูกล็อกชั่วคราว ผู้ดูแลระบบปลดล็อกได้ที่หน้าผู้ใช้งาน หรือผู้ใช้ตั้งรหัสผ่านใหม่ผ่านอีเมล"
      settingKey="loginSecurity"
      changes={data.changes}
      error={error}
      saving={saving}
      onSave={
        canManage
          ? () =>
              form
                .validateFields()
                .then(save)
                .catch(() => {})
          : undefined
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={data.values.loginSecurity}
        disabled={!canManage}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="รหัสผ่านผิดได้"
              name="maxFailedAttempts"
              rules={[{ required: true, message: 'กรุณากรอกจำนวนครั้ง' }]}
            >
              <AddonNumber
                aria-label="จำนวนครั้งที่ใส่รหัสผ่านผิดได้"
                after="ครั้ง"
                min={maxFailedAttempts.min}
                max={maxFailedAttempts.max}
                precision={0}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="ล็อกบัญชีนาน"
              name="lockMinutes"
              rules={[{ required: true, message: 'กรุณากรอกระยะเวลา' }]}
            >
              <AddonNumber
                aria-label="ระยะเวลาล็อกบัญชี (นาที)"
                after="นาที"
                min={lockMinutes.min}
                max={lockMinutes.max}
                precision={0}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </SettingCard>
  );
}
