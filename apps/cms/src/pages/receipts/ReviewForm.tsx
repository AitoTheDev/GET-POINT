import {
  ArrowRightOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileAddOutlined,
  InfoCircleOutlined,
  StarFilled,
  TeamOutlined,
} from '@ant-design/icons';
import { formatNumber, maskThaiMobile, Menu } from '@getpoint/shared';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Spin,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type Receipt,
  type ReceiptFields,
  useApproveReceipt,
  useNeedsCheck,
  useReceiptCheck,
  useReceiptLocations,
  useReceiptShops,
} from '../../api/receipts';
import { useAuth } from '../../auth/useAuth';
import { AddonNumber } from '../../components/AddonNumber';
import { colors } from '../../theme';
import { ReceiptDetails } from './ReceiptDetails';
import { ReceiptStatusPill } from './receiptDisplay';
import { RejectModal } from './RejectModal';

dayjs.extend(buddhistEra);

interface FormValues {
  locationId?: string;
  shopId?: string;
  receiptNo?: string;
  receiptDate?: Dayjs | null;
  amount?: number | null;
  staffNote?: string;
}

/** Waits until typing pauses before asking the API again. */
function useDebounced<T>(value: T, ms = 400): T {
  const [debounced, setDebounced] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return debounced;
}

interface ReviewFormProps {
  receipt: Receipt;
  /** Called after approve / reject / needs-check, with the saved receipt. */
  onDecided: (receipt: Receipt) => void;
  onNext: (() => void) | null;
}

/** "ข้อมูลใบเสร็จ" (mockup image 53, right): key in the receipt, see points and duplicates, decide. */
export function ReviewForm({ receipt, onDecided, onNext }: ReviewFormProps) {
  const { can } = useAuth();
  const { message } = App.useApp();
  const canDecide = can(Menu.RECEIPT_REVIEW, 'manage');
  const open = receipt.status === 'PENDING_REVIEW' || receipt.status === 'NEEDS_CHECK';
  const [form] = Form.useForm<FormValues>();
  const [rejecting, setRejecting] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const approve = useApproveReceipt();
  const needsCheck = useNeedsCheck();

  const locations = useReceiptLocations();
  const memberLocations = (locations.data ?? []).filter(
    (l) => l.communityId === receipt.member.communityId,
  );
  const values = Form.useWatch([], form) ?? {};
  const shops = useReceiptShops(values.locationId);

  // Pre-select the only Location of the member's Community.
  useEffect(() => {
    if (!form.getFieldValue('locationId') && memberLocations.length === 1) {
      form.setFieldValue('locationId', memberLocations[0].id);
    }
  }, [form, memberLocations]);

  // What is typed right now (sent when rejecting / marking for a check) …
  const current: ReceiptFields = {
    locationId: values.locationId || undefined,
    shopId: values.shopId || undefined,
    receiptNo: values.receiptNo?.trim() || undefined,
    receiptDate: values.receiptDate ? values.receiptDate.format('YYYY-MM-DD') : undefined,
    amount: values.amount ?? undefined,
  };
  // … and the same after typing pauses, for the live check (not one request per key).
  const fields = useDebounced(current);
  const complete = Boolean(
    fields.locationId && fields.shopId && fields.receiptNo && fields.receiptDate && fields.amount,
  );
  const check = useReceiptCheck(receipt.id, fields, open && canDecide);
  const problems = check.data?.problems ?? [];
  const blocking = problems.filter((p) => p.blocking);
  const warnings = problems.filter((p) => !p.blocking);
  const suggested = problems.find((p) => p.suggestedReason)?.suggestedReason;

  const doApprove = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setError(null);
    try {
      const saved = await approve.mutateAsync({
        id: receipt.id,
        locationId: v.locationId!,
        shopId: v.shopId!,
        receiptNo: v.receiptNo!.trim(),
        receiptDate: v.receiptDate!.format('YYYY-MM-DD'),
        amount: v.amount!,
        staffNote: v.staffNote?.trim() || null,
      });
      message.success(
        `อนุมัติ ${saved.code} แล้ว${saved.transaction ? ` ได้ ${formatNumber(saved.transaction.points)} แต้ม` : ''}`,
      );
      onDecided(saved);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const doNeedsCheck = async () => {
    if (!checkNote?.trim()) return;
    try {
      const saved = await needsCheck.mutateAsync({
        id: receipt.id,
        ...current,
        staffNote: checkNote.trim(),
      });
      message.info(`ย้าย ${saved.code} ไปที่ "ต้องตรวจเพิ่ม" แล้ว`);
      setCheckNote(null);
      onDecided(saved);
    } catch (err) {
      setError(errorMessage(err));
      setCheckNote(null);
    }
  };

  const header = (
    <Flex justify="space-between" align="center">
      <Typography.Title level={3} style={{ margin: 0 }}>
        ข้อมูลใบเสร็จ
      </Typography.Title>
      <ReceiptStatusPill status={receipt.status} />
    </Flex>
  );

  const memberBox = (
    <Flex
      gap={16}
      style={{ background: '#F2F3F5', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}
    >
      <Flex gap={10} align="center" style={{ flex: 1 }}>
        <TeamOutlined style={{ fontSize: 28 }} />
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            สมาชิก {receipt.member.code}
          </Typography.Text>
          <div>{maskThaiMobile(receipt.member.phone)}</div>
        </div>
      </Flex>
      <Flex
        gap={10}
        align="center"
        style={{ flex: 1, borderLeft: `1px solid ${colors.border}`, paddingLeft: 16 }}
      >
        <FileAddOutlined style={{ fontSize: 26 }} />
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            ชุดที่ส่ง
          </Typography.Text>
          <div>
            ใบที่ {receipt.sequence} จาก {receipt.submission.count}
          </div>
        </div>
      </Flex>
    </Flex>
  );

  if (!open) {
    return (
      <Card title={header} styles={{ body: { padding: 20 } }}>
        {memberBox}
        <ReceiptDetails receipt={receipt} showPhone={false} />
        {onNext && (
          <Flex justify="flex-end" style={{ marginTop: 16 }}>
            <Button type="link" onClick={onNext}>
              ใบถัดไป <ArrowRightOutlined />
            </Button>
          </Flex>
        )}
      </Card>
    );
  }

  const points = check.data?.calculation?.points;
  return (
    <Card title={header} styles={{ body: { padding: 20 } }}>
      {memberBox}
      {receipt.member.status !== 'ACTIVE' && (
        <Alert type="error" showIcon message="สมาชิกถูกระงับ" style={{ marginBottom: 12 }} />
      )}
      {receipt.status === 'NEEDS_CHECK' && receipt.staffNote && (
        <Alert
          type="warning"
          showIcon
          message={`ต้องตรวจเพิ่ม: ${receipt.staffNote}`}
          style={{ marginBottom: 12 }}
        />
      )}
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        <InfoCircleOutlined /> กรอกข้อมูลจากภาพใบเสร็จ (ระบบ AI อ่านใบเสร็จจะเพิ่มภายหลัง)
      </Typography.Text>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 12 }}
        />
      )}

      <Form<FormValues>
        form={form}
        layout="horizontal"
        labelCol={{ flex: '100px' }}
        labelAlign="left"
        colon={false}
        disabled={!canDecide}
        requiredMark={false}
        initialValues={{
          locationId: receipt.location?.id,
          shopId: receipt.shop?.id,
          receiptNo: receipt.receiptNo ?? undefined,
          receiptDate: receipt.receiptDate ? dayjs(receipt.receiptDate) : null,
          amount: receipt.amount,
          staffNote: receipt.staffNote ?? undefined,
        }}
        onValuesChange={(changed) => {
          if ('locationId' in changed) form.setFieldValue('shopId', undefined);
        }}
      >
        <Form.Item
          label="สถานที่"
          name="locationId"
          rules={[{ required: true, message: 'กรุณาเลือกสถานที่' }]}
          style={{ marginBottom: 12 }}
        >
          <Select
            placeholder="เลือกสถานที่"
            loading={locations.isLoading}
            options={memberLocations.map((l) => ({ value: l.id, label: l.name }))}
          />
        </Form.Item>
        <Form.Item
          label="ร้านค้า"
          name="shopId"
          rules={[{ required: true, message: 'กรุณาเลือกร้านค้า' }]}
          style={{ marginBottom: 12 }}
        >
          <Select
            placeholder="เลือกร้านค้า"
            disabled={!values.locationId}
            loading={shops.isLoading}
            showSearch
            optionFilterProp="label"
            options={shops.data?.map((s) => ({
              value: s.id,
              label: `${s.name}${s.receiptName ? ` · ${s.receiptName}` : ''}${
                s.participating && s.status === 'ACTIVE' ? '' : ' (ไม่ร่วมรายการ)'
              }`,
            }))}
          />
        </Form.Item>
        <Flex gap={12}>
          <Form.Item
            label="เลขที่ใบเสร็จ"
            name="receiptNo"
            rules={[{ required: true, whitespace: true, message: 'กรุณากรอกเลขที่ใบเสร็จ' }]}
            style={{ flex: 1, marginBottom: 12 }}
          >
            <Input maxLength={60} placeholder="เช่น A00125" />
          </Form.Item>
          <Form.Item
            name="receiptDate"
            rules={[{ required: true, message: 'กรุณาเลือกวันที่ใบเสร็จ' }]}
            style={{ width: 170, marginBottom: 12 }}
          >
            <DatePicker
              aria-label="วันที่ใบเสร็จ"
              placeholder="วันที่ใบเสร็จ"
              format="DD/MM/BBBB"
              suffixIcon={<CalendarOutlined />}
              disabledDate={(d) => d.isAfter(dayjs(receipt.submittedAt), 'day')}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Flex>
        <Form.Item
          label="ยอดชำระ"
          name="amount"
          rules={[{ required: true, message: 'กรุณากรอกยอดชำระ' }]}
          style={{ marginBottom: 12 }}
        >
          <AddonNumber aria-label="ยอดชำระ" after="บาท" min={0} precision={2} placeholder="0.00" />
        </Form.Item>

        <CheckBanner
          complete={complete}
          loading={check.isFetching}
          blocking={blocking}
          warnings={warnings}
        />

        <Flex
          align="center"
          gap={16}
          style={{
            background: '#F2F3F5',
            borderRadius: 12,
            padding: '14px 20px',
            margin: '12px 0',
          }}
        >
          <StarFilled style={{ fontSize: 30, color: colors.ink }} />
          <div style={{ flex: 1 }}>
            <Typography.Text>แต้มที่จะได้รับ</Typography.Text>
            <div
              data-testid="review-points"
              style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}
            >
              {points !== undefined ? `${formatNumber(points)} แต้ม` : '-'}
            </div>
          </div>
          <Typography.Text type="secondary">
            {check.data?.rule?.label ?? ''}
            {check.data?.calculation?.capped && ' (ถึงสูงสุด)'}
          </Typography.Text>
        </Flex>

        <Form.Item label="หมายเหตุ" name="staffNote" style={{ marginBottom: 16 }}>
          <Input.TextArea rows={2} maxLength={500} placeholder="ระบุหมายเหตุ (ถ้ามี)" />
        </Form.Item>
      </Form>

      {canDecide && (
        <>
          <Flex gap={12}>
            <Button
              type="primary"
              size="large"
              icon={<CheckCircleOutlined />}
              loading={approve.isPending}
              disabled={!complete || blocking.length > 0 || check.isFetching}
              onClick={doApprove}
              style={{
                flex: 3,
                background: complete && !blocking.length ? colors.success : undefined,
              }}
            >
              อนุมัติและให้แต้ม
            </Button>
            <Button
              danger
              size="large"
              icon={<CloseCircleOutlined />}
              onClick={() => setRejecting(true)}
              style={{ flex: 2 }}
            >
              ปฏิเสธ
            </Button>
          </Flex>
          <Flex justify="space-between" style={{ marginTop: 12 }}>
            <Button
              type="link"
              style={{ padding: 0 }}
              icon={<ExclamationCircleOutlined />}
              onClick={() => setCheckNote(receipt.staffNote ?? '')}
            >
              ต้องตรวจเพิ่ม
            </Button>
            {onNext && (
              <Button type="link" style={{ padding: 0 }} onClick={onNext}>
                ใบถัดไป <ArrowRightOutlined />
              </Button>
            )}
          </Flex>
        </>
      )}

      {rejecting && (
        <RejectModal
          receipt={receipt}
          suggested={suggested}
          fields={current}
          onClose={() => setRejecting(false)}
          onDone={(saved) => {
            setRejecting(false);
            message.success(`ไม่อนุมัติ ${saved.code} แล้ว`);
            onDecided(saved);
          }}
        />
      )}
      <Modal
        open={checkNote !== null}
        title="ต้องตรวจเพิ่ม"
        okText="บันทึก"
        cancelText="ยกเลิก"
        okButtonProps={{ disabled: !checkNote?.trim() }}
        confirmLoading={needsCheck.isPending}
        onOk={doNeedsCheck}
        onCancel={() => setCheckNote(null)}
      >
        <Typography.Paragraph type="secondary">
          ระบุสิ่งที่ต้องตรวจสอบ ข้อมูลที่กรอกไว้จะถูกบันทึกด้วย
        </Typography.Paragraph>
        <Input.TextArea
          aria-label="สิ่งที่ต้องตรวจเพิ่ม"
          rows={3}
          maxLength={500}
          value={checkNote ?? ''}
          onChange={(e) => setCheckNote(e.target.value)}
        />
      </Modal>
    </Card>
  );
}

/** Duplicate / problem banner (mockup: green "ไม่พบใบเสร็จซ้ำ"). */
function CheckBanner({
  complete,
  loading,
  blocking,
  warnings,
}: {
  complete: boolean;
  loading: boolean;
  blocking: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
}) {
  if (loading && !blocking.length && !warnings.length) {
    return (
      <Flex gap={8} align="center" style={{ padding: '10px 14px' }}>
        <Spin size="small" /> <Typography.Text type="secondary">กำลังตรวจสอบ...</Typography.Text>
      </Flex>
    );
  }
  return (
    <Flex vertical gap={8}>
      {blocking.map((p) => (
        <Alert key={p.code} type="error" showIcon message={p.message} />
      ))}
      {warnings.map((p) => (
        <Alert key={p.code} type="warning" showIcon message={p.message} />
      ))}
      {!blocking.length &&
        !warnings.length &&
        (complete ? (
          <Flex
            gap={10}
            align="center"
            style={{
              background: colors.successBg,
              color: colors.success,
              borderRadius: 10,
              padding: '10px 14px',
            }}
          >
            <CheckCircleFilled style={{ fontSize: 20 }} /> ไม่พบใบเสร็จซ้ำ
          </Flex>
        ) : (
          <Typography.Text type="secondary" style={{ padding: '4px 0' }}>
            กรอกข้อมูลให้ครบเพื่อตรวจใบเสร็จซ้ำและคำนวณแต้ม
          </Typography.Text>
        ))}
    </Flex>
  );
}
