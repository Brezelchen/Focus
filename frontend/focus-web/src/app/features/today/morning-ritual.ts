import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { greeting, relativeDayName } from '../../core/dates';
import { PlannerStore } from '../../core/planner.store';
import { ProgressRing } from '../../shared/progress-ring';
import { Pup } from '../../shared/pup';

/** First open of the day: how yesterday went, and a one-click way to bring unfinished tasks back. */
@Component({
  selector: 'app-morning-ritual',
  imports: [ProgressRing, Pup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.ritual(); as r) {
      <div class="ritual glass">
        <app-pup [mood]="mood()" [size]="110" />
        <h2>{{ hello }} ☕</h2>

        @if (r.previousDay; as prev) {
          <div class="recap">
            <app-progress-ring [value]="prev.planned ? prev.done / prev.planned : 0" [size]="86" label="Previous day progress">
              <strong>{{ prev.done }}/{{ prev.planned }}</strong>
            </app-progress-ring>
            <p>
              {{ dayName() }} you finished <strong>{{ prev.done }}</strong> of <strong>{{ prev.planned }}</strong> planned
              {{ prev.planned === 1 ? 'task' : 'tasks' }}. {{ cheer() }}
            </p>
          </div>
        }

        @if (r.returnedTasks.length) {
          <p class="muted small">
            {{ r.returnedTasks.length === 1 ? 'This unfinished task went' : 'These unfinished tasks went' }} back to your backlog.
            Want to bring any of them into today?
            @if (r.previousDayTaskIds.length) {
              Or did you finish one {{ onDay() }} and forget to tick it off?
            }
          </p>
          <ul class="returned">
            @for (t of r.returnedTasks; track t.id) {
              <li>
                <span class="title" [class.done]="markedDone().has(t.id)">{{ t.title }}</span>
                @if (markedDone().has(t.id)) {
                  <span class="chip" data-color="mint">✓ done {{ onDay() }}</span>
                } @else if (broughtBack().has(t.id)) {
                  <span class="chip" data-color="mint">✓ on today</span>
                } @else {
                  <span class="row-actions">
                    @if (r.previousDayTaskIds.includes(t.id)) {
                      <button
                        class="btn btn-ghost small-btn"
                        type="button"
                        [disabled]="busy().has(t.id)"
                        [attr.aria-label]="'Mark ' + t.title + ' as done ' + onDay()"
                        (click)="markDone(t.id)"
                      >✓ Done</button>
                    }
                    <button class="btn btn-ghost small-btn" type="button" [disabled]="busy().has(t.id)" (click)="bringBack(t.id)">☀️ Today</button>
                  </span>
                }
              </li>
            }
          </ul>
        }

        <div class="actions">
          @if (r.returnedTasks.length > 1 && pending().length) {
            <button class="btn btn-ghost" type="button" (click)="bringAllBack()">Bring all back</button>
          }
          <button class="btn btn-primary" type="button" (click)="close()">Start my day ✨</button>
        </div>
      </div>
    }
  `,
  styles: `
    .ritual { width: 480px; max-width: 100%; padding: 28px; text-align: center; background: var(--surface-strong); }
    h2 { font-size: 26px; margin: 8px 0 16px; }
    .recap { display: flex; align-items: center; gap: 16px; text-align: left; margin-bottom: 16px; }
    .recap p { margin: 0; }
    .small { font-size: 14px; text-align: left; }
    .returned { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow: auto; }
    .returned li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 6px 6px 14px; border-radius: var(--radius); background: var(--surface); text-align: left; font-weight: 600; }
    .returned .title { min-width: 0; overflow-wrap: anywhere; }
    .returned .title.done { text-decoration: line-through; opacity: 0.6; }
    .row-actions { display: flex; flex-shrink: 0; gap: 4px; }
    .small-btn { height: 32px; padding: 0 12px; font-size: 13px; }
    .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
  `,
})
export class MorningRitual {
  protected readonly store = inject(PlannerStore);
  private readonly ref = inject(DialogRef);

  protected readonly hello = greeting();
  protected readonly broughtBack = signal(new Set<number>());
  /** Returned tasks the user marked as done on the previous day after all. */
  protected readonly markedDone = signal(new Set<number>());
  protected readonly busy = signal(new Set<number>());

  /** Returned tasks not yet brought back or marked done. */
  protected readonly pending = computed(() =>
    (this.store.ritual()?.returnedTasks ?? []).filter((t) => !this.broughtBack().has(t.id) && !this.markedDone().has(t.id)),
  );
  /** "yesterday" or "on Monday", for sentences about the previous day. */
  protected readonly onDay = computed(() => {
    const name = this.dayName();
    return name === 'Yesterday' ? 'yesterday' : `on ${name}`;
  });

  protected readonly rate = computed(() => {
    const prev = this.store.ritual()?.previousDay;
    return prev?.planned ? prev.done / prev.planned : 0;
  });
  protected readonly mood = computed(() => (this.rate() >= 1 ? 'party' : this.rate() >= 0.5 ? 'happy' : 'idle'));
  protected readonly dayName = computed(() => {
    const prev = this.store.ritual()?.previousDay;
    return prev ? relativeDayName(prev.date, this.store.today()) : '';
  });
  protected readonly cheer = computed(() => {
    const r = this.rate();
    if (r >= 1) return 'A perfect day! 🎉';
    if (r >= 0.8) return 'Great job! 🌟';
    if (r >= 0.5) return 'Solid progress. 💪';
    return 'Every day is a fresh start. 🌱';
  });

  protected async bringBack(taskId: number): Promise<void> {
    const task = this.store.backlog().find((t) => t.id === taskId);
    if (!task) return;
    this.broughtBack.update((s) => new Set(s).add(taskId));
    if (!this.store.isToday()) await this.store.selectDate(this.store.today());
    await this.store.move(task, 'day', this.store.openTasks().length);
  }

  protected async markDone(taskId: number): Promise<void> {
    const task = this.store.ritual()?.returnedTasks.find((t) => t.id === taskId);
    if (!task || this.busy().has(taskId)) return;
    this.busy.update((s) => new Set(s).add(taskId));
    try {
      if (await this.store.completeOnPreviousDay(task)) this.markedDone.update((s) => new Set(s).add(taskId));
    } finally {
      this.busy.update((s) => {
        const next = new Set(s);
        next.delete(taskId);
        return next;
      });
    }
  }

  protected async bringAllBack(): Promise<void> {
    for (const t of this.pending()) await this.bringBack(t.id);
  }

  protected close(): void {
    this.store.dismissRitual();
    this.ref.close();
  }
}
