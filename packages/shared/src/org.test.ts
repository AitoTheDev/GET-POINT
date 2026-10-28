import { describe, expect, it } from 'vitest';
import { THAI_PROVINCES } from './org';

describe('THAI_PROVINCES', () => {
  it('lists all 77 provinces once', () => {
    expect(THAI_PROVINCES).toHaveLength(77);
    expect(new Set(THAI_PROVINCES).size).toBe(77);
    expect(THAI_PROVINCES).toContain('กรุงเทพมหานคร');
  });
});
