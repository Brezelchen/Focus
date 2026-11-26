import { addDays, parseIsoDate, toIsoDate, todayIso } from './dates';
import { IsoDate, Priority } from './models';

export interface QuickAddResult {
  title: string;
  tagName: string | null;
  estimateMinutes: number | null;
  priority: Priority | null;
  dueDate: IsoDate | null;
  /** One message per shorthand token that couldn't be used (unknown value or a duplicate). */
  errors: string[];
}

/**
 * Client-side twin of the backend QuickAddParser: pulls `#tag`, `~45m`, `!high` and `@fri` out of text.
 * Keep the two in sync. Plain words stay in the title; shorthand-looking tokens that don't parse go to `errors`.
 */
export function parseQuickAdd(text: string, today: IsoDate = todayIso(), allowDue = true): QuickAddResult {
  const r: QuickAddResult = { title: '', tagName: null, estimateMinutes: null, priority: null, dueDate: null, errors: [] };
  const titleParts: string[] = [];

  for (const token of text.split(' ').map((t) => t.trim()).filter(Boolean)) {
    if (allowDue && r.dueDate === null) {
      const due = parseDue(token, today);
      if (due) {
        r.dueDate = due;
        continue;
      }
    }
    if (r.tagName === null) {
      const m = TAG.exec(token);
      if (m) {
        r.tagName = m[1];
        continue;
      }
    }
    if (r.estimateMinutes === null) {
      const minutes = parseEstimate(token);
      if (minutes !== null) {
        r.estimateMinutes = minutes;
        continue;
      }
    }
    if (r.priority === null) {
      const p = parsePriority(token);
      if (p) {
        r.priority = p;
        continue;
      }
    }
    const problem = shorthandProblem(token, today, allowDue);
    if (problem) r.errors.push(problem);
    else titleParts.push(token);
  }

  r.title = titleParts.join(' ');
  return r;
}

/** Why a token that looks like shorthand (`#x`, `~x`, `!x`, `@x`) couldn't be used, or null for plain words. */
function shorthandProblem(token: string, today: IsoDate, allowDue: boolean): string | null {
  if (token.length < 2) return null; // a lone "#" or "!" is just punctuation
  switch (token[0]) {
    case '#':
      return TAG.test(token) ? 'Only one #tag per task.' : `"${token}" isn't a valid tag. Use letters, numbers, - or _.`;
    case '~':
      return parseEstimate(token) !== null
        ? 'Only one ~time estimate per task.'
        : `"${token}" isn't a time estimate. Try ~30m, ~1h or ~1h30.`;
    case '!':
      return parsePriority(token) ? 'Only one !priority per task.' : `"${token}" isn't a priority. Use !high, !normal or !low.`;
    case '@':
      if (!allowDue) return `Templates can't have a due date ("${token}").`;
      return parseDue(token, today)
        ? 'Only one @due date per task.'
        : `"${token}" isn't a date. Try @today, @tomorrow, @fri, @nextweek or @24.12.`;
    default:
      return null;
  }
}

const TAG = /^#([\p{L}\p{N}_-]{1,40})$/u;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseDue(token: string, today: IsoDate): IsoDate | null {
  if (token.length < 2 || token[0] !== '@') return null;
  const v = token.slice(1).toLowerCase();
  const dow = parseIsoDate(today).getDay();

  switch (v) {
    case 'today':
      return today;
    case 'tomorrow':
    case 'tmr':
      return addDays(today, 1);
    case 'nextweek':
      return addDays(today, (1 - dow + 7) % 7 || 7);
  }

  if (v.length >= 3) {
    const d = WEEKDAYS.findIndex((w) => w.startsWith(v));
    if (d >= 0) return addDays(today, (d - dow + 7) % 7);
  }

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return validDate(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(v);
  if (m) return validDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);

  m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(v);
  if (m) {
    // Day.month without a year means the next such date.
    const year = parseIsoDate(today).getFullYear();
    const date = validDate(year, +m[2], +m[1]);
    if (date && date < today) return validDate(year + 1, +m[2], +m[1]);
    return date;
  }
  return null;
}

function validDate(y: number, mo: number, d: number): IsoDate | null {
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? toIsoDate(date) : null;
}

/**
 * A duration typed by hand, e.g. "40", "40m", "1h20", "1h 20m", "1.5h", "1:30". Minutes, 1 to 24 hours; null if invalid.
 * Uses the same rules as the `~45m` shorthand.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().replace(/^~/, '').replace(/\s+/g, '').toLowerCase();
  const clock = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (clock) {
    const minutes = +clock[1] * 60 + +clock[2];
    return +clock[2] < 60 && minutes > 0 && minutes <= 24 * 60 ? minutes : null;
  }
  return parseEstimate('~' + t.replace(/min$/, 'm'));
}

function parseEstimate(token: string): number | null {
  const m = /^~(?:(\d+(?:[.,]\d+)?)h(?:(\d{1,2})m?)?|(\d+)m?)$/i.exec(token);
  if (!m) return null;
  const total = m[1] !== undefined ? parseFloat(m[1].replace(',', '.')) * 60 + (m[2] ? +m[2] : 0) : +m[3];
  const minutes = Math.round(total);
  return minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

function parsePriority(token: string): Priority | null {
  switch (token.toLowerCase()) {
    case '!!':
    case '!high':
    case '!h':
      return 'high';
    case '!low':
    case '!l':
      return 'low';
    case '!normal':
    case '!n':
      return 'normal';
    default:
      return null;
  }
}
