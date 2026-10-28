import {
  formatMoney,
  formatNumber,
  formatRate,
  formatThaiDateTime,
  formatThaiMobile,
  PointRuleLevelLabel,
  TransferStatusLabel,
} from '@getpoint/shared';
import { Alert, Descriptions, Typography } from 'antd';
import type { Receipt } from '../../api/receipts';
import { dayLabel } from '../point-rules/ruleDisplay';
import { ReceiptStatusPill } from './receiptDisplay';

/** Everything known about a receipt, read-only (decided receipts and the history drawer). */
export function ReceiptDetails({
  receipt: r,
  showPhone = true,
}: {
  receipt: Receipt;
  showPhone?: boolean;
}) {
  const tx = r.transaction;
  return (
    <>
      {r.status === 'REJECTED' && r.rejectLabel && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`ไม่อนุมัติ: ${r.rejectLabel}`}
          description={
            <>
              {r.rejectNote && <div>หมายเหตุ (ภายใน): {r.rejectNote}</div>}
              <div>สมาชิกจะเห็นข้อความ: “{r.memberMessage}”</div>
            </>
          }
        />
      )}
      <Descriptions
        column={1}
        bordered
        size="small"
        styles={{ label: { width: 150 } }}
        items={[
          { label: 'เลขรายการ', children: r.code },
          { label: 'สถานะ', children: <ReceiptStatusPill status={r.status} /> },
          {
            label: 'สมาชิก',
            children: `${r.member.name} (${r.member.code})${showPhone ? ` · ${formatThaiMobile(r.member.phone)}` : ''}`,
          },
          {
            label: 'ชุดที่ส่ง',
            children: `ใบที่ ${r.sequence} จาก ${r.submission.count} · ส่งเมื่อ ${formatThaiDateTime(r.submittedAt)}`,
          },
          { label: 'สถานที่', children: r.location?.name ?? '-' },
          { label: 'ร้านค้า', children: r.shop?.name ?? '-' },
          { label: 'เลขที่ใบเสร็จ', children: r.receiptNo ?? '-' },
          { label: 'วันที่ใบเสร็จ', children: r.receiptDate ? dayLabel(r.receiptDate) : '-' },
          { label: 'ยอดชำระ', children: r.amount !== null ? `${formatMoney(r.amount)} บาท` : '-' },
          ...(r.status === 'APPROVED'
            ? [
                {
                  label: 'แต้มที่ได้รับ',
                  children: tx ? (
                    <>
                      <Typography.Text strong>{formatNumber(tx.points)} แต้ม</Typography.Text>
                      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
                        {formatRate(tx.rule)} · ระดับ{PointRuleLevelLabel[tx.rule.level]}
                        {tx.rule.place && ` (${tx.rule.place})`}
                        {tx.calculation.capped && ' · ถึงแต้มสูงสุดต่อใบเสร็จ'}
                      </Typography.Text>
                    </>
                  ) : (
                    '0 แต้ม (ยอดไม่ถึงเกณฑ์)'
                  ),
                },
                {
                  label: 'ส่งแต้มไป LOGA',
                  children: tx ? TransferStatusLabel[tx.transferStatus] : '-',
                },
              ]
            : []),
          { label: 'หมายเหตุ', children: r.staffNote ?? '-' },
          {
            label: 'ผู้ตรวจ',
            children: r.reviewedBy
              ? `${r.reviewedBy.name} · ${formatThaiDateTime(r.reviewedAt!)}`
              : '-',
          },
        ]}
      />
    </>
  );
}
