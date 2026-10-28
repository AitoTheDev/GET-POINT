import type { RoundingMode } from '@getpoint/shared';
import dayjs, { type Dayjs } from 'dayjs';
import type { PointRule } from '../../api/pointRules';
import { todayInBangkok } from './ruleDisplay';

export interface RuleFormValues {
  /** "community:<id>" or "location:<id>" */
  place?: string;
  /** "" = every shop at the Location */
  shopId: string;
  spendAmount?: number;
  points?: number;
  rounding: RoundingMode;
  capEnabled: boolean;
  maxPoints?: number;
  startDate?: Dayjs;
  endDate?: Dayjs | null;
  noEnd: boolean;
  active: boolean;
}

/** Defaults for a new rule: the mockup's 25 baht = 1 point, round down, starting today. */
export const newRule = (): RuleFormValues => ({
  shopId: '',
  spendAmount: 25,
  points: 1,
  rounding: 'FLOOR',
  capEnabled: false,
  startDate: dayjs(todayInBangkok()),
  noEnd: true,
  active: true,
});

/** Form values for editing `rule`. */
export function valuesOf(rule: PointRule): RuleFormValues {
  const place = rule.community
    ? `community:${rule.community.id}`
    : `location:${(rule.location ?? rule.shop!.location).id}`;
  return {
    place,
    shopId: rule.shop?.id ?? '',
    spendAmount: rule.spendAmount,
    points: rule.points,
    rounding: rule.rounding,
    capEnabled: rule.maxPoints !== null,
    maxPoints: rule.maxPoints ?? undefined,
    startDate: dayjs(rule.startDate),
    endDate: rule.endDate ? dayjs(rule.endDate) : null,
    noEnd: rule.endDate === null,
    active: rule.status === 'ACTIVE',
  };
}
