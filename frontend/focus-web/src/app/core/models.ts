/** ISO calendar date, e.g. "2026-11-25". */
export type IsoDate = string;

export type TaskStatus = 'open' | 'done';
export type Priority = 'low' | 'normal' | 'high';
export type TagColor = 'lavender' | 'mint' | 'coral' | 'honey' | 'sky' | 'rose';
export const TAG_COLORS: TagColor[] = ['lavender', 'mint', 'coral', 'honey', 'sky', 'rose'];

export interface Tag {
  id: number;
  name: string;
  color: TagColor;
}

export interface Task {
  id: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  plannedDate: IsoDate | null;
  /** Deadline. Independent of plannedDate (the day you plan to work on it). */
  dueDate: IsoDate | null;
  sortOrder: number;
  estimateMinutes: number | null;
  priority: Priority;
  tag: Tag | null;
  templateId: number | null;
  createdAt: string;
  completedAt: string | null;
  /** How often this task left a day unfinished. */
  postponedCount: number;
  /** Checklist, in order. */
  subtasks: Subtask[];
  /** Repeat rule of the task's series (its template), if it repeats. */
  repeat: Recurrence | null;
}

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export type RepeatFrequency = 'daily' | 'weekly' | 'monthly';

/** A repeat rule: every `interval` days / weeks (on `weekdays`) / months (on `monthDay`), counted from `startDate`. */
export interface Recurrence {
  frequency: RepeatFrequency;
  interval: number;
  /** Weekly: chosen days, Monday first. */
  weekdays: Weekday[];
  /** Monthly: day of the month; 31 = last day in shorter months. */
  monthDay: number | null;
  startDate: IsoDate;
}

/** A rule as sent to the server. Missing pieces get sensible defaults (e.g. start = the task's day). */
export interface RecurrenceInput {
  frequency: RepeatFrequency;
  interval: number;
  weekdays?: Weekday[];
  monthDay?: number | null;
  startDate?: IsoDate | null;
}

export interface Subtask {
  id: number;
  title: string;
  isDone: boolean;
}

/** A checklist row as sent when saving a task: `id` is null for new items. */
export interface SubtaskInput {
  id: number | null;
  title: string;
  isDone: boolean;
}

export interface Template {
  id: number;
  title: string;
  notes: string | null;
  icon: string;
  estimateMinutes: number | null;
  priority: Priority;
  tag: Tag | null;
  /** Checklist titles copied (unticked) into every task created from the template. */
  checklist: string[];
  useCount: number;
  lastUsedAt: string | null;
  repeat: Recurrence | null;
}

export interface Day {
  date: IsoDate;
  /** Open tasks in manual order, then done tasks in completion order. */
  tasks: Task[];
  planned: number;
  done: number;
  remainingEstimateMinutes: number;
  /** End-of-day reflection, if one was written. */
  note: DayNote | null;
}

export type Mood = 'rough' | 'meh' | 'okay' | 'good' | 'great';

export const MOODS: { id: Mood; emoji: string; label: string }[] = [
  { id: 'rough', emoji: '😣', label: 'Rough' },
  { id: 'meh', emoji: '😕', label: 'Meh' },
  { id: 'okay', emoji: '🙂', label: 'Okay' },
  { id: 'good', emoji: '😊', label: 'Good' },
  { id: 'great', emoji: '🤩', label: 'Great' },
];

export function moodEmoji(mood: Mood | null | undefined): string {
  return MOODS.find((m) => m.id === mood)?.emoji ?? '';
}

export interface DayNote {
  date: IsoDate;
  mood: Mood | null;
  reflection: string | null;
  updatedAt: string;
}

export interface DaySummary {
  date: IsoDate;
  planned: number;
  done: number;
}

export interface RolloverResult {
  previousDay: DaySummary | null;
  returnedTasks: Task[];
  /** Returned tasks that were planned on previousDay; they can still be marked done on that day. */
  previousDayTaskIds: number[];
}

export interface TaskInput {
  title: string;
  notes: string | null;
  estimateMinutes: number | null;
  priority: Priority;
  tagId: number | null;
  dueDate: IsoDate | null;
  /** Replaces the checklist; omit to keep it unchanged. */
  subtasks?: SubtaskInput[];
  /** Repeat rule (null = doesn't repeat); omit to leave it as it is. */
  repeat?: RecurrenceInput | null;
}

export interface TemplateInput extends TaskInput {
  icon: string;
  checklist?: string[];
}

export type FocusSessionStatus = 'running' | 'completed' | 'endedEarly';

export interface FocusSession {
  id: number;
  startedAt: string;
  endedAt: string | null;
  plannedMinutes: number;
  actualSeconds: number;
  status: FocusSessionStatus;
  tasks: { taskId: number; title: string; completedInSession: boolean }[];
}

export interface DayStat {
  date: IsoDate;
  planned: number;
  done: number;
  focusMinutes: number;
  mood: Mood | null;
  reflection: string | null;
  /** Habits scheduled (not skipped) that day. Never part of planned/done. */
  habitsDue: number;
  habitsDone: number;
}

export interface StatsSummary {
  from: IsoDate;
  to: IsoDate;
  days: DayStat[];
  totals: {
    planned: number;
    done: number;
    completionRate: number;
    focusMinutes: number;
    sessions: number;
    habitsDue: number;
    habitsDone: number;
    habitRate: number;
  };
  currentStreak: number;
  bestStreak: number;
  threshold: number;
}

export interface StatsInsights {
  topTemplates: Template[];
  mostPostponed: Task[];
  bestWeekday: { day: string; completionRate: number; daysCounted: number } | null;
  totalDone: number;
  totalFocusMinutes: number;
  sessionsCompleted: number;
  sessionsEndedEarly: number;
  habitStreaks: HabitStreak[];
  habitMoods: HabitMoodInsight[];
}

// ---- Habits ---------------------------------------------------------------------------------

export type HabitKind = 'build' | 'avoid';
export type HabitTimeOfDay = 'anytime' | 'morning' | 'evening';

/** A habit: ticked (or counted) on the days its repeat rule matches. Separate from tasks. */
export interface Habit {
  id: number;
  title: string;
  icon: string;
  /** null = the base list (every month); otherwise the 1st of the only month it belongs to. */
  month: IsoDate | null;
  repeat: Recurrence;
  /** null = a simple tick; otherwise the count to reach (or, for avoid habits, the limit). */
  target: number | null;
  unit: string | null;
  kind: HabitKind;
  timeOfDay: HabitTimeOfDay;
  /** The count is filled from the day's focus minutes. */
  countsFocusMinutes: boolean;
  sortOrder: number;
  /** First day the habit no longer applies, if archived. */
  archivedAt: IsoDate | null;
}

export interface HabitInput {
  title: string;
  icon: string | null;
  month: IsoDate | null;
  repeat: RecurrenceInput | null;
  target: number | null;
  unit: string | null;
  kind: HabitKind;
  timeOfDay: HabitTimeOfDay;
  countsFocusMinutes: boolean;
}

export interface HabitDayItem {
  habit: Habit;
  count: number;
  skipped: boolean;
  done: boolean;
  /** Due yesterday and not done: today is the "never miss twice" day. */
  missedYesterday: boolean;
}

export interface HabitMonthNote {
  month: IsoDate;
  word: string | null;
  emoji: string | null;
}

export interface HabitDay {
  date: IsoDate;
  /** Habits scheduled that day (skipped included), base list first. */
  items: HabitDayItem[];
  /** Scheduled and not skipped. */
  due: number;
  done: number;
  monthNote: HabitMonthNote | null;
}

export type HabitCellState = 'notDue' | 'open' | 'partial' | 'done' | 'skipped' | 'future' | 'missed';

export interface HabitCell {
  date: IsoDate;
  state: HabitCellState;
  count: number;
}

export interface HabitRow {
  habit: Habit;
  cells: HabitCell[];
  /** Done / due up to today; null when nothing was due yet. */
  rate: number | null;
  currentStreak: number;
  bestStreak: number;
  /** Times done (tick habits) or the summed count. */
  total: number;
}

export interface HabitMonth {
  month: IsoDate;
  note: HabitMonthNote | null;
  rows: HabitRow[];
}

export interface HabitHistory {
  row: HabitRow;
  from: IsoDate;
  to: IsoDate;
}

export interface HabitStreak {
  habitId: number;
  title: string;
  icon: string;
  current: number;
  best: number;
}

/** "On days you did X, you felt good N% of the time vs M% otherwise." */
export interface HabitMoodInsight {
  habitId: number;
  title: string;
  icon: string;
  goodRateWith: number;
  goodRateWithout: number;
  daysWith: number;
  daysWithout: number;
}
