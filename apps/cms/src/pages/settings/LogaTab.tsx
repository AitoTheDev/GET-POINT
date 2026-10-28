import { ApiOutlined } from '@ant-design/icons';
import {
  formatNumber,
  formatThaiDateTime,
  RETRY_LIMIT_CAPS,
  renderRemark,
  type SettingsValues,
} from '@getpoint/shared';
import { Alert, Button, Col, Descriptions, Form, Input, Radio, Row, Space, Typography } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type CheckResult,
  type MockTransferMode,
  type SettingsPage,
  useMockMode,
  useTestLoga,
} from '../../api/settings';
import { AddonNumber } from '../../components/AddonNumber';
import { StatCard } from '../../components/StatCard';
import { SettingCard } from './SettingCard';
import { useSettingSave } from './useSettingSave';

const MOCK_MODES: { value: MockTransferMode; label: string; help: string }[] = [
  { value: 'SUCCESS', label: 'ปกติ', help: 'LOGA เพิ่มแต้มสำเร็จ' },
  { value: 'FAIL', label: 'LOGA ปฏิเสธ', help: 'LOGA ตอบกลับข้อผิดพลาด: ส่งไม่สำเร็จ' },
  { value: 'TIMEOUT', label: 'หมดเวลา', help: 'LOGA ไม่ตอบ และไม่ได้เพิ่มแต้ม: ไม่ทราบผล' },
  {
    value: 'LOST_RESPONSE',
    label: 'คำตอบหาย',
    help: 'LOGA เพิ่มแต้มแล้วแต่คำตอบหาย: ไม่ทราบผล (ส่งซ้ำแล้วต้องไม่ได้แต้มซ้ำ)',
  },
];

interface TabProps {
  data: SettingsPage;
  canManage: boolean;
}

/** "LOGA และการส่งแต้ม" tab. */
export function LogaTab({ data, canManage }: TabProps) {
  const { loga } = data;
  return (
    <Row gutter={[20, 20]}>
      <Col xs={24} xl={12}>
        <ConnectionCard data={data} canManage={canManage} />
      </Col>
      <Col xs={24} xl={12}>
        <SettingCard title="สถานะการส่งแต้ม">
          <Row gutter={[12, 12]}>
            <Col xs={12}>
              <StatCard
                icon={<ApiOutlined />}
                label="รอส่ง"
                value={loga.transfers.pending}
                tone="warning"
              />
            </Col>
            <Col xs={12}>
              <StatCard
                icon={<ApiOutlined />}
                label="ส่งสำเร็จ"
                value={loga.transfers.succeeded}
                tone="success"
              />
            </Col>
            <Col xs={12}>
              <StatCard
                icon={<ApiOutlined />}
                label="ส่งไม่สำเร็จ"
                value={loga.transfers.failed}
                tone="danger"
              />
            </Col>
            <Col xs={12}>
              <StatCard
                icon={<ApiOutlined />}
                label="ไม่ทราบผล"
                value={loga.transfers.unknown}
                tone="warning"
              />
            </Col>
          </Row>
          <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0' }}>
            ส่งสำเร็จล่าสุด:{' '}
            {loga.transfers.lastSentAt ? formatThaiDateTime(loga.transfers.lastSentAt) : 'ยังไม่มี'}
            {' · '}ดูรายการที่ส่งไม่สำเร็จได้ที่หน้าประวัติใบเสร็จ (กรองตามการส่งแต้ม)
          </Typography.Paragraph>
        </SettingCard>
      </Col>
      {loga.mode === 'mock' && (
        <Col xs={24}>
          <MockModeCard current={loga.mockTransferMode} canManage={canManage} />
        </Col>
      )}
      <Col xs={24} xl={12}>
        <RetryCard data={data} canManage={canManage} />
      </Col>
      <Col xs={24} xl={12}>
        <RemarkCard data={data} canManage={canManage} />
      </Col>
    </Row>
  );
}

function ConnectionCard({ data, canManage }: TabProps) {
  const { loga } = data;
  const test = useTestLoga();
  const [result, setResult] = useState<CheckResult | null>(null);

  const run = async () => {
    setResult(null);
    try {
      setResult(await test.mutateAsync());
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
    }
  };

  return (
    <SettingCard
      title="การเชื่อมต่อ LOGA"
      description="ค่าการเชื่อมต่อเก็บในไฟล์ .env ของเซิร์ฟเวอร์ (ไม่แสดงรหัสผ่านในหน้านี้เพื่อความปลอดภัย)"
    >
      <Descriptions
        column={1}
        size="small"
        bordered
        styles={{ label: { width: 170 } }}
        items={[
          {
            label: 'โหมด',
            children: loga.mode === 'mock' ? 'LOGA จำลอง (สำหรับทดสอบ)' : 'LOGA จริง',
          },
          { label: 'ที่อยู่ API', children: loga.baseUrl },
          { label: 'Card ID', children: loga.cardId ?? '-' },
          { label: 'ชื่ออุปกรณ์ (uuid)', children: loga.deviceId },
          {
            label: 'ชื่อผู้ใช้/รหัสผ่าน',
            children: loga.credentialsSet ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า',
          },
        ]}
      />
      {canManage && (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <Button icon={<ApiOutlined />} loading={test.isPending} onClick={run}>
            ทดสอบการเชื่อมต่อ
          </Button>
          {result && (
            <Alert
              type={result.ok ? 'success' : 'error'}
              showIcon
              message={result.message}
              description={
                result.ok &&
                `บัตร: ${result.cardName ?? '-'}${result.durationMs !== undefined ? ` · ${formatNumber(result.durationMs)} ms` : ''}`
              }
            />
          )}
        </Space>
      )}
    </SettingCard>
  );
}

function MockModeCard({
  current,
  canManage,
}: {
  current: MockTransferMode | null;
  canManage: boolean;
}) {
  const mode = useMockMode();
  return (
    <SettingCard
      title="LOGA จำลอง: ผลการส่งแต้ม"
      description="ใช้ทดสอบเท่านั้น เลือกว่า LOGA จำลองจะตอบอย่างไรเมื่อส่งแต้ม (กลับเป็น “ปกติ” เมื่อเซิร์ฟเวอร์เริ่มใหม่)"
    >
      <Radio.Group
        value={current}
        disabled={!canManage || mode.isPending}
        onChange={(e) => mode.mutate(e.target.value)}
      >
        <Space direction="vertical">
          {MOCK_MODES.map((m) => (
            <Radio key={m.value} value={m.value}>
              <Typography.Text strong>{m.label}</Typography.Text>{' '}
              <Typography.Text type="secondary">— {m.help}</Typography.Text>
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </SettingCard>
  );
}

function RetryCard({ data, canManage }: TabProps) {
  const [form] = Form.useForm<SettingsValues['transferRetry']>();
  const { save, saving, error } = useSettingSave('transferRetry');
  return (
    <SettingCard
      title="การส่งซ้ำอัตโนมัติ"
      description="ถ้าส่งแต้มไม่สำเร็จ ระบบจะลองส่งใหม่เองตามจำนวนครั้งนี้ จากนั้นรอเจ้าหน้าที่กด “ส่งอีกครั้ง”"
      settingKey="transferRetry"
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
        initialValues={data.values.transferRetry}
        disabled={!canManage}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="ส่งสูงสุด"
              name="maxAttempts"
              rules={[{ required: true, message: 'กรุณากรอกจำนวนครั้ง' }]}
            >
              <AddonNumber
                aria-label="จำนวนครั้งที่ส่งสูงสุด"
                after="ครั้ง"
                min={1}
                max={RETRY_LIMIT_CAPS.maxAttempts}
                precision={0}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="เว้นระยะ"
              name="intervalMinutes"
              rules={[{ required: true, message: 'กรุณากรอกระยะห่าง' }]}
            >
              <AddonNumber
                aria-label="ระยะห่างระหว่างการส่ง (นาที)"
                after="นาที"
                min={1}
                max={RETRY_LIMIT_CAPS.intervalMinutes}
                precision={0}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </SettingCard>
  );
}

function RemarkCard({ data, canManage }: TabProps) {
  const [form] = Form.useForm<{ remark: string }>();
  const { save, saving, error } = useSettingSave('transferRemark');
  const remark: string = Form.useWatch('remark', form) ?? data.values.transferRemark;
  return (
    <SettingCard
      title="ข้อความที่สมาชิกเห็นใน LOGA"
      description="ใช้ {code} แทนเลขรายการใบเสร็จ และ {shop} แทนชื่อร้านค้า"
      settingKey="transferRemark"
      changes={data.changes}
      error={error}
      saving={saving}
      onSave={
        canManage
          ? () =>
              form
                .validateFields()
                .then((v) => save(v.remark))
                .catch(() => {})
          : undefined
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ remark: data.values.transferRemark }}
        disabled={!canManage}
      >
        <Form.Item
          name="remark"
          rules={[{ required: true, whitespace: true, message: 'กรุณากรอกข้อความ' }]}
        >
          <Input aria-label="ข้อความที่สมาชิกเห็นใน LOGA" maxLength={150} showCount />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">
        ตัวอย่าง: “{renderRemark(remark, { code: 'GP001', shop: 'ร้านกาแฟ A' })}”
      </Typography.Text>
    </SettingCard>
  );
}
