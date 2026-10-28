import { presetRange, type RangePreset } from '@getpoint/shared';
import { todayInBangkok } from '../pages/point-rules/ruleDisplay';
import { longDay, shortDay } from './charts/chartUtils';

export interface RangeValue {
  preset: RangePreset;
  from: string;
  to: string;
}

/** Default for the Dashboard and Reports: this month so far. */
export const thisMonth = (): RangeValue => ({
  preset: 'month',
  ...presetRange('month', todayInBangkok()),
});

/** "1 – 27 ต.ค. 2569", "28 ก.ย. – 27 ต.ค. 2569", "27 ต.ค. 2569" */
export function rangeText(from: string, to: string): string {
  if (from === to) return longDay(from);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))} – ${longDay(to)}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${shortDay(from)} – ${longDay(to)}`;
  return `${longDay(from)} – ${longDay(to)}`;
}
