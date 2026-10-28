import { describe, expect, it } from 'vitest';
import { activityLabel, daysInRange, presetRange } from './activity';

describe('activityLabel', () => {
  it('names known actions in Thai and keeps unknown codes', () => {
    expect(activityLabel('receipt.approved')).toBe('อนุมัติใบเสร็จ');
    expect(activityLabel('something.new')).toBe('something.new');
  });
});

describe('presetRange', () => {
  it('works from the Bangkok date, inclusive', () => {
    expect(presetRange('today', '2026-10-27')).toEqual({ from: '2026-10-27', to: '2026-10-27' });
    expect(presetRange('7d', '2026-10-27')).toEqual({ from: '2026-10-21', to: '2026-10-27' });
    expect(presetRange('30d', '2026-03-01')).toEqual({ from: '2026-01-31', to: '2026-03-01' });
    expect(presetRange('month', '2026-10-27')).toEqual({ from: '2026-10-01', to: '2026-10-27' });
  });
});

describe('daysInRange', () => {
  it('lists every day, across month ends', () => {
    expect(daysInRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(daysInRange('2026-10-02', '2026-10-01')).toEqual([]);
  });
});
