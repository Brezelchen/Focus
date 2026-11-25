import { IsoDate } from './models';

/** Local calendar date of `d` as yyyy-MM-dd. */
export function toIsoDate(d: Date = new Date()): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): IsoDate {
  return toIsoDate(new Date());
}

/** Parses yyyy-MM-dd as a local date (not UTC, unlike `new Date(iso)`). */
export function parseIsoDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function dayDiff(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIsoDate(a).getTime() - parseIsoDate(b).getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "Yesterday", or e.g. "Friday". */
export function relativeDayName(iso: IsoDate, today: IsoDate = todayIso()): string {
  const diff = dayDiff(iso, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return parseIsoDate(iso).toLocaleDateString('en-US', { weekday: 'long' });
}

export function longDate(iso: IsoDate): string {
  return parseIsoDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** 95 → "1h 35m", 30 → "30m". */
export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

/** Short label + urgency for a due date, e.g. "2d overdue", "Due today", "Fri", "Dec 24". */
export function dueLabel(due: IsoDate, today: IsoDate = todayIso()): { text: string; state: DueState } {
  const diff = dayDiff(due, today);
  if (diff < 0) return { text: diff === -1 ? 'Due yesterday' : `${-diff}d overdue`, state: 'overdue' };
  if (diff === 0) return { text: 'Due today', state: 'today' };
  if (diff === 1) return { text: 'Due tomorrow', state: 'soon' };
  const d = parseIsoDate(due);
  if (diff < 7) return { text: 'Due ' + d.toLocaleDateString('en-US', { weekday: 'short' }), state: 'soon' };
  return { text: 'Due ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), state: 'later' };
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}
