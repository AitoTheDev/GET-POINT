// Thailand has no daylight saving: Bangkok time is always UTC+7.
const OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight in Bangkok at the start of "YYYY-MM-DD". */
export const bangkokDayStart = (day: string) => new Date(`${day}T00:00:00.000+07:00`);

/** Midnight in Bangkok at the start of the day after "YYYY-MM-DD" (exclusive upper bound). */
export const bangkokDayEnd = (day: string) => new Date(bangkokDayStart(day).getTime() + DAY_MS);

/** Midnight in Bangkok on the 1st of the current Bangkok month. */
export function bangkokMonthStart(now = new Date()): Date {
  const local = new Date(now.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET_MS);
}
