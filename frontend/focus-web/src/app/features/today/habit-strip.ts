import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HabitStore } from '../../core/habit.store';
import { orderForNow } from '../../core/habits';
import { PlannerStore } from '../../core/planner.store';
import { HabitPills } from './habit-pills';

/**
 * Today's habits as a quiet row of pills above the day's tasks (the tasks stay the main thing).
 * Once every habit is done it folds into a single "all done" line. Follows the day open on Today.
 */
@Component({
  selector: 'app-habit-strip',
  imports: [HabitPills, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (day(); as d) {
      @if (d.items.length) {
        <section class="strip" aria-label="Habits">
          <a class="label" routerLink="/habits" [title]="title()" [attr.aria-label]="d.done + ' of ' + d.due + ' habits done. Open habits'">
            <span aria-hidden="true">{{ d.monthNote?.emoji || '🌱' }}</span>
            <span class="count">{{ d.done }}/{{ d.due }}</span>
          </a>
          @if (allDone() && !expanded()) {
            <button type="button" class="all-done" (click)="expanded.set(true)" title="Show habits">
              all done ✓
            </button>
          } @else {
            <app-habit-pills class="pills" [items]="ordered()" [date]="d.date" [readonly]="planner.isFuture()" [subtle]="true" />
          }
        </section>
      } @else if (store.hasAny() === false && planner.isToday()) {
        <a class="hint" routerLink="/habits">🌱 Track habits here →</a>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .strip { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; padding: 0 2px; min-width: 0; }
    .pills { flex: 1; min-width: 0; }
    .label {
      flex: none; display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 8px; border-radius: 8px;
      font-size: 12px; font-weight: 700; color: var(--text-faint); text-decoration: none;
      &:hover { color: var(--text-muted); background: var(--surface-hover); }
    }
    .count { font-variant-numeric: tabular-nums; }
    .all-done {
      border: 0; background: none; padding: 0 4px; height: 30px; font: inherit; font-size: 12px; font-weight: 600;
      color: var(--text-faint); cursor: pointer;
      &:hover { color: var(--text-muted); }
    }
    .hint {
      display: inline-block; margin: 0 0 12px 2px; font-size: 12px; font-weight: 600; color: var(--text-faint); text-decoration: none;
      &:hover { color: var(--text-muted); }
    }
  `,
})
export class HabitStrip {
  protected readonly store = inject(HabitStore);
  protected readonly planner = inject(PlannerStore);

  /** Only show data for the day that's actually open (avoids a flash of the previous day). */
  protected readonly day = computed(() => {
    const d = this.store.day();
    return d && d.date === this.planner.selectedDate() ? d : null;
  });

  protected readonly allDone = computed(() => {
    const d = this.day();
    return !!d && d.due > 0 && d.done === d.due;
  });

  /** Unfolds an all-done strip; folds again when another day is opened. */
  protected readonly expanded = linkedSignal({ source: () => this.day()?.date, computation: () => false });

  protected readonly title = computed(() => {
    const n = this.day()?.monthNote;
    return n?.word ? `Habits · ${n.emoji ?? ''} ${n.word}`.trim() : 'Habits';
  });

  /** On today: the current part of the day first (morning habits in the morning, evening ones at night). */
  protected readonly ordered = computed(() => {
    const d = this.day();
    if (!d) return [];
    return this.planner.isToday() ? orderForNow(d.items, new Date().getHours()) : d.items;
  });
}
