import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  formatNumber,
  formatThaiDate,
  formatThaiDateTime,
  formatThaiShortDate,
  formatThaiShortDateTime,
} from './format';

// 2026-10-10 07:32 UTC = 14:32 in Bangkok (UTC+7)
const sample = '2026-10-10T07:32:00Z';

describe('Thai date formatting', () => {
  it('uses Buddhist era and Bangkok time', () => {
    expect(formatThaiDate(sample)).toBe('10 ต.ค. 2569');
    expect(formatThaiDateTime(sample)).toBe('10 ต.ค. 2569 14:32');
    expect(formatThaiShortDate(sample)).toBe('10/10/2569');
    expect(formatThaiShortDateTime(sample)).toBe('10/10/2569 14:32');
  });

  it('rolls over to the next Bangkok day', () => {
    expect(formatThaiShortDate('2026-10-10T18:00:00Z')).toBe('11/10/2569');
  });
});

describe('number formatting', () => {
  it('formats money with 2 decimals', () => {
    expect(formatMoney(1250)).toBe('1,250.00');
  });
  it('formats integers with separators', () => {
    expect(formatNumber(18420)).toBe('18,420');
  });
});
