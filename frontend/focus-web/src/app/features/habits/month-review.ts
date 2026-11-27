import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { INTENTION_EMOJIS, addMonths, monthName } from '../../core/habits';
import { HabitRow, IsoDate } from '../../core/models';
import { ToastService } from '../../core/toast.service';


/**
 * Month review: last month's own habits with how they went, Keep / Drop for each, and an intention for the new
 * month. "Start" copies the kept ones. Emits `finished` when done (or skipped).
 */
@Component({
  selector: 'app-month-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="review">
      <h3>{{ prevName() }} in review → {{ name() }}</h3>

      @if (rows().length) {
        <p class="muted small">How did {{ prevName() }}'s habits go? Keep the ones you want in {{ name() }}.</p>
        <ul class="rows">
          @for (r of rows(); track r.habit.id) {
            <li [class.dropped]="!kept().has(r.habit.id)">
              <span class="ico" aria-hidden="true">{{ r.habit.icon }}</span>
              <span class="title">{{ r.habit.title }}</span>
              <span class="stat">{{ r.rate === null ? '–' : percent(r.rate) + '%' }}</span>
              <span class="stat">🔥 {{ r.bestStreak }}</span>
              <button
                type="button"
                class="toggle"
                [class.on]="kept().has(r.habit.id)"
                [attr.aria-pressed]="kept().has(r.habit.id)"
                [attr.aria-label]="(kept().has(r.habit.id) ? 'Keep ' : 'Drop ') + r.habit.title"
                (click)="toggle(r.habit.id)"
              >{{ kept().has(r.habit.id) ? 'Keep' : 'Drop' }}</button>
            </li>
          }
        </ul>
      }

      <div class="intention">
        <span class="label">{{ name() }}'s intention <small class="muted">(optional)</small></span>
        <div class="row">
          @for (e of emojis; track e) {
            <button type="button" class="emoji" [class.on]="emoji() === e" (click)="emoji.set(emoji() === e ? null : e)" [attr.aria-pressed]="emoji() === e">{{ e }}</button>
          }
        </div>
        <input class="input" maxlength="40" [value]="word()" (input)="word.set(value($event))" placeholder="One word, e.g. Calm, Strong, Curious" aria-label="Intention" />
      </div>

      <div class="actions">
        <button type="button" class="btn btn-ghost" (click)="finished.emit()">Not now</button>
        <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="start()">
          Start {{ name() }}{{ kept().size ? ' with ' + kept().size + (kept().size === 1 ? ' habit' : ' habits') : '' }} ✨
        </button>
      </div>
    </div>
  `,
  styles: `
    .review { text-align: left; }
    h3 { font-size: 17px; margin: 0 0 6px; }
    .small { font-size: 14px; margin: 0 0 8px; }
    .rows { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    li {
      display: grid; grid-template-columns: auto 1fr auto auto auto; align-items: center; gap: 10px;
      padding: 6px 6px 6px 12px; border-radius: var(--radius); background: var(--surface); font-weight: 600;
      transition: opacity 0.2s;
    }
    li.dropped { opacity: 0.5; }
    li.dropped .title { text-decoration: line-through; }
    .title { min-width: 0; overflow-wrap: anywhere; }
    .stat { font-size: 13px; color: var(--text-muted); }
    .toggle {
      height: 30px; min-width: 64px; padding: 0 12px; border-radius: var(--radius-pill); border: 1px solid var(--surface-border);
      background: var(--surface); font-weight: 700; font-size: 13px; color: var(--text-muted); cursor: pointer;
      &.on { color: #fff; background: var(--accent-grad); border-color: transparent; }
    }
    .intention { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .label { font-size: 13px; font-weight: 700; color: var(--text-muted); }
    .row { display: flex; flex-wrap: wrap; gap: 4px; }
    .emoji {
      width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--surface-border); background: var(--surface);
      font-size: 18px; cursor: pointer; transition: transform 0.2s var(--ease-spring);
      &:hover { transform: translateY(-1px); }
      &.on { background: var(--accent-grad); border-color: transparent; }
    }
    .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    @media (max-width: 480px) {
      li { grid-template-columns: auto 1fr auto; }
      li .stat:first-of-type { display: none; }
    }
  `,
})
export class MonthReview {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);

  /** The new month (1st). */
  readonly month = input.required<IsoDate>();
  readonly finished = output<void>();

  protected readonly emojis = INTENTION_EMOJIS;
  protected readonly prev = computed(() => addMonths(this.month(), -1));
  protected readonly name = computed(() => monthName(this.month()));
  protected readonly prevName = computed(() => monthName(this.prev()));

  protected readonly rows = signal<HabitRow[]>([]);
  protected readonly kept = signal(new Set<number>());
  protected readonly word = signal('');
  protected readonly emoji = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const prev = this.prev();
      untracked(() => void this.load(prev));
    });
  }

  private async load(prev: IsoDate): Promise<void> {
    try {
      const grid = await firstValueFrom(this.api.habitMonth(prev));
      const own = grid.rows.filter((r) => r.habit.month === prev && r.habit.archivedAt === null);
      this.rows.set(own);
      // Keep what went at least half well by default.
      this.kept.set(new Set(own.filter((r) => (r.rate ?? 0) >= 0.5).map((r) => r.habit.id)));
    } catch {
      this.rows.set([]);
    }
  }

  protected toggle(id: number): void {
    this.kept.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected async start(): Promise<void> {
    this.busy.set(true);
    try {
      if (this.kept().size) await firstValueFrom(this.api.copyHabitMonth(this.prev(), this.month(), [...this.kept()]));
      const word = this.word().trim();
      if (word || this.emoji()) await firstValueFrom(this.api.saveHabitMonthNote(this.month(), word || null, this.emoji()));
      this.toast.show(`${this.emoji() ?? '🌱'} ${this.name()} is set up${word ? `: ${word}` : ''}.`, 'success');
      this.finished.emit();
    } catch (err) {
      this.toast.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected percent(r: number): number {
    return Math.round(r * 100);
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
