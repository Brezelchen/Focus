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
}

export interface StatsSummary {
  from: IsoDate;
  to: IsoDate;
  days: DayStat[];
  totals: { planned: number; done: number; completionRate: number; focusMinutes: number; sessions: number };
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
}
