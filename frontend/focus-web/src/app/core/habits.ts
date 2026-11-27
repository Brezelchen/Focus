import { parseIsoDate, toIsoDate } from './dates';
import { Habit, HabitDayItem, HabitTimeOfDay, IsoDate } from './models';

/** "5/8 h", "2/≤3 cups" for limits, "" for simple ticks. */
export function progressLabel(habit: Habit, count: number): string {
  if (habit.target === null) return '';
  const unit = habit.unit ? ` ${habit.unit}` : '';
  return habit.kind === 'avoid' ? `${count}/≤${habit.target}${unit}` : `${count}/${habit.target}${unit}`;
}

/** The count after tapping a habit: ticks toggle, counted habits go up by one. */
export function nextCount(item: HabitDayItem): number {
  if (item.habit.target === null) return item.count > 0 ? 0 : 1;
  return item.count + 1;
}

/** Whether a count completes the habit (mirrors the server: limits are met while count ≤ target). */
export function meets(habit: Habit, count: number): boolean {
  if (habit.kind === 'avoid' && habit.target !== null) return count <= habit.target;
  return count >= (habit.target ?? 1);
}

/** How full a counted habit is, 0..1 (limits: how much of the allowance is used). */
export function fillRatio(habit: Habit, count: number): number {
  if (habit.target === null) return count > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, count / habit.target));
}

/** Limits can be exceeded; that's the only "over" state. */
export function isOverLimit(habit: Habit, count: number): boolean {
  return habit.kind === 'avoid' && habit.target !== null && count > habit.target;
}

/** The time of day a moment belongs to, for ordering habits. */
export function partOfDay(hour: number): Exclude<HabitTimeOfDay, 'anytime'> | 'afternoon' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Morning habits first in the morning, evening habits first in the evening; otherwise the list order. */
export function orderForNow<T extends { habit: Habit }>(items: T[], hour: number): T[] {
  const now = partOfDay(hour);
  const rank = (t: HabitTimeOfDay): number => {
    if (t === 'anytime') return 1;
    if (now === 'afternoon') return t === 'morning' ? 0 : 2;
    return t === now ? 0 : 2;
  };
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rank(a.item.habit.timeOfDay) - rank(b.item.habit.timeOfDay) || a.i - b.i)
    .map((x) => x.item);
}

/** The 1st of the month of a date. */
export function monthOf(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(month: IsoDate, delta: number): IsoDate {
  const d = parseIsoDate(monthOf(month));
  return toIsoDate(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

/** "December 2026". */
export function monthLabel(month: IsoDate): string {
  return parseIsoDate(monthOf(month)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "December". */
export function monthName(month: IsoDate): string {
  return parseIsoDate(monthOf(month)).toLocaleDateString('en-US', { month: 'long' });
}

const MONTH_REVIEW_KEY = 'focus.monthReviewDone.';

/** Whether this browser already did (or skipped) the month review for a month. */
export function monthReviewDone(month: IsoDate): boolean {
  try {
    return localStorage.getItem(MONTH_REVIEW_KEY + monthOf(month)) === '1';
  } catch {
    return false;
  }
}

export function markMonthReviewDone(month: IsoDate): void {
  try {
    localStorage.setItem(MONTH_REVIEW_KEY + monthOf(month), '1');
  } catch {
    /* storage unavailable */
  }
}

/** Emoji choices for a month's intention (month review and the Habits page). */
export const INTENTION_EMOJIS = ['🌙', '🌱', '🔥', '🧘', '💪', '📚', '🌊', '☀️', '🎯', '💛'];
