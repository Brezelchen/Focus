import { fuzzyScore } from './fuzzy';

describe('fuzzyScore', () => {
  it('matches everything for an empty query', () => {
    expect(fuzzyScore('  ', 'Anything')).toBe(0);
  });

  it('returns null when a word does not match', () => {
    expect(fuzzyScore('xyz', 'Go to stats')).toBeNull();
    expect(fuzzyScore('stats zzz', 'Go to stats')).toBeNull();
  });

  it('matches substrings case-insensitively', () => {
    expect(fuzzyScore('STAT', 'Go to stats')).not.toBeNull();
  });

  it('matches letters in order (subsequence)', () => {
    expect(fuzzyScore('gts', 'Go to stats')).not.toBeNull();
    expect(fuzzyScore('stg', 'Go to stats')).toBeNull();
  });

  it('prefers a match at the start of a word over one in the middle', () => {
    const start = fuzzyScore('art', 'Art class')!;
    const middle = fuzzyScore('art', 'Start class')!;
    expect(start).toBeGreaterThan(middle);
  });

  it('prefers substring matches over scattered letters', () => {
    expect(fuzzyScore('focus', 'Start focus')!).toBeGreaterThan(fuzzyScore('focus', 'Find our cute spoons')!);
  });

  it('requires every word and adds up their scores', () => {
    expect(fuzzyScore('write report', 'Write the weekly report')).not.toBeNull();
    expect(fuzzyScore('report write', 'Write the weekly report')).not.toBeNull();
  });

  it('prefers shorter texts when otherwise equal', () => {
    expect(fuzzyScore('gym', 'Gym')!).toBeGreaterThan(fuzzyScore('gym', 'Gym with a very long title')!);
  });
});
