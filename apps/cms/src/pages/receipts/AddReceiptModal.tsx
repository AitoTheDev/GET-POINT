import { CalendarOutlined, InboxOutlined } from '@ant-design/icons';
import {
  formatNumber,
  formatThaiMobile,
  memberFullName,
  type ReceiptStatus,
  ReceiptStatusLabel,
  type RejectReason,
} from '@getpoint/shared';
import {
  Alert,
  App,
  DatePicker,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Typography,
  Upload,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useDeferredValue, useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type Receipt,
  useAddReceipt,
  useMemberOptions,
  useReceiptConfig,
  useReceiptLocations,
  useReceiptShops,
} from '../../api/receipts';
import { AddonNumber } from '../../components/AddonNumber';

interface FormValues {
  memberId?: string;
  locationId?: string;
  shopId?: string;
  receiptNo?: string;
  receiptDate?: Dayjs | null;
  amount?: number | null;
  status: ReceiptStatus;
  staffNote?: string;
  rejectReason?: RejectReason;
  rejectNote?: string;
}

const ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';
const TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const STATUSES: ReceiptStatus[] = ['PENDING_REVIEW', 'NEEDS_CHECK', 'APPROVED', 'REJECTED'];

interface AddReceiptModalProps {
  onClose: () => void;
  onAdded: (receipt: Receipt) => void;
}

/**
 * "เพิ่มใบเสร็จ": staff add a receipt themselves (e.g. a customer brings it to the counter),
 * attach its photo/PDF, type the details and choose its status.
 */
export function AddReceiptModal({ onClose, onAdded }: AddReceiptModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const add = useAddReceipt();
  const config = useReceiptConfig().data;
  const reasons = config?.rejectReasons ?? [];
  // Settings may lower the size limit (never above 10 MB).
  const maxFileMb = config?.uploadLimits.maxFileMb ?? 10;

  const memberId = Form.useWatch('memberId', form);
  const locationId = Form.useWatch('locationId', form);
  const status = Form.useWatch('status', form) ?? 'PENDING_REVIEW';
  const rejectReason = Form.useWatch('rejectReason', form);
  const members = useMemberOptions(useDeferredValue(search.trim()), true);
  const locations = useReceiptLocations();
  const shops = useReceiptShops(locationId);
  const member = members.data?.find((m) => m.id === memberId);
  const approving = status === 'APPROVED';
  // An approved receipt needs every detail; other statuses can be completed later.
  const requiredIfApproving = (message: string) => [{ required: approving, message }];

  const chooseFile = (f: File) => {
    if (!TYPES.includes(f.type)) setFileError('รองรับไฟล์ JPG, PNG และ PDF เท่านั้น');
    else if (f.size > maxFileMb * 1024 * 1024) setFileError(`ไฟล์มีขนาดเกิน ${maxFileMb} MB`);
    else {
      setFileError(null);
      setFile(f);
    }
    return Upload.LIST_IGNORE; // keep the file here; it is sent with the form
  };

  const submit = async () => {
    if (!file) setFileError('กรุณาแนบรูปหรือไฟล์ใบเสร็จ');
    const values = await form.validateFields().catch(() => null);
    if (!values || !file) return;
    setError(null);
    try {
      const saved = await add.mutateAsync({
        file,
        memberId: values.memberId!,
        status: values.status,
        locationId: values.locationId,
        shopId: values.shopId,
        receiptNo: values.receiptNo?.trim(),
        receiptDate: values.receiptDate?.format('YYYY-MM-DD'),
        amount: values.amount ?? undefined,
        staffNote: values.staffNote?.trim(),
        rejectReason: values.status === 'REJECTED' ? values.rejectReason : undefined,
        rejectNote: values.status === 'REJECTED' ? values.rejectNote?.trim() : undefined,
      });
      message.success(
        `เพิ่มใบเสร็จ ${saved.code} แล้ว (${ReceiptStatusLabel[saved.status]}${
          saved.transaction ? ` ได้ ${formatNumber(saved.transaction.points)} แต้ม` : ''
        })`,
      );
      onAdded(saved);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      width={720}
      title="เพิ่มใบเสร็จ"
      okText="บันทึกใบเสร็จ"
      cancelText="ยกเลิก"
      confirmLoading={add.isPending}
      onOk={submit}
      onCancel={onClose}
      destroyOnHidden
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {/* Own name so field ids (addReceipt_locationId…) don't clash with the review form behind. */}
      <Form<FormValues>
        name="addReceipt"
        form={form}
        layout="vertical"
        initialValues={{ status: 'PENDING_REVIEW' }}
        onValuesChange={(changed) => {
          if ('memberId' in changed)
            form.setFieldsValue({ locationId: undefined, shopId: undefined });
          if ('locationId' in changed) form.setFieldValue('shopId', undefined);
        }}
      >
        <Form.Item
          label="สมาชิก"
          name="memberId"
          rules={[{ required: true, message: 'กรุณาเลือกสมาชิก' }]}
        >
          <Select
            showSearch
            filterOption={false}
            onSearch={setSearch}
            loading={members.isFetching}
            placeholder="ค้นหาชื่อ เบอร์โทร หรือรหัสสมาชิก"
            notFoundContent={members.isFetching ? 'กำลังค้นหา...' : 'ไม่พบสมาชิก'}
            options={members.data?.map((m) => ({
              value: m.id,
              label: `${memberFullName(m)} (${m.code}) · ${formatThaiMobile(m.phone)}`,
            }))}
          />
        </Form.Item>

        <Form.Item
          label="รูปหรือไฟล์ใบเสร็จ"
          required
          validateStatus={fileError ? 'error' : undefined}
          help={fileError}
        >
          <Upload.Dragger
            accept={ACCEPT}
            maxCount={1}
            showUploadList={false}
            beforeUpload={chooseFile}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              {file
                ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
                : 'คลิกหรือลากไฟล์มาวาง'}
            </p>
            <p className="ant-upload-hint">
              JPG, PNG หรือ PDF ไม่เกิน {maxFileMb} MB · 1 ไฟล์ต่อ 1 ใบเสร็จ
            </p>
          </Upload.Dragger>
        </Form.Item>

        <Form.Item label="สถานะ" name="status">
          <Radio.Group optionType="button" buttonStyle="solid">
            {STATUSES.map((s) => (
              <Radio.Button key={s} value={s}>
                {ReceiptStatusLabel[s]}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>
        {approving && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="อนุมัติทันที: ระบบจะตรวจเงื่อนไขการให้แต้มและใบเสร็จซ้ำเหมือนการอนุมัติปกติ แล้วคำนวณแต้มให้"
          />
        )}

        <Form.Item
          label="สถานที่"
          name="locationId"
          rules={requiredIfApproving('กรุณาเลือกสถานที่')}
        >
          <Select
            allowClear
            disabled={!member}
            placeholder={member ? 'เลือกสถานที่' : 'เลือกสมาชิกก่อน'}
            options={(locations.data ?? [])
              .filter((l) => l.communityId === member?.communityId)
              .map((l) => ({ value: l.id, label: l.name }))}
          />
        </Form.Item>
        <Form.Item label="ร้านค้า" name="shopId" rules={requiredIfApproving('กรุณาเลือกร้านค้า')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            disabled={!locationId}
            loading={shops.isLoading}
            placeholder="เลือกร้านค้า"
            options={shops.data?.map((s) => ({
              value: s.id,
              label: `${s.name}${s.participating && s.status === 'ACTIVE' ? '' : ' (ไม่ร่วมรายการ)'}`,
            }))}
          />
        </Form.Item>
        <Form.Item
          label="เลขที่ใบเสร็จ"
          name="receiptNo"
          rules={requiredIfApproving('กรุณากรอกเลขที่ใบเสร็จ')}
        >
          <Input maxLength={60} placeholder="เช่น A00125" />
        </Form.Item>
        <Form.Item
          label="วันที่ใบเสร็จ"
          name="receiptDate"
          rules={requiredIfApproving('กรุณาเลือกวันที่ใบเสร็จ')}
        >
          <DatePicker
            aria-label="วันที่ใบเสร็จ (เพิ่มใบเสร็จ)"
            format="DD/MM/BBBB"
            suffixIcon={<CalendarOutlined />}
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Form.Item label="ยอดชำระ" name="amount" rules={requiredIfApproving('กรุณากรอกยอดชำระ')}>
          <AddonNumber aria-label="ยอดชำระ (เพิ่มใบเสร็จ)" after="บาท" min={0.01} precision={2} />
        </Form.Item>

        {status === 'REJECTED' && (
          <>
            <Form.Item
              label="เหตุผลที่ไม่อนุมัติ"
              name="rejectReason"
              rules={[{ required: true, message: 'กรุณาเลือกเหตุผล' }]}
              extra={
                rejectReason &&
                `สมาชิกจะเห็นข้อความ: “${reasons.find((r) => r.reason === rejectReason)?.memberMessage ?? ''}”`
              }
            >
              <Select
                placeholder="เลือกเหตุผล"
                options={reasons.map((r) => ({ value: r.reason, label: r.label }))}
              />
            </Form.Item>
            <Form.Item
              label="ระบุเหตุผล (เห็นเฉพาะเจ้าหน้าที่)"
              name="rejectNote"
              rules={[
                {
                  required: rejectReason === 'OTHER',
                  whitespace: true,
                  message: 'กรุณาระบุเหตุผลเมื่อเลือก "อื่นๆ"',
                },
              ]}
            >
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
          </>
        )}

        <Form.Item
          label={status === 'NEEDS_CHECK' ? 'สิ่งที่ต้องตรวจเพิ่ม' : 'หมายเหตุ'}
          name="staffNote"
          rules={[
            {
              required: status === 'NEEDS_CHECK',
              whitespace: true,
              message: 'กรุณาระบุสิ่งที่ต้องตรวจเพิ่ม',
            },
          ]}
        >
          <Input.TextArea rows={2} maxLength={500} placeholder="ระบุหมายเหตุ (ถ้ามี)" />
        </Form.Item>
        <Typography.Text type="secondary">
          ใบเสร็จที่อนุมัติหรือไม่อนุมัติแล้วจะแก้ไขสถานะภายหลังไม่ได้
        </Typography.Text>
      </Form>
    </Modal>
  );
}
