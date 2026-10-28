/** How a fractional result is turned into whole points, once per receipt. */
export type RoundingMode = 'FLOOR' | 'ROUND' | 'CEIL';

export const ROUNDING_MODES: RoundingMode[] = ['FLOOR', 'ROUND', 'CEIL'];

export const RoundingModeLabel: Record<RoundingMode, string> = {
  FLOOR: 'ปัดเศษลงต่อใบเสร็จ',
  ROUND: 'ปัดเศษตามหลักคณิตศาสตร์ต่อใบเสร็จ (.5 ขึ้นไปปัดขึ้น)',
  CEIL: 'ปัดเศษขึ้นต่อใบเสร็จ',
};

/** Which level a rule is set on. Receipts use Shop, then Location, then Community. */
export type PointRuleLevel = 'SHOP' | 'LOCATION' | 'COMMUNITY';

export const PointRuleLevelLabel: Record<PointRuleLevel, string> = {
  SHOP: 'ร้านค้า',
  LOCATION: 'สถานที่',
  COMMUNITY: 'ทั้ง Community',
};

export interface PointFormula {
  /** "ยอดใช้จ่ายทุก" X baht … */
  spendAmount: number;
  /** … "ได้รับ" Y points. */
  points: number;
  rounding: RoundingMode;
  /** Optional cap per receipt. */
  maxPoints: number | null;
}

export interface PointCalculation {
  /** Points the member gets. */
  points: number;
  /** amount ÷ spendAmount × points before rounding, for display (e.g. 27.2). */
  exact: number;
  /** true when maxPoints lowered the result. */
  capped: boolean;
}

/** Baht with up to 2 decimals → whole satang, so the maths below is exact. */
const toSatang = (baht: number) => BigInt(Math.round(baht * 100));

/**
 * Points for one receipt: amount ÷ spendAmount × points, rounded once per receipt,
 * then limited to maxPoints. Uses integer maths (satang + BigInt) so results like
 * 680 ÷ 25 or 0.1 + 0.2 never suffer from floating-point error.
 */
export function calculatePoints(amount: number, formula: PointFormula): PointCalculation {
  if (!(amount >= 0) || !(formula.spendAmount > 0) || !(formula.points > 0)) {
    return { points: 0, exact: 0, capped: false };
  }
  const num = toSatang(amount) * BigInt(formula.points);
  const den = toSatang(formula.spendAmount);

  let whole: bigint;
  if (formula.rounding === 'FLOOR') whole = num / den;
  else if (formula.rounding === 'CEIL') whole = (num + den - 1n) / den;
  else whole = (2n * num + den) / (2n * den); // half up

  let points = Number(whole);
  const capped = formula.maxPoints !== null && points > formula.maxPoints;
  if (capped) points = formula.maxPoints!;
  // Two decimals are enough to show the working ("680 ÷ 25 = 27.2").
  const exact = Number((num * 100n) / den) / 100;
  return { points, exact, capped };
}

/** "25 บาท = 1 แต้ม" */
export const formatRate = (f: Pick<PointFormula, 'spendAmount' | 'points'>) =>
  `${f.spendAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} บาท = ${f.points.toLocaleString('en-US')} แต้ม`;
