import { RECEIPT_MAX_FILE_BYTES, RECEIPT_MAX_FILES, type ReceiptMimeType } from '@getpoint/shared';
import { createHash } from 'node:crypto';

export interface CheckedFile {
  buffer: Buffer;
  mime: ReceiptMimeType;
  extension: 'jpg' | 'png' | 'pdf';
  size: number;
  sha256: string;
}

const SIGNATURES: {
  mime: ReceiptMimeType;
  extension: CheckedFile['extension'];
  bytes: number[];
}[] = [
  { mime: 'image/jpeg', extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', extension: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', extension: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
];

/** The file's real type from its first bytes (the name or declared type can't be trusted). */
export function detectType(buffer: Buffer) {
  return SIGNATURES.find((s) => s.bytes.every((b, i) => buffer[i] === b)) ?? null;
}

export class ReceiptFileError extends Error {}

/** Check one upload: JPG, PNG or PDF, at most 10 MB. */
export function checkFile(buffer: Buffer, name = 'ไฟล์'): CheckedFile {
  if (buffer.length === 0) throw new ReceiptFileError(`${name} ว่างเปล่า`);
  if (buffer.length > RECEIPT_MAX_FILE_BYTES) {
    throw new ReceiptFileError(`${name} มีขนาดเกิน 10 MB`);
  }
  const type = detectType(buffer);
  if (!type) throw new ReceiptFileError(`${name} ต้องเป็นไฟล์ JPG, PNG หรือ PDF`);
  return {
    buffer,
    mime: type.mime,
    extension: type.extension,
    size: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

/** Check a whole submission: 1–10 files, each valid. */
export function checkSubmission(buffers: Buffer[]): CheckedFile[] {
  if (buffers.length === 0) throw new ReceiptFileError('กรุณาเพิ่มใบเสร็จอย่างน้อย 1 ใบ');
  if (buffers.length > RECEIPT_MAX_FILES) {
    throw new ReceiptFileError(`ส่งได้ครั้งละไม่เกิน ${RECEIPT_MAX_FILES} ใบ`);
  }
  return buffers.map((b, i) => checkFile(b, `ใบเสร็จที่ ${i + 1}`));
}
