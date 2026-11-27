import { Dialog } from '@angular/cdk/dialog';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { parseIsoDate, todayIso } from '../../core/dates';
import { HabitStore } from '../../core/habit.store';
import { INTENTION_EMOJIS, addMonths, fillRatio, markMonthReviewDone, monthLabel, monthName, monthOf, monthReviewDone, progressLabel } from '../../core/habits';
import { Habit, HabitCell, HabitInput, HabitMonth, HabitRow, IsoDate } from '../../core/models';
import { shortRepeat } from '../../core/recurrence';
import { ToastService } from '../../core/toast.service';
import { CheckInData, CheckInDialog, CheckInResult } from './check-in-dialog';
import { DeleteHabitChoice, DeleteHabitDialog } from './delete-habit-dialog';
import { HabitEditor, HabitEditorData } from './habit-editor';
import { HabitHistoryDialog } from './habit-history';
import { MonthReview } from './month-review';



/** Quick starters for an empty habit list. */
const STARTERS: (Partial<HabitInput> & { title: string; icon: string })[] = [
  { title: 'Make bed', icon: '🛏️', timeOfDay: 'morning' },
  { title: 'Daily walk', icon: '🚶' },
  { title: 'Sleep', icon: '😴', target: 8, unit: 'h', timeOfDay: 'evening' },
  { title: 'Water', icon: '💧', target: 8, unit: 'glasses' },
  { title: 'Read', icon: '📖', target: 20, unit: 'pages', timeOfDay: 'evening' },
  { title: 'No doomscrolling', icon: '📵', kind: 'avoid' },
];

/** Habits: the month grid, the base list and the month's own list, and the month review. */
@Component({
  selector: 'app-habits-page',
  imports: [CdkDropList, CdkDrag, CdkDragHandle, CdkMenu, CdkMenuItem, CdkMenuTrigger, MonthReview],
  templateUrl: './habits-page.html',
  styleUrl: './habits-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HabitsPage {
  private readonly api = inject(Api);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly toast = inject(ToastService);
  private readonly habitStore = inject(HabitStore);

  protected readonly today = signal(todayIso());
  protected readonly month = signal(monthOf(todayIso()));
  protected readonly habits = signal<Habit[]>([]);
  protected readonly grid = signal<HabitMonth | null>(null);
  protected readonly prevHasOwn = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showArchived = signal(false);
  protected readonly editingNote = signal(false);
  /** The emoji picked while editing the month's intention. */
  protected readonly noteEmoji = signal<string | null>(null);
  protected readonly intentionEmojis = INTENTION_EMOJIS;
  /** An emoji typed into "other" rather than picked from the row. */
  protected readonly customEmoji = computed(() => {
    const e = this.noteEmoji();
    return !!e && !INTENTION_EMOJIS.includes(e);
  });
  protected readonly reviewDismissed = signal(false);

  protected readonly starters = STARTERS;
  protected readonly shortRepeat = shortRepeat;
  protected readonly progressLabel = progressLabel;

  protected readonly title = computed(() => monthLabel(this.month()));
  protected readonly name = computed(() => monthName(this.month()));
  protected readonly isCurrent = computed(() => this.month() === monthOf(this.today()));
  protected readonly baseHabits = computed(() => this.habits().filter((h) => h.month === null && !h.archivedAt));
  protected readonly monthHabits = computed(() => this.habits().filter((h) => h.month === this.month() && !h.archivedAt));
  protected readonly archived = computed(() => this.habits().filter((h) => !!h.archivedAt && (h.month === null || h.month === this.month())));
  protected readonly hasAny = computed(() => this.habits().length > 0);

  /** Offer the review when a current/future month has no own habits yet but the month before had some. */
  protected readonly showReview = computed(
    () =>
      this.loaded() &&
      !this.reviewDismissed() &&
      this.month() >= monthOf(this.today()) &&
      this.monthHabits().length === 0 &&
      this.prevHasOwn(),
  );

  protected readonly days = computed(() => {
    const g = this.grid();
    const count = g?.rows[0]?.cells.length ?? new Date(+this.month().slice(0, 4), +this.month().slice(5, 7), 0).getDate();
    return Array.from({ length: count }, (_, i) => {
      const date = `${this.month().slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
      const d = parseIsoDate(date);
      return { date, day: i + 1, weekday: 'SMTWTFS'[d.getDay()], weekend: d.getDay() === 0 || d.getDay() === 6 };
    });
  });

  constructor() {
    effect(() => {
      const month = this.month();
      untracked(() => {
        this.reviewDismissed.set(monthReviewDone(month));
        void this.load();
      });
    });

    // Keep today in view in the sideways-scrolling grid: on first layout and whenever its width changes
    // (rotation, window resize). Ticking a day doesn't move it.
    effect((onCleanup) => {
      const el = this.scroller()?.nativeElement;
      if (!el) return;
      let width = -1;
      const observer = new ResizeObserver(() => {
        if (el.clientWidth === width) return;
        width = el.clientWidth;
        this.scrollToToday();
      });
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });
    // Web fonts can change the column widths after the first layout.
    void document.fonts?.ready.then(() => this.scrollToToday());
  }

  // ---- Loading ------------------------------------------------------------------------------

  protected async load(): Promise<void> {
    const month = this.month();
    this.today.set(todayIso());
    try {
      const [habits, grid, prev] = await Promise.all([
        firstValueFrom(this.api.habits(month)),
        firstValueFrom(this.api.habitMonth(month)),
        firstValueFrom(this.api.habits(addMonths(month, -1))),
      ]);
      if (month !== this.month()) return; // the user moved on
      const firstGrid = this.grid()?.month !== grid.month;
      this.habits.set(habits);
      this.grid.set(grid);
      // A newly opened month: once it's rendered, jump to today (or the 1st for other months).
      if (firstGrid) afterNextRender(() => this.scrollToToday(), { injector: this.injector });
      this.prevHasOwn.set(prev.some((h) => h.month === addMonths(month, -1) && !h.archivedAt));
      this.error.set(null);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loaded.set(true);
    }
  }

  /**
   * When the grid scrolls sideways: centres today in the days visible next to the sticky name column.
   * Other months start at the 1st. Does nothing when the whole month fits.
   */
  private scrollToToday(): void {
    const scroller = this.scroller()?.nativeElement;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    const todayCol = scroller.querySelector<HTMLElement>('th.today');
    if (!todayCol) {
      scroller.scrollLeft = 0;
      return;
    }
    const nameWidth = scroller.querySelector<HTMLElement>('th.habit-col')?.offsetWidth ?? 0;
    const box = scroller.getBoundingClientRect();
    const col = todayCol.getBoundingClientRect();
    const visibleCentre = box.left + nameWidth + (scroller.clientWidth - nameWidth) / 2;
    scroller.scrollLeft += col.left + col.width / 2 - visibleCentre; // the browser clamps to the ends
  }

  /** After a change: reload this page and the Today strip. */
  private async changed(): Promise<void> {
    await this.load();
    void this.habitStore.refresh();
  }

  protected shiftMonth(delta: number): void {
    this.month.set(addMonths(this.month(), delta));
  }

  protected thisMonth(): void {
    this.month.set(monthOf(todayIso()));
  }

  // ---- Grid ---------------------------------------------------------------------------------

  protected cellLabel(row: HabitRow, cell: HabitCell): string {
    const date = parseIsoDate(cell.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const state = {
      notDue: 'not scheduled',
      open: 'not done yet',
      partial: 'partly done',
      done: 'done',
      skipped: 'rest day',
      future: 'upcoming',
      missed: row.habit.kind === 'avoid' && row.habit.target !== null ? 'over the limit' : 'missed',
    }[cell.state];
    const progress = row.habit.target !== null && cell.state !== 'notDue' && cell.state !== 'future' ? ` (${progressLabel(row.habit, cell.count)})` : '';
    return `${row.habit.title}, ${date}: ${state}${progress}`;
  }

  protected fill(row: HabitRow, cell: HabitCell): number {
    return cell.state === 'partial' ? fillRatio(row.habit, cell.count) : 0;
  }

  protected canEdit(cell: HabitCell): boolean {
    return cell.state !== 'notDue' && cell.state !== 'future';
  }

  /** Ticks toggle straight away; counts, focus habits and rest days use the small dialog. */
  protected async cellClick(row: HabitRow, cell: HabitCell, detailed = false): Promise<void> {
    if (!this.canEdit(cell)) return;
    const h = row.habit;
    if (!detailed && h.target === null && cell.state !== 'skipped') {
      const count = cell.state === 'done' ? 0 : 1;
      this.patchCell(h.id, cell.date, { state: count ? 'done' : cell.date < this.today() ? 'missed' : 'open', count });
      if (await this.run(this.api.checkIn(h.id, cell.date, count))) void this.changed();
      else void this.load();
      return;
    }
    this.openCheckIn(h, cell);
  }

  private openCheckIn(habit: Habit, cell: HabitCell): void {
    const ref = this.dialog.open<CheckInResult, CheckInData>(CheckInDialog, {
      data: { habit, date: cell.date, count: cell.count, skipped: cell.state === 'skipped' },
      panelClass: 'focus-dialog',
      backdropClass: 'focus-backdrop',
    });
    ref.closed.subscribe(async (r) => {
      if (!r) return;
      if (await this.run(this.api.checkIn(habit.id, cell.date, r.count, r.skipped))) void this.changed();
    });
  }

  private patchCell(habitId: number, date: IsoDate, patch: Partial<HabitCell>): void {
    this.grid.update((g) =>
      g
        ? {
            ...g,
            rows: g.rows.map((r) =>
              r.habit.id === habitId ? { ...r, cells: r.cells.map((c) => (c.date === date ? { ...c, ...patch } : c)) } : r,
            ),
          }
        : g,
    );
  }

  protected openHistory(habit: Habit): void {
    // The route provides ECharts, so the dialog needs this page's injector.
    this.dialog.open(HabitHistoryDialog, { data: habit, injector: this.injector, panelClass: 'focus-dialog', backdropClass: 'focus-backdrop' });
  }

  protected percent(rate: number | null): string {
    return rate === null ? '–' : `${Math.round(rate * 100)}%`;
  }

  // ---- Lists --------------------------------------------------------------------------------

  protected add(list: 'base' | 'month'): void {
    this.openEditor({ habit: null, month: this.month(), list }, (input) => this.api.createHabit(input));
  }

  protected edit(habit: Habit): void {
    this.openEditor({ habit, month: this.month(), list: habit.month ? 'month' : 'base' }, (input) => this.api.updateHabit(habit.id, input));
  }

  private openEditor(data: HabitEditorData, save: (input: HabitInput) => Observable<Habit>): void {
    const ref = this.dialog.open<HabitInput, HabitEditorData>(HabitEditor, { data, panelClass: 'focus-dialog', backdropClass: 'focus-backdrop' });
    ref.closed.subscribe(async (input) => {
      if (!input) return;
      const saved = await this.run(save(input));
      if (saved) {
        if (!data.habit) this.toast.show(`${saved.icon} "${saved.title}" added.`, 'success');
        void this.changed();
      }
    });
  }

  protected async addStarter(s: (typeof STARTERS)[number]): Promise<void> {
    const input: HabitInput = {
      title: s.title,
      icon: s.icon,
      month: null,
      repeat: null,
      target: s.target ?? null,
      unit: s.unit ?? null,
      kind: s.kind ?? 'build',
      timeOfDay: s.timeOfDay ?? 'anytime',
      countsFocusMinutes: false,
    };
    if (await this.run(this.api.createHabit(input))) void this.changed();
  }

  protected async archive(habit: Habit, archived: boolean): Promise<void> {
    if (await this.run(this.api.archiveHabit(habit.id, archived))) {
      this.toast.show(archived ? `"${habit.title}" archived. Its history stays.` : `"${habit.title}" is back.`);
      void this.changed();
    }
  }

  protected remove(habit: Habit): void {
    const ref = this.dialog.open<DeleteHabitChoice, Habit>(DeleteHabitDialog, {
      data: habit,
      panelClass: 'focus-dialog',
      backdropClass: 'focus-backdrop',
    });
    ref.closed.subscribe((choice) => {
      if (choice === 'archive') void this.archive(habit, true);
      if (choice === 'delete') void this.deleteForever(habit);
    });
  }

  private async deleteForever(habit: Habit): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteHabit(habit.id), { defaultValue: undefined });
      this.toast.show(`Deleted "${habit.title}"`);
      void this.changed();
    } catch (err) {
      this.toast.error(errorMessage(err));
    }
  }

  protected async reorder(list: 'base' | 'month', event: CdkDragDrop<Habit[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;
    const items = [...(list === 'base' ? this.baseHabits() : this.monthHabits())];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    const order = new Map(items.map((h, i) => [h.id, i]));
    this.habits.update((all) => all.map((h) => (order.has(h.id) ? { ...h, sortOrder: order.get(h.id)! } : h)).sort(bySort));
    try {
      await firstValueFrom(this.api.reorderHabits(items.map((h) => h.id)), { defaultValue: undefined });
      void this.changed();
    } catch (err) {
      this.toast.error(errorMessage(err));
      void this.load();
    }
  }

  protected meta(h: Habit): string {
    const parts = [shortRepeat(h.repeat)];
    if (h.countsFocusMinutes) parts.push(`🎧 ${h.target} min`);
    else if (h.target !== null) parts.push(h.kind === 'avoid' ? `≤ ${h.target} ${h.unit ?? ''}`.trim() : `${h.target} ${h.unit ?? ''}`.trim());
    if (h.kind === 'avoid') parts.push('✋ avoid');
    if (h.timeOfDay === 'morning') parts.push('🌅');
    if (h.timeOfDay === 'evening') parts.push('🌙');
    return parts.join(' · ');
  }

  // ---- Month intention & review -------------------------------------------------------------

  protected editNote(): void {
    this.noteEmoji.set(this.grid()?.note?.emoji ?? null);
    this.editingNote.set(true);
  }

  protected setCustomEmoji(e: Event): void {
    this.noteEmoji.set((e.target as HTMLInputElement).value.trim() || null);
  }

  protected async saveNote(word: string, emoji: string | null): Promise<void> {
    this.editingNote.set(false);
    const note = await this.run(this.api.saveHabitMonthNote(this.month(), word.trim() || null, emoji), true);
    this.grid.update((g) => (g ? { ...g, note } : g));
    void this.habitStore.refresh();
  }

  protected finishReview(): void {
    markMonthReviewDone(this.month());
    this.reviewDismissed.set(true);
    void this.changed();
  }

  protected inputValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  private async run<T>(request: Observable<T>, allowNull = false): Promise<T | null> {
    try {
      const result = await firstValueFrom(request, { defaultValue: null as T });
      return allowNull ? result : (result ?? (true as T));
    } catch (err) {
      this.toast.error(errorMessage(err));
      return null;
    }
  }
}

function bySort(a: Habit, b: Habit): number {
  return (a.month ?? '').localeCompare(b.month ?? '') || a.sortOrder - b.sortOrder || a.id - b.id;
}
