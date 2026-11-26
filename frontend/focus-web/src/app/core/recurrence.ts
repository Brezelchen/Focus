import { Recurrence, RecurrenceInput, WEEKDAYS, Weekday } from './models';

const SHORT: Record<Weekday, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

const LONG: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const WORKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

/** 1 → "1st", 22 → "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
}

function sortDays(days: Weekday[]): Weekday[] {
  return WEEKDAYS.filter((d) => days.includes(d));
}

function listDays(days: Weekday[], names: Record<Weekday, string>): string {
  const sorted = sortDays(days);
  if (sorted.length === 7) return 'day';
  if (sorted.length === 5 && WORKDAYS.every((d) => sorted.includes(d))) return 'weekday';
  const parts = sorted.map((d) => names[d]);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} & ${parts.at(-1)}` : parts[0];
}

type Rule = Pick<Recurrence, 'frequency' | 'interval'> & { weekdays?: Weekday[]; monthDay?: number | null };

function monthDayText(day: number): string {
  return day >= 31 ? 'the last day' : `the ${ordinal(day)}`;
}

/** Sentence for a rule: "Every day", "Every 2 days", "Every Mon, Wed & Fri", "Every 2 weeks on Monday", "Monthly on the 1st". */
export function describeRepeat(r: Rule): string {
  const n = Math.max(1, r.interval);
  switch (r.frequency) {
    case 'daily':
      return n === 1 ? 'Every day' : `Every ${n} days`;
    case 'weekly': {
      const days = r.weekdays?.length ? r.weekdays : [];
      const many = days.length > 2;
      const list = days.length ? listDays(days, many ? SHORT : LONG) : 'week';
      return n === 1 ? `Every ${list}` : `Every ${n} weeks on ${list === 'weekday' ? 'weekdays' : list}`;
    }
    case 'monthly': {
      const on = r.monthDay ? ` on ${monthDayText(r.monthDay)}` : '';
      return n === 1 ? `Monthly${on}` : `Every ${n} months${on}`;
    }
  }
}

/** Compact label for chips: "daily", "2d", "Mon", "Mon·Fri", "weekdays", "1st", "3mo · 1st". */
export function shortRepeat(r: Rule): string {
  const n = Math.max(1, r.interval);
  switch (r.frequency) {
    case 'daily':
      return n === 1 ? 'daily' : `${n}d`;
    case 'weekly': {
      const days = sortDays(r.weekdays ?? []);
      const label =
        days.length === 7 ? 'daily' : days.length === 5 && WORKDAYS.every((d) => days.includes(d)) ? 'weekdays' : days.map((d) => SHORT[d]).join('·');
      return n === 1 ? label || 'weekly' : `${n}w · ${label}`;
    }
    case 'monthly': {
      const day = r.monthDay ? (r.monthDay >= 31 ? 'last' : ordinal(r.monthDay)) : '';
      return n === 1 ? day || 'monthly' : `${n}mo${day ? ' · ' + day : ''}`;
    }
  }
}

/** Whether two rules repeat the same way (ignores the start date). */
export function sameRepeat(a: RecurrenceInput | Recurrence | null | undefined, b: RecurrenceInput | Recurrence | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.frequency === b.frequency &&
    a.interval === b.interval &&
    (a.frequency !== 'weekly' || sortDays(a.weekdays ?? []).join() === sortDays(b.weekdays ?? []).join()) &&
    (a.frequency !== 'monthly' || (a.monthDay ?? null) === (b.monthDay ?? null))
  );
}
