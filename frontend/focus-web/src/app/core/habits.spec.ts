import { addMonths, fillRatio, isOverLimit, monthLabel, monthOf, nextCount, orderForNow, progressLabel } from './habits';
import { Habit, HabitDayItem } from './models';

function habit(patch: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    title: 'Walk',
    icon: '🚶',
    month: null,
    repeat: { frequency: 'daily', interval: 1, weekdays: [], monthDay: null, startDate: '2026-11-01' },
    target: null,
    unit: null,
    kind: 'build',
    timeOfDay: 'anytime',
    countsFocusMinutes: false,
    sortOrder: 0,
    archivedAt: null,
    ...patch,
  };
}

function item(h: Habit, count = 0): HabitDayItem {
  return { habit: h, count, skipped: false, done: false, missedYesterday: false };
}

describe('habits', () => {
  it('labels progress', () => {
    expect(progressLabel(habit(), 1)).toBe('');
    expect(progressLabel(habit({ target: 8, unit: 'h' }), 5)).toBe('5/8 h');
    expect(progressLabel(habit({ target: 3 }), 2)).toBe('2/3');
    expect(progressLabel(habit({ target: 2, unit: 'cups', kind: 'avoid' }), 3)).toBe('3/≤2 cups');
  });

  it('toggles ticks and counts up counted habits', () => {
    expect(nextCount(item(habit(), 0))).toBe(1);
    expect(nextCount(item(habit(), 1))).toBe(0);
    expect(nextCount(item(habit({ target: 8 }), 5))).toBe(6);
  });

  it('computes fill and limits', () => {
    expect(fillRatio(habit({ target: 8 }), 4)).toBe(0.5);
    expect(fillRatio(habit({ target: 8 }), 12)).toBe(1);
    expect(fillRatio(habit(), 1)).toBe(1);
    expect(isOverLimit(habit({ target: 2, kind: 'avoid' }), 3)).toBe(true);
    expect(isOverLimit(habit({ target: 2 }), 3)).toBe(false);
  });

  it('orders by time of day', () => {
    const items = [
      item(habit({ id: 1, timeOfDay: 'evening' })),
      item(habit({ id: 2, timeOfDay: 'anytime' })),
      item(habit({ id: 3, timeOfDay: 'morning' })),
    ];
    expect(orderForNow(items, 8).map((i) => i.habit.id)).toEqual([3, 2, 1]);
    expect(orderForNow(items, 21).map((i) => i.habit.id)).toEqual([1, 2, 3]);
    expect(orderForNow(items, 14).map((i) => i.habit.id)).toEqual([3, 2, 1]);
  });

  it('works with months', () => {
    expect(monthOf('2026-12-24')).toBe('2026-12-01');
    expect(addMonths('2026-12-24', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
    expect(monthLabel('2026-12-01')).toBe('December 2026');
  });
});
