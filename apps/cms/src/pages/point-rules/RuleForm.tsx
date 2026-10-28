import { CalendarOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { ROUNDING_MODES, RoundingModeLabel } from '@getpoint/shared';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Flex,
  Form,
  type FormInstance,
  Row,
  Select,
  Switch,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import { useEffect, useState } from 'react';
import { AddonNumber } from '../../components/AddonNumber';
import { errorMessage } from '../../api/client';
import { type PointRule, type RuleOptions, useRuleShops, useSaveRule } from '../../api/pointRules';
import { colors } from '../../theme';
import { newRule, type RuleFormValues } from './ruleFormValues';

dayjs.extend(buddhistEra);

interface RuleFormProps {
  form: FormInstance<RuleFormValues>;
  options: RuleOptions | undefined;
  /** The rule being edited, or null for a new one. */
  editing: PointRule | null;
  onDone: () => void;
}

const DATE_FORMAT = 'DD/MM/BBBB';

/** "ตั้งค่าเงื่อนไขการให้แต้ม" card (mockup image 57, left). */
export function RuleForm({ form, options, editing, onDone }: RuleFormProps) {
  const { message } = App.useApp();
  const save = useSaveRule();
  const [error, setError] = useState<string | null>(null);
  const place = Form.useWatch('place', form);
  const capEnabled = Form.useWatch('capEnabled', form);
  const noEnd = Form.useWatch('noEnd', form);
  const noClaimLimit = Form.useWatch('noClaimLimit', form);
  const defaultClaimDays = options?.defaultClaimDays;

  // The Settings default arrives with the options; apply it to a new, untouched form.
  useEffect(() => {
    if (
      defaultClaimDays === undefined ||
      editing ||
      form.isFieldsTouched(['claimDays', 'noClaimLimit'])
    ) {
      return;
    }
    const { claimDays, noClaimLimit } = newRule(defaultClaimDays);
    form.setFieldsValue({ claimDays, noClaimLimit });
  }, [defaultClaimDays, editing, form]);
  const active = Form.useWatch('active', form);

  const [placeKind, placeId] = place?.split(':') ?? [];
  const shops = useRuleShops(placeKind === 'location' ? placeId : undefined);

  const placeOptions = (options?.communities ?? []).flatMap((c) => {
    const locations = (options?.locations ?? []).filter((l) => l.communityId === c.id);
    return [
      {
        label: c.name,
        options: [
          ...(c.canManage ? [{ value: `community:${c.id}`, label: `ทุกสถานที่ใน ${c.name}` }] : []),
          ...locations.map((l) => ({
            value: `location:${l.id}`,
            label: l.status === 'ACTIVE' ? l.name : `${l.name} (ปิดใช้งาน)`,
          })),
        ],
      },
    ].filter((group) => group.options.length > 0);
  });

  // Only participating, open shops can get their own rule (keep the edited rule's shop).
  const shopOptions = [
    { value: '', label: 'ทุกร้านค้า' },
    ...(shops.data ?? [])
      .filter((s) => (s.participating && s.status === 'ACTIVE') || s.id === editing?.shop?.id)
      .map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
  ];

  const reset = () => {
    setError(null);
    form.resetFields();
    if (defaultClaimDays !== undefined) {
      const { claimDays, noClaimLimit } = newRule(defaultClaimDays);
      form.setFieldsValue({ claimDays, noClaimLimit });
    }
    onDone();
  };

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setError(null);
    const [kind, id] = values.place!.split(':');
    const body = {
      spendAmount: values.spendAmount!,
      points: values.points!,
      rounding: values.rounding,
      maxPoints: values.capEnabled ? (values.maxPoints ?? null) : null,
      claimDays: values.noClaimLimit ? null : (values.claimDays ?? null),
      startDate: values.startDate!.format('YYYY-MM-DD'),
      endDate: values.noEnd || !values.endDate ? null : values.endDate.format('YYYY-MM-DD'),
      status: values.active ? ('ACTIVE' as const) : ('INACTIVE' as const),
    };
    try {
      if (editing) {
        await save.mutateAsync({ id: editing.id, ...body });
        message.success('บันทึกการแก้ไขเงื่อนไขแล้ว');
      } else {
        const level = kind === 'community' ? 'COMMUNITY' : values.shopId ? 'SHOP' : 'LOCATION';
        await save.mutateAsync({ level, targetId: values.shopId || id, ...body });
        message.success('บันทึกเงื่อนไขแล้ว');
      }
      reset();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card styles={{ body: { padding: 24 } }} style={{ height: '100%' }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        {editing ? 'แก้ไขเงื่อนไขการให้แต้ม' : 'ตั้งค่าเงื่อนไขการให้แต้ม'}
      </Typography.Title>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}
      <Form<RuleFormValues>
        form={form}
        layout="vertical"
        initialValues={newRule()}
        requiredMark
        onValuesChange={(changed) => {
          // A new place has different shops.
          if ('place' in changed) form.setFieldValue('shopId', '');
        }}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label="สถานที่"
              name="place"
              rules={[{ required: true, message: 'กรุณาเลือกสถานที่' }]}
            >
              <Select
                placeholder="เลือกสถานที่"
                options={placeOptions}
                disabled={Boolean(editing)}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="ร้านค้าที่ร่วมรายการ"
              name="shopId"
              required
              extra={
                placeKind === 'community' ? 'เงื่อนไขระดับ Community ใช้กับทุกร้านค้า' : undefined
              }
            >
              <Select
                options={shopOptions}
                loading={shops.isLoading}
                disabled={Boolean(editing) || placeKind !== 'location'}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="กำหนดอัตราการให้แต้ม" required style={{ marginBottom: 0 }}>
          <Flex gap={12} align="flex-start" wrap>
            <Form.Item
              name="spendAmount"
              rules={[{ required: true, message: 'กรุณากรอกยอดใช้จ่าย' }]}
              style={{ flex: '1 1 220px' }}
            >
              <AddonNumber
                aria-label="ยอดใช้จ่ายทุก (บาท)"
                before="ยอดใช้จ่ายทุก"
                after="บาท"
                min={0.01}
                max={1_000_000}
                precision={2}
                step={1}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Typography.Text style={{ fontSize: 20, lineHeight: '32px' }}>=</Typography.Text>
            <Form.Item
              name="points"
              rules={[{ required: true, message: 'กรุณากรอกจำนวนแต้ม' }]}
              style={{ flex: '1 1 200px' }}
            >
              <AddonNumber
                aria-label="ได้รับ (แต้ม)"
                before="ได้รับ"
                after="แต้ม"
                min={1}
                max={100_000}
                precision={0}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Flex>
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label="การปัดเศษ" name="rounding" rules={[{ required: true }]}>
              <Select
                options={ROUNDING_MODES.map((mode) => ({
                  value: mode,
                  label: RoundingModeLabel[mode],
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Flex gap={12} align="center" wrap style={{ marginBottom: capEnabled ? 8 : 20 }}>
          <Form.Item name="capEnabled" valuePropName="checked" noStyle>
            <Switch aria-label="กำหนดแต้มสูงสุดต่อใบเสร็จ" />
          </Form.Item>
          <Typography.Text>
            กำหนดแต้มสูงสุดต่อใบเสร็จ{' '}
            <Typography.Text type="secondary">(ไม่บังคับ)</Typography.Text>
          </Typography.Text>
        </Flex>
        {capEnabled && (
          <Form.Item
            name="maxPoints"
            rules={[{ required: true, message: 'กรุณากรอกแต้มสูงสุด' }]}
            style={{ maxWidth: 300 }}
          >
            <AddonNumber
              aria-label="แต้มสูงสุดต่อใบเสร็จ"
              before="สูงสุด"
              after="แต้ม / ใบเสร็จ"
              min={1}
              precision={0}
              style={{ width: '100%' }}
            />
          </Form.Item>
        )}

        <Form.Item
          label="ส่งใบเสร็จได้ภายใน"
          required
          extra="นับจากวันที่บนใบเสร็จถึงวันที่สมาชิกส่ง ใบเสร็จที่เกินกำหนดจะอนุมัติไม่ได้"
          style={{ marginBottom: 16 }}
        >
          <Flex gap={12} align="flex-start">
            <Form.Item
              name="claimDays"
              noStyle
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, value?: number | null) =>
                    getFieldValue('noClaimLimit') || (value !== null && value !== undefined)
                      ? Promise.resolve()
                      : Promise.reject(new Error('กรุณากรอกจำนวนวัน')),
                }),
              ]}
            >
              <AddonNumber
                aria-label="ส่งใบเสร็จได้ภายใน (วัน)"
                after="วัน หลังวันที่บนใบเสร็จ"
                min={0}
                max={3650}
                precision={0}
                disabled={noClaimLimit}
                style={{ maxWidth: 320 }}
              />
            </Form.Item>
            <Form.Item name="noClaimLimit" valuePropName="checked" noStyle>
              <Checkbox style={{ marginTop: 5 }}>ไม่จำกัด</Checkbox>
            </Form.Item>
          </Flex>
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label="วันที่เริ่มใช้"
              name="startDate"
              rules={[{ required: true, message: 'กรุณาเลือกวันที่เริ่มใช้' }]}
              extra={
                <span>
                  <InfoCircleOutlined /> ใช้กติกาตามวันที่บนใบเสร็จ
                </span>
              }
            >
              <DatePicker
                format={DATE_FORMAT}
                placeholder="เลือกวันที่"
                suffixIcon={<CalendarOutlined />}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="วันที่สิ้นสุด" style={{ marginBottom: 0 }}>
              <Flex gap={12} align="flex-start">
                <Form.Item
                  name="endDate"
                  style={{ flex: 1 }}
                  dependencies={['startDate', 'noEnd']}
                  rules={[
                    ({ getFieldValue }) => ({
                      validator: (_, value?: Dayjs | null) => {
                        const start: Dayjs | undefined = getFieldValue('startDate');
                        if (getFieldValue('noEnd')) return Promise.resolve();
                        if (!value) return Promise.reject(new Error('กรุณาเลือกวันที่สิ้นสุด'));
                        if (start && value.isBefore(start, 'day')) {
                          return Promise.reject(
                            new Error('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มใช้'),
                          );
                        }
                        return Promise.resolve();
                      },
                    }),
                  ]}
                >
                  <DatePicker
                    format={DATE_FORMAT}
                    placeholder="ไม่กำหนด"
                    disabled={noEnd}
                    suffixIcon={<CalendarOutlined />}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item name="noEnd" valuePropName="checked" style={{ marginTop: 4 }}>
                  <Checkbox
                    onChange={(e) => e.target.checked && form.setFieldValue('endDate', null)}
                  >
                    ไม่กำหนด
                  </Checkbox>
                </Form.Item>
              </Flex>
            </Form.Item>
          </Col>
        </Row>

        <Flex justify="space-between" align="center" gap={16} wrap style={{ marginTop: 8 }}>
          <Flex gap={12} align="center">
            <Typography.Text strong>สถานะเงื่อนไข</Typography.Text>
            <Form.Item name="active" valuePropName="checked" noStyle>
              <Switch aria-label="สถานะเงื่อนไข" />
            </Form.Item>
            <Typography.Text style={{ color: active ? colors.success : colors.textMuted }}>
              {active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
            </Typography.Text>
          </Flex>
          <Flex gap={12}>
            <Button size="large" onClick={reset}>
              ยกเลิก
            </Button>
            <Button type="primary" size="large" loading={save.isPending} onClick={submit}>
              บันทึกเงื่อนไข
            </Button>
          </Flex>
        </Flex>
      </Form>
    </Card>
  );
}
