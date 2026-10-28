import { TagsOutlined } from '@ant-design/icons';
import type { SettingsValues } from '@getpoint/shared';
import { Button, Col, Form, Input, Row } from 'antd';
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
    </Row>
  );
}
