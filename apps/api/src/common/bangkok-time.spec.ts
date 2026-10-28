import { bangkokDayEnd, bangkokDayStart, bangkokMonthStart, isCalendarDay } from './bangkok-time';

describe('Bangkok time helpers', () => {
  it('turns a calendar day into a Bangkok-midnight range', () => {
    expect(bangkokDayStart('2026-10-01').toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(bangkokDayEnd('2026-10-31').toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });

  it('finds the start of the Bangkok month, also just after midnight on the 1st', () => {
    expect(bangkokMonthStart(new Date('2026-10-22T06:00:00Z')).toISOString()).toBe(
      '2026-09-30T17:00:00.000Z',
    );
    // 1 Nov 00:30 in Bangkok is still 31 Oct in UTC.
    expect(bangkokMonthStart(new Date('2026-10-31T17:30:00Z')).toISOString()).toBe(
      '2026-10-31T17:00:00.000Z',
    );
  });
});

describe('isCalendarDay', () => {
  it('accepts real days only', () => {
    expect(isCalendarDay('2028-02-29')).toBe(true);
    expect(isCalendarDay('2026-02-29')).toBe(false);
    expect(isCalendarDay('2026-02-31')).toBe(false);
    expect(isCalendarDay('2026-13-01')).toBe(false);
  });
});
