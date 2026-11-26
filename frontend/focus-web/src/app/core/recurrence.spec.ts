import { describeRepeat, ordinal, sameRepeat, shortRepeat } from './recurrence';

describe('recurrence', () => {
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '31st']);
  });

  it('describes daily rules', () => {
    expect(describeRepeat({ frequency: 'daily', interval: 1 })).toBe('Every day');
    expect(describeRepeat({ frequency: 'daily', interval: 2 })).toBe('Every 2 days');
    expect(shortRepeat({ frequency: 'daily', interval: 2 })).toBe('2d');
  });

  it('describes weekly rules', () => {
    expect(describeRepeat({ frequency: 'weekly', interval: 1, weekdays: ['monday'] })).toBe('Every Monday');
    expect(describeRepeat({ frequency: 'weekly', interval: 1, weekdays: ['friday', 'monday', 'wednesday'] })).toBe('Every Mon, Wed & Fri');
    expect(describeRepeat({ frequency: 'weekly', interval: 1, weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] })).toBe('Every weekday');
    expect(describeRepeat({ frequency: 'weekly', interval: 2, weekdays: ['monday'] })).toBe('Every 2 weeks on Monday');
    expect(shortRepeat({ frequency: 'weekly', interval: 1, weekdays: ['friday', 'monday'] })).toBe('Mon·Fri');
  });

  it('describes monthly rules', () => {
    expect(describeRepeat({ frequency: 'monthly', interval: 1, monthDay: 1 })).toBe('Monthly on the 1st');
    expect(describeRepeat({ frequency: 'monthly', interval: 3, monthDay: 15 })).toBe('Every 3 months on the 15th');
    expect(describeRepeat({ frequency: 'monthly', interval: 1, monthDay: 31 })).toBe('Monthly on the last day');
    expect(shortRepeat({ frequency: 'monthly', interval: 1, monthDay: 1 })).toBe('1st');
  });

  it('compares rules regardless of weekday order and start date', () => {
    expect(sameRepeat({ frequency: 'weekly', interval: 1, weekdays: ['friday', 'monday'] }, {
      frequency: 'weekly', interval: 1, weekdays: ['monday', 'friday'], monthDay: null, startDate: '2026-11-25',
    })).toBe(true);
    expect(sameRepeat({ frequency: 'daily', interval: 1 }, { frequency: 'daily', interval: 2 })).toBe(false);
    expect(sameRepeat(null, undefined)).toBe(true);
    expect(sameRepeat(null, { frequency: 'daily', interval: 1 })).toBe(false);
  });
});
