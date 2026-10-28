import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  memberRejectMessage,
  normalizeReceiptNo,
  REJECT_REASONS,
  RejectReasonLabel,
} from './receipts';

describe('reject reasons', () => {
  it('has the nine confirmed reasons, with Other last', () => {
    expect(REJECT_REASONS).toHaveLength(9);
    expect(REJECT_REASONS.at(-1)).toBe('OTHER');
    expect(RejectReasonLabel.UNREADABLE).toBe('รูปภาพไม่ชัดเจน อ่านไม่ได้');
  });

  it('shows members the reason, but a general message for Other', () => {
    expect(memberRejectMessage('DUPLICATE')).toBe('ใบเสร็จซ้ำ');
    expect(memberRejectMessage('OTHER')).toBe('ใบเสร็จไม่ผ่านการตรวจสอบ กรุณาติดต่อเจ้าหน้าที่');
  });
});

describe('normalizeReceiptNo', () => {
  it('ignores case, spaces and separators', () => {
    expect(normalizeReceiptNo('a 00125')).toBe('A00125');
    expect(normalizeReceiptNo('A-00125')).toBe('A00125');
    expect(normalizeReceiptNo('#inv/2026.10_7')).toBe('INV2026107');
  });
});

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(-30);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
});
