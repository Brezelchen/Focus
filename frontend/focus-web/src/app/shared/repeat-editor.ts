import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { parseIsoDate, todayIso } from '../core/dates';
import { IsoDate, Recurrence, RecurrenceInput, RepeatFrequency, WEEKDAYS, Weekday } from '../core/models';
import { describeRepeat, ordinal, sameRepeat } from '../core/recurrence';

/**
 * Picks a repeat rule (daily / weekly on chosen days / monthly on a day, every N). Used by the task, template
 * and habit editors. Read the result with {@link value}.
 */
@Component({
  selector: 'app-repeat-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="options" role="radiogroup" [attr.aria-label]="label()">
      @for (f of frequencies(); track f.id) {
        <button type="button" class="opt" role="radio" [class.on]="freq() === f.id" [attr.aria-checked]="freq() === f.id" (click)="freq.set(f.id)">
          {{ f.label }}
        </button>
      }
    </div>
    @if (freq(); as f) {
      <div class="repeat-row">
        <label class="every">
          every
          <input
            class="input num"
            type="number"
            min="1"
            max="365"
            [value]="interval()"
            (input)="setInterval($event)"
            (change)="commitInterval($event)"
            aria-label="Repeat interval"
          />
          {{ unit() }}
        </label>
        @if (f === 'weekly') {
          <div class="days" role="group" aria-label="Weekdays">
            @for (d of weekdays; track d) {
              <button type="button" class="day" [class.on]="days().includes(d)" [attr.aria-pressed]="days().includes(d)" (click)="toggleDay(d)" [title]="d">
                {{ d.slice(0, 2) }}
              </button>
            }
          </div>
        }
        @if (f === 'monthly') {
          <label class="every">
            on the
            <select class="input num wide" [value]="monthDay()" (change)="monthDay.set(+selectValue($event))" aria-label="Day of the month">
              @for (n of monthDays; track n) {
                <option [value]="n" [selected]="n === monthDay()">{{ n === 31 ? 'last day' : ordinal(n) }}</option>
              }
            </select>
          </label>
        }
      </div>
      <small class="muted summary">🔁 {{ summary() }}</small>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 6px; }
    .options { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .opt {
      height: 32px; padding: 0 12px; border-radius: var(--radius-pill); border: 1px solid var(--surface-border);
      background: var(--surface); cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-muted);
      transition: transform 0.2s var(--ease-spring), background 0.2s, color 0.2s;
      &:hover { transform: translateY(-1px); }
      &.on { color: #fff; background: var(--accent-grad); border-color: transparent; }
    }
    @media (max-width: 560px) { .opt { height: 36px; } }
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
    .summary { font-size: 12px; font-weight: 600; }
  `,
})
export class RepeatEditor {
  /** The rule being edited (null = doesn't repeat yet). */
  readonly existing = input<Recurrence | null>(null);
  /** The day new rules are based on (default weekday / day of the month). */
  readonly baseDate = input<IsoDate>(todayIso());
  /** Offer "Never" (tasks, templates) or not (habits always repeat). */
  readonly allowNever = input(true);
  readonly label = input('Repeat');

  protected readonly weekdays = WEEKDAYS;
  protected readonly monthDays = Array.from({ length: 31 }, (_, i) => i + 1);
  protected readonly ordinal = ordinal;

  protected readonly frequencies = computed(() => {
    const all: { id: RepeatFrequency | null; label: string }[] = [
      { id: null, label: 'Never' },
      { id: 'daily', label: 'Daily' },
      { id: 'weekly', label: 'Weekly' },
      { id: 'monthly', label: 'Monthly' },
    ];
    return this.allowNever() ? all : all.slice(1);
  });

  private readonly base = computed(() => parseIsoDate(this.baseDate()));
  protected readonly freq = linkedSignal<RepeatFrequency | null>(() => this.existing()?.frequency ?? (this.allowNever() ? null : 'daily'));
  protected readonly interval = linkedSignal(() => this.existing()?.interval ?? 1);
  protected readonly days = linkedSignal<Weekday[]>(() => {
    const e = this.existing();
    return e?.weekdays.length ? e.weekdays : [WEEKDAYS[(this.base().getDay() + 6) % 7]];
  });
  protected readonly monthDay = linkedSignal(() => this.existing()?.monthDay ?? this.base().getDate());

  protected readonly unit = computed(() => {
    const plural = this.interval() === 1 ? '' : 's';
    return { daily: 'day', weekly: 'week', monthly: 'month' }[this.freq() ?? 'daily'] + plural;
  });

  protected readonly summary = computed(() => {
    const r = this.value();
    return r ? describeRepeat(r) : '';
  });

  /** The rule as it will be saved, or null for "Never". Keeps the original start when the rule didn't change. */
  readonly value = computed<RecurrenceInput | null>(() => {
    const frequency = this.freq();
    if (!frequency) return null;
    const input: RecurrenceInput = {
      frequency,
      interval: this.interval(),
      weekdays: frequency === 'weekly' ? this.days() : [],
      monthDay: frequency === 'monthly' ? this.monthDay() : null,
    };
    const existing = this.existing();
    // Keeping the start means "every 2 days" keeps its rhythm.
    input.startDate = existing && sameRepeat(input, existing) ? existing.startDate : null;
    return input;
  });

  /** While typing: take the number if it's valid, so the summary updates live. */
  protected setInterval(e: Event): void {
    const n = Math.round(Number((e.target as HTMLInputElement).value));
    if (n >= 1 && n <= 365) this.interval.set(n);
  }

  /** On leaving the field: clamp to 1–365 (empty keeps the last value) and show what will be saved. */
  protected commitInterval(e: Event): void {
    const input = e.target as HTMLInputElement;
    const n = Math.round(Number(input.value));
    if (input.value.trim() && Number.isFinite(n)) this.interval.set(Math.min(365, Math.max(1, n)));
    input.value = String(this.interval());
  }

  protected toggleDay(day: Weekday): void {
    const days = this.days();
    if (days.includes(day)) {
      if (days.length > 1) this.days.set(days.filter((d) => d !== day)); // keep at least one
    } else {
      this.days.set([...days, day]);
    }
  }

  protected selectValue(e: Event): string {
    return (e.target as HTMLSelectElement).value;
  }
}
