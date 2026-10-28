import type { RejectReason } from '@getpoint/shared';
import { Alert, Form, Input, Modal, Radio, Space, Typography } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type Receipt,
  type ReceiptFields,
  useReceiptConfig,
  useRejectReceipt,
} from '../../api/receipts';

interface RejectModalProps {
  receipt: Receipt;
  /** Pre-selected from the problems found (e.g. TOO_OLD). */
  suggested?: RejectReason;
  /** Details typed so far, saved with the rejection. */
  fields?: ReceiptFields;
  onClose: () => void;
  onDone: (receipt: Receipt) => void;
}

/** "ปฏิเสธ": pick one of the nine reasons; "อื่นๆ" needs a note (kept internal). */
export function RejectModal({ receipt, suggested, fields, onClose, onDone }: RejectModalProps) {
  const reject = useRejectReceipt();
  // Wording, order and which reasons are on come from Settings.
  const reasons = useReceiptConfig().data?.rejectReasons ?? [];
  const [reason, setReason] = useState<RejectReason | undefined>(suggested);
  const chosen = reasons.find((r) => r.reason === reason);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const needsNote = reason === 'OTHER';

  const submit = async () => {
    // A suggested reason that is switched off in Settings counts as not chosen.
    if (!reason || !chosen) return setError('กรุณาเลือกเหตุผล');
    if (needsNote && !note.trim()) return setError('กรุณาระบุเหตุผลเมื่อเลือก "อื่นๆ"');
    setError(null);
    try {
      onDone(
        await reject.mutateAsync({ id: receipt.id, ...fields, reason, note: note.trim() || null }),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      title={`ไม่อนุมัติใบเสร็จ ${receipt.code}`}
      okText="ยืนยันไม่อนุมัติ"
      cancelText="ยกเลิก"
      okButtonProps={{ danger: true }}
      confirmLoading={reject.isPending}
      onOk={submit}
      onCancel={onClose}
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      <Form layout="vertical">
        <Form.Item label="เหตุผล" required>
          <Radio.Group value={chosen?.reason} onChange={(e) => setReason(e.target.value)}>
            <Space direction="vertical">
              {reasons.map((r) => (
                <Radio key={r.reason} value={r.reason}>
                  {r.label}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          label={needsNote ? 'ระบุเหตุผล' : 'หมายเหตุเพิ่มเติม (ไม่บังคับ)'}
          required={needsNote}
          extra="หมายเหตุนี้เห็นเฉพาะเจ้าหน้าที่"
        >
          <Input.TextArea
            aria-label="หมายเหตุการไม่อนุมัติ"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Form.Item>
        {reason && (
          <Typography.Text type="secondary">
            สมาชิกจะเห็นข้อความ: “{chosen?.memberMessage}”
          </Typography.Text>
        )}
      </Form>
    </Modal>
  );
}
