/** Staff review status of a single receipt. Independent from the LOGA transfer status. */
export const ReceiptStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  NEEDS_CHECK: 'NEEDS_CHECK',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ReceiptStatus = (typeof ReceiptStatus)[keyof typeof ReceiptStatus];

/** Outcome of sending points to LOGA. UNKNOWN = ambiguous result, reconcile before retrying. */
export const TransferStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type TransferStatus = (typeof TransferStatus)[keyof typeof TransferStatus];

export const ReceiptStatusLabel: Record<ReceiptStatus, string> = {
  PENDING_REVIEW: 'รอตรวจสอบ',
  NEEDS_CHECK: 'ต้องตรวจเพิ่ม',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ไม่อนุมัติ',
};

export const TransferStatusLabel: Record<TransferStatus, string> = {
  PENDING: 'รอส่ง',
  PROCESSING: 'กำลังส่ง',
  SUCCEEDED: 'สำเร็จ',
  FAILED: 'ส่งไม่สำเร็จ',
  UNKNOWN: 'ไม่ทราบผล',
};
