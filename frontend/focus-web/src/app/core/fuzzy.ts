/**
 * Scores how well `query` matches `text` for the command palette. Higher is better; `null` means no match.
 * Every whitespace-separated word of the query must match, either as a substring (best, especially at the
 * start of a word) or as a subsequence of letters ("stt" → "Stats").
 */
export function fuzzyScore(query: string, text: string): number | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const haystack = text.toLowerCase();

  let total = 0;
  for (const word of words) {
    const score = wordScore(word, haystack);
    if (score === null) return null;
    total += score;
  }
  // Prefer shorter texts when the match is otherwise equal.
  return total - haystack.length * 0.01;
}

const BOUNDARY = /[\s\-_/#.,:(]/;

function isWordStart(text: string, index: number): boolean {
  return index === 0 || BOUNDARY.test(text[index - 1]);
}

function wordScore(word: string, text: string): number | null {
  const at = text.indexOf(word);
  if (at >= 0) {
    let score = 100 + word.length * 4;
    if (at === 0) score += 60;
    else if (isWordStart(text, at)) score += 40;
    // A later occurrence may start a word ("art" in "Start the art class").
    const wordStartHit = text.split(BOUNDARY).some((w) => w.startsWith(word));
    if (at !== 0 && !isWordStart(text, at) && wordStartHit) score += 40;
    return score;
  }

  // Subsequence: every letter in order, rewarding consecutive letters and word starts.
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const ch of word) {
    const found = text.indexOf(ch, from);
    if (found < 0) return null;
    if (found === previous + 1) score += 6;
    else if (isWordStart(text, found)) score += 5;
    else score += 1;
    previous = found;
    from = found + 1;
  }
  return score;
}
