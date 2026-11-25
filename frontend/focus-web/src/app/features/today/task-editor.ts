import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { addDays, formatMinutes, parseIsoDate, todayIso } from '../../core/dates';
import { Priority, Task, TemplateInput, Template } from '../../core/models';
import { PlannerStore } from '../../core/planner.store';
import { parseQuickAdd } from '../../core/quick-add';
import { ToastService } from '../../core/toast.service';

export interface TaskEditorData {
  item: Task | Template;
  kind: 'task' | 'template';
}

const ICONS = ['⭐', '🧺', '🏋️', '📚', '🧘', '🍳', '🧹', '💌', '📧', '🛒', '🌱', '🐕', '💻', '🎨', '🎸', '💊'];
const ESTIMATES = [5, 15, 25, 30, 45, 60, 90, 120];

/** Edits a task or a template. Closes with a TemplateInput (icon ignored for tasks) or undefined. */
@Component({
  selector: 'app-task-editor',
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
          <button type="button" class="opt" [class.on]="estimate() === null" (click)="estimate.set(null)">None</button>
          @for (m of estimates; track m) {
            <button type="button" class="opt" [class.on]="estimate() === m" (click)="estimate.set(m)">{{ fmt(m) }}</button>
          }
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
    .new-tag { width: 120px; height: 32px; border-radius: var(--radius-pill); font-size: 13px; padding: 0 12px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
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

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
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
    if (parsed.estimateMinutes !== null) this.estimate.set(parsed.estimateMinutes);
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
    this.ref.close({
      title: this.title().trim().slice(0, 200),
      notes: this.notes().trim() || null,
      estimateMinutes: this.estimate(),
      priority: this.priority(),
      tagId: this.tagId(),
      dueDate: this.dueDate(),
      icon: this.icon(),
    });
  }
}
