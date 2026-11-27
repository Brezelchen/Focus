import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { greeting, relativeDayName } from '../../core/dates';
import { HabitStore } from '../../core/habit.store';
import { addMonths, markMonthReviewDone, monthOf, monthReviewDone } from '../../core/habits';
import { PlannerStore } from '../../core/planner.store';
import { ProgressRing } from '../../shared/progress-ring';
import { Pup } from '../../shared/pup';
import { MonthReview } from '../habits/month-review';
import { HabitPills } from './habit-pills';

/** First open of the day: how yesterday went, and a one-click way to bring unfinished tasks back. */
@Component({
  selector: 'app-morning-ritual',
  imports: [ProgressRing, Pup, HabitPills, MonthReview],
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

        @if (missedHabits().length) {
          <div class="habits">
            <p class="muted small">🌱 Habits {{ habitDayName() }}: tick any you did but didn't log.</p>
            <app-habit-pills [items]="missedHabits()" [date]="habitsYesterday()!.date" [compact]="true" />
          </div>
        }

        @if (morningHabits().length) {
          <div class="habits">
            <p class="muted small">🌅 This morning</p>
            <app-habit-pills [items]="morningHabits()" [date]="store.today()" [compact]="true" />
          </div>
        }

        @if (showMonthReview()) {
          <div class="habits review">
            <app-month-review [month]="thisMonth" (finished)="finishMonthReview()" />
          </div>
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
    .ritual { max-height: calc(100dvh - 32px); overflow: auto; }
    .habits { margin-top: 16px; text-align: left; }
    .habits .small { margin: 0 0 8px; }
    .review { padding-top: 14px; border-top: 1px solid var(--surface-border); }
  `,
})
export class MorningRitual {
  protected readonly store = inject(PlannerStore);
  private readonly ref = inject(DialogRef);

  protected readonly hello = greeting();
  private readonly habits = inject(HabitStore);
  private readonly api = inject(Api);

  protected readonly habitsYesterday = this.habits.yesterday;
  /** Habits due yesterday and not done when the recap opened (ticked ones stay, so they can be unticked). */
  private readonly missedIds = signal<Set<number> | null>(null);
  protected readonly missedHabits = computed(() => {
    const ids = this.missedIds();
    return ids ? (this.habits.yesterday()?.items ?? []).filter((i) => ids.has(i.habit.id)) : [];
  });
  protected readonly habitDayName = computed(() => {
    const d = this.habits.yesterday()?.date;
    return d ? relativeDayName(d, this.store.today()).toLowerCase() : '';
  });
  protected readonly morningHabits = computed(() => {
    const d = this.habits.day();
    return d && d.date === this.store.today() ? d.items.filter((i) => i.habit.timeOfDay === 'morning') : [];
  });

  // ---- Month review: the first recap of a month whose own list is still empty ----
  protected readonly thisMonth = monthOf(this.store.today());
  private readonly monthReviewDue = signal(false);
  protected readonly showMonthReview = computed(() => this.monthReviewDue());

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

  constructor() {
    // Capture which of yesterday's habits were missed once they've loaded.
    effect(() => {
      const y = this.habits.yesterday();
      if (!y || untracked(this.missedIds)) return;
      this.missedIds.set(new Set(y.items.filter((i) => !i.done && !i.skipped).map((i) => i.habit.id)));
    });
    void this.checkMonthReview();
  }

  private async checkMonthReview(): Promise<void> {
    if (monthReviewDone(this.thisMonth)) return;
    try {
      const [now, before] = await Promise.all([
        firstValueFrom(this.api.habits(this.thisMonth)),
        firstValueFrom(this.api.habits(addMonths(this.thisMonth, -1))),
      ]);
      const prev = addMonths(this.thisMonth, -1);
      const ownNow = now.some((h) => h.month === this.thisMonth);
      const ownBefore = before.some((h) => h.month === prev && !h.archivedAt);
      this.monthReviewDue.set(!ownNow && ownBefore);
    } catch {
      /* the review is optional */
    }
  }

  protected finishMonthReview(): void {
    markMonthReviewDone(this.thisMonth);
    this.monthReviewDue.set(false);
    void this.habits.refresh();
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
