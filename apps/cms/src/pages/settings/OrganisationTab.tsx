import { TagsOutlined } from '@ant-design/icons';
import type { SettingsValues } from '@getpoint/shared';
import { Alert, Button, Col, Descriptions, Form, Input, Row, Switch, Typography } from 'antd';
import { useState } from 'react';
import type { SettingsPage } from '../../api/settings';
import { CategoriesModal } from '../shops/CategoriesModal';
import { SettingCard } from './SettingCard';
import { useSettingSave } from './useSettingSave';

interface TabProps {
  data: SettingsPage;
  canManage: boolean;
}

/** "องค์กร" tab: support contact and shop categories. */
export function OrganisationTab({ data, canManage }: TabProps) {
  const [form] = Form.useForm<SettingsValues['supportContact']>();
  const { save, saving, error } = useSettingSave('supportContact');
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  return (
    <Row gutter={[20, 20]}>
      <Col xs={24} xl={12}>
        <SettingCard
          title="ช่องทางติดต่อสำหรับสมาชิก"
          description="แสดงให้สมาชิกใน LINE เมื่อใบเสร็จไม่ผ่านการตรวจสอบหรือต้องการความช่วยเหลือ"
          settingKey="supportContact"
          changes={data.changes}
          error={error}
          saving={saving}
          onSave={
            canManage
              ? () =>
                  form
                    .validateFields()
                    .then((v) =>
                      save({ phone: v.phone?.trim() || null, lineId: v.lineId?.trim() || null }),
                    )
                    .catch(() => {})
              : undefined
          }
        >
          <Form
            form={form}
            layout="vertical"
            disabled={!canManage}
            initialValues={{
              phone: data.values.supportContact.phone ?? undefined,
              lineId: data.values.supportContact.lineId ?? undefined,
            }}
          >
            <Form.Item
              label="เบอร์โทรศัพท์"
              name="phone"
              rules={[
                {
                  pattern: /^0[\d\s-]{8,11}$/,
                  message: 'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0',
                },
              ]}
            >
              <Input maxLength={20} placeholder="เช่น 02-123-4567" />
            </Form.Item>
            <Form.Item label="LINE ID" name="lineId">
              <Input maxLength={50} placeholder="เช่น @getpoint" />
            </Form.Item>
          </Form>
        </SettingCard>
      </Col>
      <Col xs={24} xl={12}>
        <SettingCard
          title="หมวดหมู่ร้านค้า"
          description="หมวดหมู่ที่เลือกได้เมื่อเพิ่มหรือแก้ไขร้านค้า (ย้ายมาจากหน้าร้านค้าและสถานที่)"
        >
          {canManage && (
            <Button icon={<TagsOutlined />} onClick={() => setCategoriesOpen(true)}>
              จัดการหมวดหมู่ร้านค้า
            </Button>
          )}
        </SettingCard>
        {canManage && (
          <CategoriesModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
        )}
      </Col>
      <Col xs={24} xl={12}>
        <MemberSignupCard data={data} canManage={canManage} />
      </Col>
    </Row>
  );
}

/** Sign-up in the LINE member app: LINE connection status and the SMS phone check switch. */
function MemberSignupCard({ data, canManage }: TabProps) {
  const { save, saving, error } = useSettingSave('memberSignup');
  const [verifyPhone, setVerifyPhone] = useState(data.values.memberSignup.verifyPhone);
  const { line, sms } = data;
  return (
    <SettingCard
      title="สมัครสมาชิกผ่าน LINE"
      description="สมาชิกสมัครเองในแอป LINE (LIFF) ด้วยเบอร์โทร ชื่อ และ Community"
      settingKey="memberSignup"
      changes={data.changes}
      error={error}
      saving={saving}
      onSave={canManage ? () => save({ verifyPhone }) : undefined}
    >
      <Descriptions
        column={1}
        size="small"
        bordered
        styles={{ label: { width: 170 } }}
        items={[
          {
            label: 'การเข้าสู่ระบบ LINE',
            children:
              line.mode === 'mock' ? 'LINE จำลอง (สำหรับทดสอบ ไม่ต้องใช้ LINE จริง)' : 'LINE จริง',
          },
          { label: 'LIFF ID', children: line.liffId ?? 'ยังไม่ได้ตั้งค่า' },
          {
            label: 'LINE Login Channel',
            children: line.channelIdSet ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า',
          },
          {
            label: 'ผู้ให้บริการ SMS',
            children:
              sms.provider === 'mock' ? 'SMS จำลอง (รหัสแสดงใน log ของเซิร์ฟเวอร์)' : sms.provider,
          },
        ]}
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 16 }}>
        <Switch
          id="verifyPhone"
          checked={verifyPhone}
          disabled={!canManage}
          onChange={setVerifyPhone}
        />
        <label htmlFor="verifyPhone" style={{ cursor: canManage ? 'pointer' : undefined }}>
          <Typography.Text strong>ยืนยันเบอร์โทรด้วยรหัส SMS ตอนสมัคร</Typography.Text>
          <br />
          <Typography.Text type="secondary">
            ปิดอยู่: ใช้เบอร์ที่สมาชิกกรอกได้ทันที · เปิด: ต้องกรอกรหัส 6
            หลักที่ส่งไปยังเบอร์นั้นก่อน
          </Typography.Text>
        </label>
      </div>
      {verifyPhone && !sms.ready && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="ยังไม่มีผู้ให้บริการ SMS ที่ใช้งานจริง สมาชิกจะสมัครไม่ได้จนกว่าจะตั้งค่า SMS"
        />
      )}
    </SettingCard>
  );
}
