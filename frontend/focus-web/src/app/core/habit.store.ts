import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { Api, errorMessage } from './api';
import { CelebrateService } from './celebrate.service';
import { addDays } from './dates';
import { meets, nextCount } from './habits';
import { HabitDay, HabitDayItem, IsoDate } from './models';
import { PlannerStore } from './planner.store';
import { ToastService } from './toast.service';

/**
 * Habit check-ins for the day open on Today (follows the planner's selected date) and for yesterday
 * (for the morning recap). Changes are applied locally first, then saved.
 */
@Injectable({ providedIn: 'root' })
export class HabitStore {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly celebrate = inject(CelebrateService);
  private readonly planner = inject(PlannerStore);

  /** Habits scheduled on the planner's selected date. */
  readonly day = signal<HabitDay | null>(null);
  /** Habits scheduled yesterday. */
  readonly yesterday = signal<HabitDay | null>(null);
  /** Whether any (non-archived) habit exists; null until known. */
  readonly hasAny = signal<boolean | null>(null);
  /** Goes up each time every habit of a day gets done (the pup gets a treat). */
  readonly treats = signal(0);

  private dayRequest = 0;

  constructor() {
    // Once the planner has loaded (i.e. someone is signed in), follow its selected day and "today".
    effect(() => {
      const date = this.planner.selectedDate();
      if (!this.planner.loaded()) return;
      untracked(() => void this.loadDay(date).catch(() => undefined));
    });
    effect(() => {
      const today = this.planner.today();
      if (!this.planner.loaded()) return;
      untracked(() => {
        void this.loadYesterday(today).catch(() => undefined);
        void this.loadHasAny().catch(() => undefined);
      });
    });
  }

  /** Re-reads everything (after editing habits on the Habits page, for example). */
  async refresh(): Promise<void> {
    await Promise.all([this.loadDay(this.planner.selectedDate()), this.loadYesterday(this.planner.today()), this.loadHasAny()]).catch(
      () => undefined,
    );
  }

  async loadDay(date: IsoDate): Promise<void> {
    const request = ++this.dayRequest;
    const day = await firstValueFrom(this.api.habitDay(date));
    if (request === this.dayRequest) this.day.set(day);
  }

  async loadYesterday(today: IsoDate): Promise<void> {
    this.yesterday.set(await firstValueFrom(this.api.habitDay(addDays(today, -1))));
  }

  private async loadHasAny(): Promise<void> {
    const habits = await firstValueFrom(this.api.habits(this.planner.today()));
    this.hasAny.set(habits.some((h) => h.archivedAt === null));
  }

  /** Tap on a habit: ticks toggle, counted habits go up by one. */
  tap(item: HabitDayItem, date: IsoDate, origin?: { x: number; y: number }): Promise<void> {
    return this.setCount(item, date, nextCount(item), false, origin);
  }

  /** Marks a day as a rest day (or undoes that). Rest days don't break streaks. */
  toggleSkip(item: HabitDayItem, date: IsoDate): Promise<void> {
    return this.setCount(item, date, 0, !item.skipped);
  }

  async setCount(item: HabitDayItem, date: IsoDate, count: number, skipped = false, origin?: { x: number; y: number }): Promise<void> {
    const before = this.find(date);
    const allDoneBefore = !!before && before.due > 0 && before.done === before.due;
    const optimistic: HabitDayItem = { ...item, count: skipped ? 0 : count, skipped, done: !skipped && meets(item.habit, count) };
    this.replace(date, optimistic);
    if (optimistic.done && !item.done) this.celebrate.taskDone(origin);

    const saved = await this.run(this.api.checkIn(item.habit.id, date, skipped ? 0 : count, skipped));
    if (!saved) {
      this.replace(date, item);
      return;
    }
    this.replace(date, saved);

    const after = this.find(date);
    if (saved.done && !item.done && item.missedYesterday) {
      this.toast.show(`🌱 Back on track with "${item.habit.title}". Never miss twice!`, 'success');
    }
    if (after && after.due > 0 && after.done === after.due && !allDoneBefore) {
      this.treats.update((n) => n + 1);
      if (date === this.planner.today()) {
        setTimeout(() => this.celebrate.big(), 300);
        this.toast.show('Every habit for today is done. 🦴 Treat time!', 'success');
      }
    }
  }

  /** The loaded day for a date (the selected day or yesterday). */
  private find(date: IsoDate): HabitDay | null {
    if (this.day()?.date === date) return this.day();
    if (this.yesterday()?.date === date) return this.yesterday();
    return null;
  }

  private replace(date: IsoDate, item: HabitDayItem): void {
    const patch = (d: HabitDay | null): HabitDay | null => {
      if (!d || d.date !== date) return d;
      const items = d.items.map((i) => (i.habit.id === item.habit.id ? item : i));
      return { ...d, items, due: items.filter((i) => !i.skipped).length, done: items.filter((i) => i.done).length };
    };
    this.day.update(patch);
    this.yesterday.update(patch);
  }

  private async run<T>(request: Observable<T>): Promise<T | null> {
    try {
      return await firstValueFrom(request, { defaultValue: null as T });
    } catch (err) {
      this.toast.error(errorMessage(err));
      return null;
    }
  }
}
