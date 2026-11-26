import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { addDays, formatMinutes, parseIsoDate, todayIso } from '../../core/dates';
import { Priority, RecurrenceInput, RepeatFrequency, Task, TemplateInput, Template, WEEKDAYS, Weekday } from '../../core/models';
import { PlannerStore } from '../../core/planner.store';
import { parseDuration, parseQuickAdd } from '../../core/quick-add';
import { describeRepeat, ordinal, sameRepeat } from '../../core/recurrence';
import { ToastService } from '../../core/toast.service';

export interface TaskEditorData {
  item: Task | Template;
  kind: 'task' | 'template';
}

const ICONS = ['⭐', '🧺', '🏋️', '📚', '🧘', '🍳', '🧹', '💌', '📧', '🛒', '🌱', '🐕', '💻', '🎨', '🎸', '💊'];
const ESTIMATES = [5, 15, 25, 30, 45, 60, 90, 120];

/** A checklist row while editing. `id` is null for rows added in this dialog; `key` tracks rows in the list. */
interface ChecklistRow {
  key: number;
  id: number | null;
  title: string;
  isDone: boolean;
}

/** Edits a task or a template. Closes with a TemplateInput (icon ignored for tasks) or undefined. */
@Component({
  selector: 'app-task-editor',
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="editor glass" (submit)="$event.preventDefault(); save()">
      <h2>{{ data.kind === 'task' ? 'Edit task' : 'Edit template' }}</h2>

      <label class="field">
        <span>Title</span>
        <input
          class="input"
          [value]="title()"
          (input)="title.set(value($event))"
          (blur)="applyShorthand(false)"
          maxlength="300"
          required
          cdkFocusInitial
        />
        <small class="muted">
          Shorthand works here too: <kbd>#tag</kbd> <kbd>~30m</kbd> <kbd>!high</kbd>
          @if (data.kind === 'task') {
            <kbd>&#64;fri</kbd>
          }
        </small>
      </label>

      <label class="field">
        <span>Notes</span>
        <textarea class="input" [value]="notes()" (input)="notes.set(value($event))" maxlength="4000" placeholder="Anything to remember…"></textarea>
      </label>

      <div class="field">
        <span>Checklist <small class="muted hint">· {{ data.kind === 'template' ? 'copied into every new task' : 'break it into small steps' }}</small></span>
        @if (checklist().length) {
          <ul class="checklist" cdkDropList (cdkDropListDropped)="reorder($event)">
            @for (row of checklist(); track row.key; let i = $index) {
              <li cdkDrag cdkDragLockAxis="y" cdkDragPreviewContainer="parent" class="step">
                <span class="grip" cdkDragHandle aria-hidden="true" title="Drag to reorder">⠿</span>
                @if (data.kind === 'task') {
                  <input type="checkbox" [checked]="row.isDone" (change)="patchRow(row.key, { isDone: !row.isDone })" [attr.aria-label]="'Done: ' + row.title" />
                }
                <input
                  class="step-title"
                  [value]="row.title"
                  (input)="patchRow(row.key, { title: value($event) })"
                  maxlength="200"
                  [attr.aria-label]="'Step ' + (i + 1)"
                />
                <button type="button" class="icon-btn small" (click)="removeRow(row.key)" [attr.aria-label]="'Remove step ' + (i + 1)">✕</button>
              </li>
            }
          </ul>
        }
        <input
          class="input new-step"
          placeholder="＋ Add a step and press Enter"
          maxlength="200"
          [value]="newStep()"
          (input)="newStep.set(value($event))"
          (keydown.enter)="$event.preventDefault(); addRow()"
          aria-label="Add a checklist step"
        />
      </div>

      <div class="field">
        <span>Repeat <small class="muted hint">· lands on Today by itself on those days</small></span>
        <div class="options" role="radiogroup" aria-label="Repeat">
          @for (f of frequencies; track f.id) {
            <button type="button" class="opt" role="radio" [class.on]="repeatFreq() === f.id" [attr.aria-checked]="repeatFreq() === f.id" (click)="repeatFreq.set(f.id)">
              {{ f.label }}
            </button>
          }
        </div>
        @if (repeatFreq(); as freq) {
          <div class="repeat-row">
            <label class="every">
              every
              <input
                class="input num"
                type="number"
                min="1"
                max="365"
                [value]="repeatInterval()"
                (input)="setInterval($event)"
                (change)="commitInterval($event)"
                aria-label="Repeat interval"
              />
              {{ unit() }}
            </label>
            @if (freq === 'weekly') {
              <div class="days" role="group" aria-label="Weekdays">
                @for (d of weekdays; track d) {
                  <button type="button" class="day" [class.on]="repeatDays().includes(d)" [attr.aria-pressed]="repeatDays().includes(d)" (click)="toggleDay(d)" [title]="d">
                    {{ d.slice(0, 2) }}
                  </button>
                }
              </div>
            }
            @if (freq === 'monthly') {
              <label class="every">
                on the
                <select class="input num wide" [value]="repeatMonthDay()" (change)="repeatMonthDay.set(+value($event))" aria-label="Day of the month">
                  @for (n of monthDays; track n) {
                    <option [value]="n" [selected]="n === repeatMonthDay()">{{ n === 31 ? 'last day' : ordinal(n) }}</option>
                  }
                </select>
              </label>
            }
          </div>
          <small class="muted summary">🔁 {{ repeatSummary() }}</small>
        }
      </div>

      @if (data.kind === 'template') {
        <div class="field">
          <span>Icon</span>
          <div class="options">
            @for (i of icons; track i) {
              <button type="button" class="opt emoji" [class.on]="icon() === i" (click)="icon.set(i)" [attr.aria-pressed]="icon() === i">{{ i }}</button>
            }
          </div>
        </div>
      }

      @if (data.kind === 'task') {
        <div class="field">
          <span>Due date</span>
          <div class="options">
            <button type="button" class="opt" [class.on]="dueDate() === null" (click)="dueDate.set(null)">None</button>
            @for (q of dueQuick; track q.label) {
              <button type="button" class="opt" [class.on]="dueDate() === q.date" (click)="dueDate.set(q.date)">{{ q.label }}</button>
            }
            <input
              class="input date"
              type="date"
              [value]="dueDate() ?? ''"
              (change)="dueDate.set(value($event) || null)"
              aria-label="Due date"
            />
          </div>
        </div>
      }

      <div class="field">
        <span>Time estimate</span>
        <div class="options">
          <button type="button" class="opt" [class.on]="estimate() === null" (click)="setEstimate(null)">None</button>
          @for (m of estimates; track m) {
            <button type="button" class="opt" [class.on]="estimate() === m" (click)="setEstimate(m)">{{ fmt(m) }}</button>
          }
          <input
            class="input custom-est"
            [class.on]="isCustomEstimate()"
            placeholder="Custom: 40m, 1h20"
            maxlength="12"
            [value]="customEstimate()"
            (input)="customEstimate.set(value($event))"
            (change)="applyCustomEstimate()"
            (keydown.enter)="$event.preventDefault(); applyCustomEstimate()"
            aria-label="Custom time estimate, e.g. 40m or 1h20"
          />
        </div>
      </div>

      <div class="field">
        <span>Priority</span>
        <div class="options">
          @for (p of priorities; track p.id) {
            <button type="button" class="opt" [class.on]="priority() === p.id" (click)="priority.set(p.id)">{{ p.label }}</button>
          }
        </div>
      </div>

      <div class="field">
        <span>Tag</span>
        <div class="options">
          <button type="button" class="opt" [class.on]="tagId() === null" (click)="tagId.set(null)">None</button>
          @for (t of store.tags(); track t.id) {
            <button type="button" class="opt chip-opt" [attr.data-color]="t.color" [class.on]="tagId() === t.id" (click)="tagId.set(t.id)">
              #{{ t.name }}
            </button>
          }
          <input
            class="input new-tag"
            placeholder="+ new tag"
            maxlength="40"
            (keydown.enter)="$event.preventDefault(); addTag($event)"
            (blur)="addTag($event)"
          />
        </div>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="!title().trim()">Save</button>
      </div>
    </form>
  `,
  styles: `
    .editor { width: 520px; max-width: 100%; max-height: calc(100dvh - 48px); overflow: auto; padding: 24px; background: var(--surface-strong); }
    h2 { font-size: 22px; margin-bottom: 16px; }
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
    .field small { font-size: 12px; }
    .field small.hint { font-weight: 500; }
    .field > span { font-size: 13px; font-weight: 700; color: var(--text-muted); }
    .options { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .opt {
      height: 32px; padding: 0 12px; border-radius: var(--radius-pill); border: 1px solid var(--surface-border);
      background: var(--surface); cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-muted);
      transition: transform 0.2s var(--ease-spring), background 0.2s, color 0.2s;
      &:hover { transform: translateY(-1px); }
      &.on { color: #fff; background: var(--accent-grad); border-color: transparent; }
    }
    .emoji { width: 38px; padding: 0; font-size: 18px; }
    .date { width: 150px; height: 32px; border-radius: var(--radius-pill); font-size: 13px; padding: 0 12px; }
    .custom-est {
      width: 150px; height: 32px; border-radius: var(--radius-pill); font-size: 13px; padding: 0 12px;
      &.on { border-color: transparent; box-shadow: 0 0 0 2px var(--accent-2); font-weight: 700; }
    }
    .new-tag { width: 120px; height: 32px; border-radius: var(--radius-pill); font-size: 13px; padding: 0 12px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .step {
      display: flex; align-items: center; gap: 8px; padding: 2px 4px 2px 6px;
      border-radius: var(--radius-sm); background: var(--surface);
      input[type='checkbox'] { width: 16px; height: 16px; margin: 0; accent-color: var(--accent-2); flex: none; }
    }
    .step.cdk-drag-preview { background: var(--surface-strong); box-shadow: var(--shadow-lift); }
    .grip { cursor: grab; color: var(--text-faint); user-select: none; padding: 0 2px; }
    .step-title {
      flex: 1; min-width: 0; height: 32px; border: 0; background: transparent; padding: 0 4px; border-radius: 6px;
      &:focus { outline: none; box-shadow: var(--focus-ring); }
    }
    .icon-btn.small { width: 28px; height: 28px; font-size: 13px; }
    .new-step { height: 38px; font-size: 14px; }
    .repeat-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-top: 4px; }
    .every { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--text-muted); }
    .num { width: 68px; height: 34px; padding: 0 10px; border-radius: var(--radius-sm); font-size: 14px; }
    .num.wide { width: 110px; }
    .days { display: flex; gap: 4px; }
    .day {
      width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--surface-border); background: var(--surface);
      font-size: 12px; font-weight: 700; text-transform: capitalize; color: var(--text-muted); cursor: pointer;
      transition: transform 0.2s var(--ease-spring), background 0.2s, color 0.2s;
      &:hover { transform: translateY(-1px); }
      &.on { color: #fff; background: var(--accent-grad); border-color: transparent; }
    }
    .summary { font-weight: 600; }
  `,
})
export class TaskEditor {
  protected readonly data = inject<TaskEditorData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<TemplateInput>>(DialogRef);
  protected readonly store = inject(PlannerStore);
  private readonly toast = inject(ToastService);

  protected readonly icons = ICONS;
  protected readonly estimates = ESTIMATES;
  protected readonly priorities: { id: Priority; label: string }[] = [
    { id: 'low', label: '▽ Low' },
    { id: 'normal', label: '◇ Normal' },
    { id: 'high', label: '▲ High' },
  ];

  protected readonly title = signal(this.data.item.title);
  protected readonly notes = signal(this.data.item.notes ?? '');
  protected readonly estimate = signal<number | null>(this.data.item.estimateMinutes);
  protected readonly priority = signal<Priority>(this.data.item.priority);
  protected readonly tagId = signal<number | null>(this.data.item.tag?.id ?? null);
  protected readonly icon = signal('icon' in this.data.item ? this.data.item.icon : '⭐');
  protected readonly dueDate = signal<string | null>('dueDate' in this.data.item ? this.data.item.dueDate : null);

  // ---- Repeat ----
  protected readonly frequencies: { id: RepeatFrequency | null; label: string }[] = [
    { id: null, label: 'Never' },
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
  ];
  protected readonly weekdays = WEEKDAYS;
  protected readonly monthDays = Array.from({ length: 31 }, (_, i) => i + 1);
  protected readonly ordinal = ordinal;
  /** The day new rules are based on: the task's planned day, or today. */
  private readonly baseDate = parseIsoDate(('plannedDate' in this.data.item && this.data.item.plannedDate) || todayIso());
  private readonly existingRepeat = this.data.item.repeat;
  protected readonly repeatFreq = signal<RepeatFrequency | null>(this.existingRepeat?.frequency ?? null);
  protected readonly repeatInterval = signal(this.existingRepeat?.interval ?? 1);
  protected readonly repeatDays = signal<Weekday[]>(
    this.existingRepeat?.weekdays.length ? this.existingRepeat.weekdays : [WEEKDAYS[(this.baseDate.getDay() + 6) % 7]],
  );
  protected readonly repeatMonthDay = signal(this.existingRepeat?.monthDay ?? this.baseDate.getDate());
  protected readonly unit = computed(() => {
    const plural = this.repeatInterval() === 1 ? '' : 's';
    return { daily: 'day', weekly: 'week', monthly: 'month' }[this.repeatFreq() ?? 'daily'] + plural;
  });
  protected readonly repeatSummary = computed(() => {
    const r = this.repeatInput();
    return r ? describeRepeat(r) : '';
  });

  private repeatInput(): RecurrenceInput | null {
    const frequency = this.repeatFreq();
    if (!frequency) return null;
    const input: RecurrenceInput = {
      frequency,
      interval: this.repeatInterval(),
      weekdays: frequency === 'weekly' ? this.repeatDays() : [],
      monthDay: frequency === 'monthly' ? this.repeatMonthDay() : null,
    };
    // Keep the original start when the rule didn't change, so "every 2 days" keeps its rhythm.
    input.startDate = sameRepeat(input, this.existingRepeat) ? this.existingRepeat!.startDate : null;
    return input;
  }

  /** While typing: take the number if it's valid, so the summary updates live. */
  protected setInterval(e: Event): void {
    const n = Math.round(Number((e.target as HTMLInputElement).value));
    if (n >= 1 && n <= 365) this.repeatInterval.set(n);
  }

  /** On leaving the field: clamp to 1–365 (empty keeps the last value) and show what will be saved. */
  protected commitInterval(e: Event): void {
    const input = e.target as HTMLInputElement;
    const n = Math.round(Number(input.value));
    if (input.value.trim() && Number.isFinite(n)) this.repeatInterval.set(Math.min(365, Math.max(1, n)));
    input.value = String(this.repeatInterval());
  }

  protected toggleDay(day: Weekday): void {
    const days = this.repeatDays();
    if (days.includes(day)) {
      if (days.length > 1) this.repeatDays.set(days.filter((d) => d !== day)); // keep at least one
    } else {
      this.repeatDays.set([...days, day]);
    }
  }

  private nextKey = 0;
  protected readonly checklist = signal<ChecklistRow[]>(
    'subtasks' in this.data.item
      ? (this.data.item.subtasks ?? []).map((s) => ({ key: this.nextKey++, id: s.id, title: s.title, isDone: s.isDone }))
      : (this.data.item.checklist ?? []).map((title) => ({ key: this.nextKey++, id: null, title, isDone: false })),
  );
  protected readonly newStep = signal('');

  protected readonly dueQuick = (() => {
    const today = todayIso();
    const toMonday = (8 - parseIsoDate(today).getDay()) % 7 || 7;
    return [
      { label: 'Today', date: today },
      { label: 'Tomorrow', date: addDays(today, 1) },
      { label: 'Next week', date: addDays(today, toMonday) },
    ];
  })();

  protected readonly fmt = formatMinutes;

  /** Text in the custom estimate box; prefilled when the estimate isn't one of the presets (e.g. ~40m from quick add). */
  protected readonly customEstimate = signal(
    this.data.item.estimateMinutes !== null && !ESTIMATES.includes(this.data.item.estimateMinutes) ? formatMinutes(this.data.item.estimateMinutes) : '',
  );
  protected readonly isCustomEstimate = computed(() => {
    const e = this.estimate();
    return e !== null && !ESTIMATES.includes(e);
  });

  protected setEstimate(minutes: number | null): void {
    this.estimate.set(minutes);
    this.customEstimate.set('');
  }

  /** Reads the custom box. Empty leaves the estimate alone; invalid input is reported and reset. Returns false if invalid. */
  protected applyCustomEstimate(): boolean {
    const text = this.customEstimate().trim();
    if (!text) return true;
    const minutes = parseDuration(text);
    if (minutes === null) {
      this.toast.error('Use a time like 40m, 1h20 or 1:30 (up to 24h).');
      this.customEstimate.set(this.isCustomEstimate() ? formatMinutes(this.estimate()) : '');
      return false;
    }
    this.estimate.set(minutes);
    // A value that matches a preset just selects that preset.
    this.customEstimate.set(ESTIMATES.includes(minutes) ? '' : formatMinutes(minutes));
    return true;
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected addRow(): void {
    const title = this.newStep().trim();
    if (!title) return;
    if (this.checklist().length >= 50) {
      this.toast.error('A checklist can have at most 50 steps.');
      return;
    }
    this.checklist.update((rows) => [...rows, { key: this.nextKey++, id: null, title, isDone: false }]);
    this.newStep.set('');
  }

  protected patchRow(key: number, patch: Partial<ChecklistRow>): void {
    this.checklist.update((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  protected removeRow(key: number): void {
    this.checklist.update((rows) => rows.filter((r) => r.key !== key));
  }

  protected reorder(event: CdkDragDrop<unknown>): void {
    const rows = [...this.checklist()];
    moveItemInArray(rows, event.previousIndex, event.currentIndex);
    this.checklist.set(rows);
  }

  protected async addTag(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const name = input.value.trim().replace(/^#/, '');
    if (!name) return;
    input.value = '';
    const existing = this.store.tags().find((t) => t.name.toLowerCase() === name.toLowerCase());
    const tag = existing ?? (await this.store.createTag(name));
    if (tag) this.tagId.set(tag.id);
  }

  /** Moves `#tag ~30m !high @fri` tokens out of the title into the matching fields. */
  protected async applyShorthand(report = true): Promise<boolean> {
    const parsed = parseQuickAdd(this.title(), undefined, this.data.kind === 'task');
    if (parsed.errors.length) {
      // Leave the title as typed so it can be fixed. Only Save reports it (blur also fires on Cancel).
      if (report) this.toast.error(parsed.errors[0]);
      return false;
    }
    if (parsed.title === this.title().trim()) return true;
    this.title.set(parsed.title);
    if (parsed.estimateMinutes !== null) {
      this.estimate.set(parsed.estimateMinutes);
      this.customEstimate.set(ESTIMATES.includes(parsed.estimateMinutes) ? '' : formatMinutes(parsed.estimateMinutes));
    }
    if (parsed.priority) this.priority.set(parsed.priority);
    if (parsed.dueDate) this.dueDate.set(parsed.dueDate);
    if (parsed.tagName) {
      const name = parsed.tagName;
      const existing = this.store.tags().find((t) => t.name.toLowerCase() === name.toLowerCase());
      const tag = existing ?? (await this.store.createTag(name));
      if (tag) this.tagId.set(tag.id);
    }
    return true;
  }

  protected async save(): Promise<void> {
    if (!(await this.applyShorthand())) return;
    if (!this.title().trim()) return;
    if (!this.applyCustomEstimate()) return; // a custom time typed without pressing Enter still counts
    this.addRow(); // a step typed but not yet added with Enter still counts
    const rows = this.checklist().filter((r) => r.title.trim());
    this.ref.close({
      title: this.title().trim().slice(0, 200),
      notes: this.notes().trim() || null,
      estimateMinutes: this.estimate(),
      priority: this.priority(),
      tagId: this.tagId(),
      dueDate: this.dueDate(),
      icon: this.icon(),
      repeat: this.repeatInput(),
      ...(this.data.kind === 'task'
        ? { subtasks: rows.map((r) => ({ id: r.id, title: r.title.trim(), isDone: r.isDone })) }
        : { checklist: rows.map((r) => r.title.trim()) }),
    });
  }
}
