import {
  type RejectReason,
  type RejectReasonSetting,
  REJECT_REASONS,
  type SettingsValues,
  UPLOAD_LIMIT_CAPS,
} from '@getpoint/shared';
import { Checkbox, Col, Flex, Form, Input, Row, Switch, Table, Tooltip } from 'antd';
import { useState } from 'react';
import type { SettingsPage } from '../../api/settings';
import { AddonNumber } from '../../components/AddonNumber';
import { SettingCard } from './SettingCard';
import { useSettingSave } from './useSettingSave';

interface TabProps {
  data: SettingsPage;
  canManage: boolean;
}

/** "ใบเสร็จ" tab: reject reasons, upload limits, default receipt age. */
export function ReceiptsTab({ data, canManage }: TabProps) {
  return (
    <Row gutter={[20, 20]}>
      <Col xs={24}>
        <RejectReasonsCard data={data} canManage={canManage} />
      </Col>
      <Col xs={24} xl={12}>
        <UploadLimitsCard data={data} canManage={canManage} />
      </Col>
      <Col xs={24} xl={12}>
        <DefaultClaimDaysCard data={data} canManage={canManage} />
      </Col>
    </Row>
  );
}

type Row = RejectReasonSetting & { reason: RejectReason };

function RejectReasonsCard({ data, canManage }: TabProps) {
  const { save, saving, error } = useSettingSave('rejectReasons');
  const [rows, setRows] = useState<Row[]>(() =>
    REJECT_REASONS.map((reason) => ({ reason, ...data.values.rejectReasons[reason] })).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
  );
  const update = (reason: RejectReason, patch: Partial<RejectReasonSetting>) =>
    setRows((list) => list.map((r) => (r.reason === reason ? { ...r, ...patch } : r)));

  const submit = () =>
    save(
      Object.fromEntries(
        rows.map(({ reason, ...setting }) => [reason, setting]),
      ) as SettingsValues['rejectReasons'],
    );

  return (
    <SettingCard
      title="เหตุผลที่ไม่อนุมัติ"
      description="แก้ไขข้อความที่เจ้าหน้าที่เลือก และข้อความที่สมาชิกจะเห็นใน LINE · ปิดเหตุผลที่ไม่ใช้ได้ (ยกเว้น “อื่นๆ” ซึ่งต้องเปิดไว้เสมอ)"
      settingKey="rejectReasons"
      changes={data.changes}
      error={error}
      saving={saving}
      onSave={canManage ? submit : undefined}
    >
      <Table<Row>
        rowKey="reason"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={rows}
        columns={[
          {
            title: 'ลำดับ',
            width: 90,
            render: (_, r) => (
              <AddonNumber
                aria-label={`ลำดับ ${r.label}`}
                min={1}
                max={99}
                precision={0}
                value={r.sortOrder}
                disabled={!canManage}
                onChange={(v) => v && update(r.reason, { sortOrder: v })}
                style={{ width: 70 }}
              />
            ),
          },
          {
            title: 'เหตุผล (เจ้าหน้าที่เห็น)',
            render: (_, r) => (
              <Input
                aria-label={`ชื่อเหตุผล ${r.reason}`}
                value={r.label}
                maxLength={100}
                disabled={!canManage}
                onChange={(e) => update(r.reason, { label: e.target.value })}
                style={{ minWidth: 220 }}
              />
            ),
          },
          {
            title: 'ข้อความถึงสมาชิก (LINE)',
            render: (_, r) => (
              <Input
                aria-label={`ข้อความถึงสมาชิก ${r.reason}`}
                value={r.memberMessage}
                maxLength={200}
                disabled={!canManage}
                onChange={(e) => update(r.reason, { memberMessage: e.target.value })}
                style={{ minWidth: 280 }}
              />
            ),
          },
          {
            title: 'ใช้งาน',
            width: 90,
            render: (_, r) => (
              <Tooltip title={r.reason === 'OTHER' ? '“อื่นๆ” ต้องเปิดไว้เสมอ' : undefined}>
                <Switch
                  aria-label={`ใช้งาน ${r.reason}`}
                  checked={r.enabled || r.reason === 'OTHER'}
                  disabled={!canManage || r.reason === 'OTHER'}
                  onChange={(enabled) => update(r.reason, { enabled })}
                />
              </Tooltip>
            ),
          },
        ]}
      />
    </SettingCard>
  );
}

function UploadLimitsCard({ data, canManage }: TabProps) {
  const [form] = Form.useForm<SettingsValues['uploadLimits']>();
  const { save, saving, error } = useSettingSave('uploadLimits');
  return (
    <SettingCard
      title="การอัปโหลดใบเสร็จ"
      description={`ลดได้แต่เพิ่มเกินไม่ได้ (สูงสุด ${UPLOAD_LIMIT_CAPS.maxFileMb} MB และ ${UPLOAD_LIMIT_CAPS.maxFiles} ไฟล์ต่อครั้ง)`}
      settingKey="uploadLimits"
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
        initialValues={data.values.uploadLimits}
        disabled={!canManage}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="ขนาดไฟล์สูงสุด"
              name="maxFileMb"
              rules={[{ required: true, message: 'กรุณากรอกขนาดไฟล์' }]}
            >
              <AddonNumber
                aria-label="ขนาดไฟล์สูงสุด (MB)"
                after="MB"
                min={1}
                max={UPLOAD_LIMIT_CAPS.maxFileMb}
                precision={0}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="จำนวนไฟล์ต่อครั้ง"
              name="maxFiles"
              rules={[{ required: true, message: 'กรุณากรอกจำนวนไฟล์' }]}
            >
              <AddonNumber
                aria-label="จำนวนไฟล์ต่อครั้ง"
                after="ไฟล์"
                min={1}
                max={UPLOAD_LIMIT_CAPS.maxFiles}
                precision={0}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </SettingCard>
  );
}

function DefaultClaimDaysCard({ data, canManage }: TabProps) {
  const initial = data.values.defaultClaimDays;
  const [days, setDays] = useState<number | null>(initial ?? 30);
  const [noLimit, setNoLimit] = useState(initial === null);
  const { save, saving, error } = useSettingSave('defaultClaimDays');
  return (
    <SettingCard
      title="ระยะเวลาส่งใบเสร็จ (ค่าเริ่มต้น)"
      description="ค่าที่กรอกให้อัตโนมัติเมื่อสร้างเงื่อนไขการให้แต้มใหม่ แต่ละเงื่อนไขยังแก้ไขเองได้"
      settingKey="defaultClaimDays"
      changes={data.changes}
      error={error}
      saving={saving}
      onSave={canManage ? () => save(noLimit ? null : days) : undefined}
    >
      <Flex gap={12} align="center" wrap style={{ marginBottom: 16 }}>
        <AddonNumber
          aria-label="ส่งใบเสร็จได้ภายใน (วัน) ค่าเริ่มต้น"
          before="ส่งได้ภายใน"
          after="วัน"
          min={0}
          max={3650}
          precision={0}
          value={days}
          disabled={!canManage || noLimit}
          onChange={setDays}
          style={{ maxWidth: 280 }}
        />
        <Checkbox
          checked={noLimit}
          disabled={!canManage}
          onChange={(e) => setNoLimit(e.target.checked)}
        >
          ไม่จำกัด
        </Checkbox>
      </Flex>
    </SettingCard>
  );
}
