import { parseQuickAdd } from './quick-add';

describe('parseQuickAdd', () => {
  const today = '2026-11-26'; // a Thursday

  it('pulls every token out of the title', () => {
    expect(parseQuickAdd('Write report #work ~1h30 !high @fri', today)).toEqual({
      title: 'Write report',
      tagName: 'work',
      estimateMinutes: 90,
      priority: 'high',
      dueDate: '2026-11-27',
      errors: [],
    });
  });

  it('understands relative and explicit due dates', () => {
    expect(parseQuickAdd('x @today', today).dueDate).toBe('2026-11-26');
    expect(parseQuickAdd('x @thu', today).dueDate).toBe('2026-11-26');
    expect(parseQuickAdd('x @nextweek', today).dueDate).toBe('2026-11-30');
    expect(parseQuickAdd('x @24.12', today).dueDate).toBe('2026-12-24');
    expect(parseQuickAdd('x @1.3', today).dueDate).toBe('2027-03-01');
    expect(parseQuickAdd('x @2027-01-05', today).dueDate).toBe('2027-01-05');
  });

  it('keeps plain words and lone punctuation in the title', () => {
    expect(parseQuickAdd('Call mom ! #', today)).toMatchObject({ title: 'Call mom ! #', errors: [] });
  });

  it('reports shorthand that does not parse instead of keeping it in the title', () => {
    const r = parseQuickAdd('Email @bob ~0m !urgent #a.b', today);
    expect(r.title).toBe('Email');
    expect(r.errors).toHaveLength(4);
    expect(r.errors[0]).toContain('"@bob"');
  });

  it('reports duplicates and due dates on templates', () => {
    expect(parseQuickAdd('x #a #b', today).errors).toEqual(['Only one #tag per task.']);
    expect(parseQuickAdd('x @fri', today, false)).toMatchObject({ dueDate: null, errors: [`Templates can't have a due date ("@fri").`] });
  });
});
