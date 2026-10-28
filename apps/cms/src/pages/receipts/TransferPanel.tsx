import { HistoryOutlined, SendOutlined } from '@ant-design/icons';
import {
  formatNumber,
  formatThaiDateTime,
  Menu,
  type TransferStatus,
  TransferStatusLabel,
} from '@getpoint/shared';
import { Alert, App, Button, Card, Descriptions, Flex, Table, Typography } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type Receipt,
  type TransferAttempt,
  useRetryTransfer,
  useTransferAttempts,
} from '../../api/receipts';
import { useAuth } from '../../auth/useAuth';
import { StatusPill, type StatusTone } from '../../components/StatusPill';

const tone: Record<TransferStatus, StatusTone> = {
  PENDING: 'warning',
  PROCESSING: 'loading',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  UNKNOWN: 'warning',
};

export function TransferStatusPill({ status }: { status: TransferStatus }) {
  return <StatusPill tone={tone[status]}>{TransferStatusLabel[status]}</StatusPill>;
}

/** What each unsuccessful status means for staff. */
const explain: Partial<Record<TransferStatus, string>> = {
  PENDING: 'รอระบบส่งแต้มไป LOGA',
  FAILED: 'LOGA ยังไม่ได้เพิ่มแต้ม',
  UNKNOWN:
    'ไม่ทราบว่า LOGA เพิ่มแต้มแล้วหรือไม่ ส่งซ้ำได้อย่างปลอดภัย เพราะ LOGA ใช้เลขอ้างอิงเดิมและจะไม่เพิ่มแต้มซ้ำ',
};

/** "ส่งแต้มไป LOGA" on an approved receipt: status, attempts and a staff retry. */
export function TransferPanel({ receipt }: { receipt: Receipt }) {
  const tx = receipt.transaction!;
  const { can } = useAuth();
  const { message } = App.useApp();
  const retry = useRetryTransfer();
  const [showAttempts, setShowAttempts] = useState(false);
  const attempts = useTransferAttempts(receipt.id, showAttempts);
  const canRetry =
    can(Menu.RECEIPT_REVIEW, 'manage') &&
    (tx.transferStatus === 'FAILED' || tx.transferStatus === 'UNKNOWN');

  const doRetry = async () => {
    try {
      const saved = await retry.mutateAsync(receipt.id);
      const status = saved.transaction?.transferStatus;
      if (status === 'SUCCEEDED') message.success('ส่งแต้มไป LOGA สำเร็จ');
      else message.error(saved.transaction?.lastError ?? 'ส่งแต้มไม่สำเร็จ');
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Card
      size="small"
      title="ส่งแต้มไป LOGA"
      extra={<TransferStatusPill status={tx.transferStatus} />}
      style={{ marginTop: 16 }}
    >
      {tx.transferStatus !== 'SUCCEEDED' && (
        <Alert
          type={tx.transferStatus === 'FAILED' ? 'error' : 'warning'}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            tx.lastError ?? explain[tx.transferStatus] ?? TransferStatusLabel[tx.transferStatus]
          }
          description={
            <>
              {tx.lastError && explain[tx.transferStatus] && (
                <div>{explain[tx.transferStatus]}</div>
              )}
              {tx.nextAttemptAt ? (
                <div>ระบบจะลองส่งอีกครั้งเวลา {formatThaiDateTime(tx.nextAttemptAt)}</div>
              ) : (
                tx.transferStatus !== 'PENDING' &&
                tx.transferStatus !== 'PROCESSING' && (
                  <div>ระบบหยุดลองส่งอัตโนมัติแล้ว กรุณากด “ส่งอีกครั้ง”</div>
                )
              )}
            </>
          }
          action={
            canRetry && (
              <Button icon={<SendOutlined />} loading={retry.isPending} onClick={doRetry}>
                ส่งอีกครั้ง
              </Button>
            )
          }
        />
      )}
      <Descriptions
        column={1}
        size="small"
        styles={{ label: { width: 150 } }}
        items={[
          { label: 'แต้ม', children: `${formatNumber(tx.points)} แต้ม` },
          { label: 'เลขอ้างอิง', children: receipt.code },
          { label: 'ข้อความถึงสมาชิก', children: tx.remark ?? '-' },
          { label: 'ส่งแล้ว', children: `${tx.attempts} ครั้ง` },
          ...(tx.sentAt
            ? [
                { label: 'ส่งสำเร็จเมื่อ', children: formatThaiDateTime(tx.sentAt) },
                {
                  label: 'แต้มคงเหลือใน LOGA',
                  children: tx.pointsAfter !== null ? `${formatNumber(tx.pointsAfter)} แต้ม` : '-',
                },
              ]
            : tx.lastAttemptAt
              ? [{ label: 'ส่งล่าสุด', children: formatThaiDateTime(tx.lastAttemptAt) }]
              : []),
        ]}
      />
      {tx.attempts > 0 && (
        <Flex vertical gap={8} style={{ marginTop: 8 }}>
          <Button
            type="link"
            icon={<HistoryOutlined />}
            style={{ padding: 0, alignSelf: 'flex-start' }}
            onClick={() => setShowAttempts((v) => !v)}
          >
            {showAttempts ? 'ซ่อนประวัติการส่ง' : 'ดูประวัติการส่ง'}
          </Button>
          {showAttempts && (
            <Table<TransferAttempt>
              rowKey="id"
              size="small"
              loading={attempts.isLoading}
              dataSource={attempts.data}
              pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'ครั้งที่', dataIndex: 'attempt', width: 70 },
                { title: 'เวลา', render: (_, a) => formatThaiDateTime(a.createdAt) },
                { title: 'ผล', render: (_, a) => <TransferStatusPill status={a.result} /> },
                {
                  title: 'โดย',
                  render: (_, a) =>
                    a.triggeredBy?.name ?? (
                      <Typography.Text type="secondary">อัตโนมัติ</Typography.Text>
                    ),
                },
                { title: 'รายละเอียด', render: (_, a) => a.error ?? '-' },
              ]}
            />
          )}
        </Flex>
      )}
    </Card>
  );
}
