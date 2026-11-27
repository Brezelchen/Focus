import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { HabitStore } from '../../core/habit.store';
import { MOODS, Mood, moodEmoji } from '../../core/models';
import { PlannerStore } from '../../core/planner.store';
import { HabitPills } from './habit-pills';

/** From this hour on, Today shows the reflection prompt open instead of as a small button. */
const EVENING_HOUR = 17;

/**
 * End-of-day reflection for the selected day (today or a past day): a mood and one line of text.
 * Saved reflections show up in the stats calendar.
 */
@Component({
  selector: 'app-day-reflection',
  imports: [HabitPills],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (editing()) {
      <form class="card glass" (submit)="$event.preventDefault(); save()" animate.enter="enter-fade-up">
        <h3>🌙 {{ store.isToday() ? 'How did today go?' : 'How was this day?' }}</h3>
        @if (eveningHabits().length) {
          <div class="evening">
            <span class="muted label">Evening habits</span>
            <app-habit-pills [items]="eveningHabits()" [date]="store.selectedDate()" [compact]="true" />
          </div>
        }
        <div class="moods" role="radiogroup" aria-label="Mood">
          @for (m of moods; track m.id) {
            <button
              type="button"
              class="mood"
              role="radio"
              [class.on]="mood() === m.id"
              [attr.aria-checked]="mood() === m.id"
              [title]="m.label"
              [attr.aria-label]="m.label"
              (click)="mood.set(mood() === m.id ? null : m.id)"
            >
              {{ m.emoji }}
            </button>
          }
        </div>
        <div class="row">
          <input
            #text
            class="input"
            [value]="reflection()"
            (input)="reflection.set(value($event))"
            [attr.maxlength]="500"
            placeholder="One line about your day… what went well, what to try tomorrow"
            aria-label="Reflection"
          />
          <button class="btn btn-primary" type="submit" [disabled]="saving() || (!mood() && !reflection().trim() && !note())">
            Save
          </button>
          <button class="btn btn-ghost" type="button" (click)="cancel()">{{ note() ? 'Cancel' : 'Later' }}</button>
        </div>
      </form>
    } @else if (note(); as n) {
      <div class="card glass saved" animate.enter="enter-fade-up">
        @if (n.mood) {
          <span class="big-mood" [title]="moodLabel(n.mood)">{{ emoji(n.mood) }}</span>
        }
        <div class="saved-text">
          <span class="label muted">🌙 {{ store.isToday() ? "Today's" : "This day's" }} reflection</span>
          @if (n.reflection) {
            <p>{{ n.reflection }}</p>
          } @else {
            <p class="muted">Felt {{ moodLabel(n.mood).toLowerCase() }}.</p>
          }
        </div>
        <button class="icon-btn" type="button" (click)="edit()" aria-label="Edit reflection" title="Edit">✎</button>
      </div>
    } @else if (store.day()) {
      <button class="prompt" type="button" (click)="edit()">
        🌙 Reflect on {{ store.isToday() ? 'today' : 'this day' }} <kbd>R</kbd>
      </button>
    }
  `,
  styles: `
    :host { display: block; margin-top: 18px; }
    .evening { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
    .evening .label { font-size: 12px; font-weight: 700; }
    .card { padding: 16px 18px; border-radius: var(--radius-lg); }
    h3 { font-size: 17px; margin-bottom: 10px; }
    .moods { display: flex; gap: 6px; margin-bottom: 10px; }
    .mood {
      width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--surface-border);
      background: var(--surface); font-size: 22px; cursor: pointer; filter: grayscale(0.6); opacity: 0.8;
      transition: transform 0.25s var(--ease-spring), filter 0.2s, opacity 0.2s, background 0.2s;
      &:hover { transform: translateY(-2px) scale(1.06); filter: none; opacity: 1; }
      &.on { filter: none; opacity: 1; transform: scale(1.12); background: var(--surface-strong); box-shadow: var(--focus-ring); }
    }
    .row { display: flex; gap: 8px; }
    .row .input { flex: 1; min-width: 0; }
    .saved { display: flex; align-items: center; gap: 14px; }
    .big-mood { font-size: 34px; line-height: 1; }
    .saved-text { flex: 1; min-width: 0; }
    .saved-text p { margin: 2px 0 0; font-weight: 600; overflow-wrap: anywhere; }
    .label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .prompt {
      display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px;
      border-radius: var(--radius-pill); border: 1px dashed color-mix(in srgb, var(--accent-2) 45%, transparent);
      background: transparent; color: var(--text-muted); font-weight: 600; cursor: pointer;
      transition: background 0.2s, color 0.2s;
      &:hover { background: var(--surface); color: var(--text); }
    }
    @media (max-width: 520px) {
      .row { flex-wrap: wrap; }
      .row .input { flex-basis: 100%; }
    }
  `,
})
export class DayReflection {
  protected readonly store = inject(PlannerStore);
  private readonly habits = inject(HabitStore);

  /** Evening habits of this day ("Sleep 8h", "No screens"), ticked as part of winding down. */
  protected readonly eveningHabits = computed(() => {
    const d = this.habits.day();
    if (!d || d.date !== this.store.selectedDate() || this.store.isFuture()) return [];
    return d.items.filter((i) => i.habit.timeOfDay === 'evening');
  });
  private readonly textInput = viewChild<ElementRef<HTMLInputElement>>('text');

  protected readonly moods = MOODS;
  protected readonly emoji = moodEmoji;

  protected readonly mood = signal<Mood | null>(null);
  protected readonly reflection = signal('');
  protected readonly saving = signal(false);
  /** null = follow the default for this day; true/false = the user opened/closed it. */
  private readonly userOpen = signal<boolean | null>(null);

  /** The note of the loaded day (ignores a day response that's still for another date). */
  protected readonly note = computed(() => {
    const d = this.store.day();
    return d && d.date === this.store.selectedDate() ? d.note : null;
  });

  /** Evenings, finished days and past days without a note ask for a reflection right away. */
  protected readonly openByDefault = computed(() => {
    const d = this.store.day();
    if (!d || this.note()) return false;
    if (this.store.isPast()) return true;
    const allDone = d.planned > 0 && d.done === d.planned;
    return allDone || new Date().getHours() >= EVENING_HOUR;
  });

  protected readonly editing = computed(() => this.userOpen() ?? this.openByDefault());

  constructor() {
    // A different day: forget edits and start from that day's note.
    effect(() => {
      this.store.selectedDate();
      untracked(() => {
        this.userOpen.set(null);
        this.reset();
      });
    });
    // Keep the form in sync when the note loads (unless the user is mid-edit).
    effect(() => {
      this.note();
      if (untracked(() => this.userOpen() !== true)) untracked(() => this.reset());
    });
    // Opened from the keyboard (R) or the command palette.
    effect(() => {
      if (!this.store.reflectRequested()) return;
      untracked(() => {
        this.store.reflectRequested.set(false);
        this.edit();
      });
    });
  }

  protected edit(): void {
    this.reset();
    this.userOpen.set(true);
    setTimeout(() => {
      const input = this.textInput()?.nativeElement;
      input?.focus();
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  protected cancel(): void {
    this.reset();
    this.userOpen.set(false);
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    const ok = await this.store.saveNote(this.store.selectedDate(), this.mood(), this.reflection());
    this.saving.set(false);
    if (ok) this.userOpen.set(false);
  }

  protected moodLabel(mood: Mood | null): string {
    return this.moods.find((m) => m.id === mood)?.label ?? '';
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  private reset(): void {
    const n = this.note();
    this.mood.set(n?.mood ?? null);
    this.reflection.set(n?.reflection ?? '');
  }
}
