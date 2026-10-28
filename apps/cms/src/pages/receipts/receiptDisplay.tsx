import { FilePdfOutlined, FileImageOutlined, LoadingOutlined } from '@ant-design/icons';
import { type ReceiptStatus, ReceiptStatusLabel } from '@getpoint/shared';
import { Flex } from 'antd';
import { useReceiptImage } from '../../api/receipts';
import { StatusPill, type StatusTone } from '../../components/StatusPill';
import { colors } from '../../theme';

const tone: Record<ReceiptStatus, StatusTone> = {
  PENDING_REVIEW: 'warning',
  NEEDS_CHECK: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export function ReceiptStatusPill({ status }: { status: ReceiptStatus }) {
  return <StatusPill tone={tone[status]}>{ReceiptStatusLabel[status]}</StatusPill>;
}

/** Small preview of the receipt file for lists (PDFs show an icon). */
export function ReceiptThumb({ id, mime, size = 64 }: { id: string; mime: string; size?: number }) {
  const isPdf = mime === 'application/pdf';
  const image = useReceiptImage(isPdf ? null : id);
  const box = {
    width: size,
    height: size * 1.25,
    borderRadius: 8,
    background: '#F0F1F3',
    border: `1px solid ${colors.border}`,
    overflow: 'hidden',
    flex: 'none',
    fontSize: size * 0.4,
    color: colors.textMuted,
  } as const;
  if (isPdf) {
    return (
      <Flex align="center" justify="center" style={box} aria-label="ไฟล์ PDF">
        <FilePdfOutlined style={{ color: colors.danger }} />
      </Flex>
    );
  }
  return (
    <Flex align="center" justify="center" style={box}>
      {image.url ? (
        <img src={image.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : image.isLoading ? (
        <LoadingOutlined />
      ) : (
        <FileImageOutlined />
      )}
    </Flex>
  );
}
