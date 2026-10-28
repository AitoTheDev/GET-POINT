import { describe, expect, it } from 'vitest';
import { calculatePoints, formatRate, type PointFormula } from './pointRules';

const rule = (overrides: Partial<PointFormula> = {}): PointFormula => ({
  spendAmount: 25,
  points: 1,
  rounding: 'FLOOR',
  maxPoints: null,
  ...overrides,
});

describe('calculatePoints', () => {
  it('matches the mockup: 680 ÷ 25 = 27.2 → 27 points', () => {
    expect(calculatePoints(680, rule())).toEqual({ points: 27, exact: 27.2, capped: false });
  });

  it.each([
    ['FLOOR', 690, 27],
    ['ROUND', 690, 28], // 27.6
    ['CEIL', 680, 28], // 27.2
    ['ROUND', 687.5, 28], // exactly 27.5 rounds up
    ['ROUND', 687.49, 27],
    ['CEIL', 700, 28], // exact multiple stays
  ] as const)('%s rounding of %s baht gives %s', (rounding, amount, points) => {
    expect(calculatePoints(amount, rule({ rounding })).points).toBe(points);
  });

  it('rounds once per receipt, after multiplying by the points', () => {
    // 690 ÷ 25 × 3 = 82.8 → 82 (not 27 × 3 = 81)
    expect(calculatePoints(690, rule({ points: 3 })).points).toBe(82);
  });

  it('handles satang amounts and rates exactly', () => {
    expect(calculatePoints(0.3, rule({ spendAmount: 0.1 })).points).toBe(3);
    expect(calculatePoints(99.99, rule({ spendAmount: 33.33 })).points).toBe(3);
    expect(calculatePoints(24.99, rule()).points).toBe(0);
  });

  it('applies the maximum per receipt', () => {
    expect(calculatePoints(10_000, rule({ maxPoints: 100 }))).toEqual({
      points: 100,
      exact: 400,
      capped: true,
    });
    expect(calculatePoints(2_500, rule({ maxPoints: 100 })).capped).toBe(false);
  });

  it('gives 0 for empty or invalid input instead of failing', () => {
    expect(calculatePoints(0, rule()).points).toBe(0);
    expect(calculatePoints(Number.NaN, rule()).points).toBe(0);
    expect(calculatePoints(-5, rule()).points).toBe(0);
    expect(calculatePoints(100, rule({ spendAmount: 0 })).points).toBe(0);
  });

  it('copes with large receipts', () => {
    expect(calculatePoints(9_999_999.99, rule({ points: 1000 })).points).toBe(399_999_999);
  });
});

describe('formatRate', () => {
  it('formats like the mockup', () => {
    expect(formatRate({ spendAmount: 25, points: 1 })).toBe('25 บาท = 1 แต้ม');
    expect(formatRate({ spendAmount: 1500.5, points: 10 })).toBe('1,500.5 บาท = 10 แต้ม');
  });
});
