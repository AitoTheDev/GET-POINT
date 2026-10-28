import type { PointRule } from '../../api/pointRules';

/** "2026-10-01" → "01/10/2569" without time-zone conversion (rule dates are calendar days). */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${Number(y) + 543}`;
}

/** "01/10/2569 – ไม่กำหนด" */
export const rangeLabel = (r: { startDate: string; endDate: string | null }) =>
  `${dayLabel(r.startDate)} – ${r.endDate ? dayLabel(r.endDate) : 'ไม่กำหนด'}`;

/** The สถานที่ and ร้านค้า columns, as in the mockup. */
export function placeLabels(rule: PointRule): { place: string; shop: string } {
  if (rule.shop) return { place: rule.shop.location.name, shop: rule.shop.name };
  if (rule.location) return { place: rule.location.name, shop: 'ทุกร้านค้า' };
  return { place: `ทุกสถานที่ใน ${rule.community?.name ?? ''}`, shop: 'ทุกร้านค้า' };
}

/** Today in Bangkok as YYYY-MM-DD. */
export function todayInBangkok(now = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
