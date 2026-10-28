import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, orderedRejectReasons, renderRemark } from './settings';

describe('renderRemark', () => {
  it('fills in the receipt code and shop', () => {
    expect(
      renderRemark(DEFAULT_SETTINGS.transferRemark, { code: 'GP001', shop: 'ร้านกาแฟ A' }),
    ).toBe('สะสมแต้มจากใบเสร็จ GP001 · ร้านกาแฟ A');
    expect(renderRemark('{code}/{code}', { code: 'GP1', shop: '' })).toBe('GP1/GP1');
    expect(renderRemark('x'.repeat(300), { code: '', shop: '' })).toHaveLength(200);
  });
});

describe('orderedRejectReasons', () => {
  it('lists enabled reasons in order; "Other" can never be hidden', () => {
    const reasons = structuredClone(DEFAULT_SETTINGS.rejectReasons);
    reasons.UNREADABLE.sortOrder = 99;
    reasons.ALTERED.enabled = false;
    reasons.OTHER.enabled = false;
    const list = orderedRejectReasons(reasons).map((r) => r.reason);
    expect(list[0]).toBe('DUPLICATE');
    expect(list.at(-1)).toBe('UNREADABLE');
    expect(list).not.toContain('ALTERED');
    expect(list).toContain('OTHER');
  });

  it('defaults to the nine confirmed reasons with their member messages', () => {
    const list = orderedRejectReasons(DEFAULT_SETTINGS.rejectReasons);
    expect(list).toHaveLength(9);
    expect(list.find((r) => r.reason === 'OTHER')?.memberMessage).toBe(
      'ใบเสร็จไม่ผ่านการตรวจสอบ กรุณาติดต่อเจ้าหน้าที่',
    );
  });
});
