import { addDays, dayDiff, formatMinutes, parseIsoDate, relativeDayName, toIsoDate } from './dates';

describe('dates', () => {
  it('formats local dates without shifting through UTC', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(toIsoDate(parseIsoDate('2026-03-29'))).toBe('2026-03-29');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('computes whole-day differences across DST changes', () => {
    expect(dayDiff('2026-03-30', '2026-03-28')).toBe(2);
    expect(dayDiff('2026-10-26', '2026-10-24')).toBe(2);
  });

  it('names days relative to today', () => {
    expect(relativeDayName('2026-11-25', '2026-11-25')).toBe('Today');
    expect(relativeDayName('2026-11-26', '2026-11-25')).toBe('Tomorrow');
    expect(relativeDayName('2026-11-24', '2026-11-25')).toBe('Yesterday');
    expect(relativeDayName('2026-11-27', '2026-11-25')).toBe('Friday');
  });

  it('formats minutes compactly', () => {
    expect(formatMinutes(null)).toBe('');
    expect(formatMinutes(30)).toBe('30m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(95)).toBe('1h 35m');
  });
});
