import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DueState, dayDiff, dueLabel, formatMinutes, todayIso } from '../core/dates';
import { Task } from '../core/models';

export type TaskAction = 'edit' | 'delete' | 'template' | 'focus' | 'toToday' | 'toBacklog' | 'reopen';

/** A single todo row: checkbox, title, metadata chips and an actions menu. */
@Component({
  selector: 'app-task-card',
  imports: [CdkMenuTrigger, CdkMenu, CdkMenuItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.done]': 'task().status === "done"',
    '[class.compact]': 'compact()',
    '[attr.data-priority]': 'task().priority',
  },
  template: `
    <button
      class="check"
      type="button"
      [disabled]="readonly()"
      [attr.aria-pressed]="isDone()"
      [attr.aria-label]="(isDone() ? 'Mark not done: ' : 'Mark done: ') + task().title"
      (click)="toggle.emit({ x: $event.clientX, y: $event.clientY })"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9" /></svg>
    </button>

    <div class="body" (dblclick)="!readonly() && action.emit('edit')">
      <span class="title">{{ task().title }}</span>
      <span class="meta">
        @if (due(); as d) {
          <span class="chip due" [attr.data-color]="dueColor[d.state]" [attr.data-state]="d.state" [title]="'Due ' + task().dueDate">
            {{ d.state === 'overdue' ? '⚠' : '📅' }} {{ d.text }}
          </span>
        }
        @if (task().priority === 'high') {
          <span class="chip" data-color="coral" title="High priority">▲ high</span>
        }
        @if (task().tag; as tag) {
          <span class="chip" [attr.data-color]="tag.color">#{{ tag.name }}</span>
        }
        @if (task().estimateMinutes) {
          <span class="chip" data-color="sky">⏱ {{ estimate() }}</span>
        }
        @if (task().templateId) {
          <span class="chip" data-color="honey" title="Created from a template">⭐</span>
        }
        @if (task().postponedCount >= 2 && !isDone()) {
          <span class="chip" data-color="rose" [title]="'Left unfinished ' + task().postponedCount + ' times'">
            ↻ {{ task().postponedCount }}×
          </span>
        }
        @if (staleDays() >= 30) {
          <span class="chip" data-color="lavender" title="Still want this?">🕸 {{ staleDays() }}d</span>
        }
      </span>
    </div>

    @if (!readonly()) {
      <button class="icon-btn more" type="button" [cdkMenuTriggerFor]="menu" [attr.aria-label]="'Actions for ' + task().title">⋯</button>
    }

    <ng-template #menu>
      <div class="menu glass" cdkMenu>
        @if (isDone()) {
          <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('reopen')">↩️ Mark as not done</button>
        } @else {
          <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('edit')">✏️ Edit</button>
          @if (location() !== 'focus') {
            <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('focus')">🎧 Add to focus</button>
          }
          @if (location() === 'backlog') {
            <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('toToday')">☀️ Move to day</button>
          } @else {
            <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('toBacklog')">📥 Back to backlog</button>
          }
        }
        @if (!task().templateId) {
          <button cdkMenuItem (cdkMenuItemTriggered)="action.emit('template')">⭐ Save as template</button>
        }
        <button cdkMenuItem class="danger" (cdkMenuItemTriggered)="action.emit('delete')">🗑️ Delete</button>
      </div>
    </ng-template>
  `,
  styleUrl: './task-card.scss',
})
export class TaskCard {
  readonly task = input.required<Task>();
  readonly location = input<'day' | 'backlog' | 'focus'>('day');
  readonly readonly = input(false);
  readonly compact = input(false);

  readonly toggle = output<{ x: number; y: number }>();
  readonly action = output<TaskAction>();

  protected readonly isDone = computed(() => this.task().status === 'done');
  protected readonly estimate = computed(() => formatMinutes(this.task().estimateMinutes));
  /** Hidden once the task is done: the deadline no longer matters. */
  protected readonly due = computed(() => {
    const t = this.task();
    return t.dueDate && t.status === 'open' ? dueLabel(t.dueDate) : null;
  });
  protected readonly dueColor: Record<DueState, string> = { overdue: 'coral', today: 'honey', soon: 'sky', later: 'lavender' };
  protected readonly staleDays = computed(() =>
    this.location() === 'backlog' ? dayDiff(todayIso(), this.task().createdAt.slice(0, 10)) : 0,
  );
}
