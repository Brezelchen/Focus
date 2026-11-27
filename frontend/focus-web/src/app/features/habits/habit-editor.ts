import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { todayIso } from '../../core/dates';
import { monthName, monthOf } from '../../core/habits';
import { Habit, HabitInput, HabitKind, HabitTimeOfDay, IsoDate } from '../../core/models';
import { RepeatEditor } from '../../shared/repeat-editor';

export interface HabitEditorData {
  /** The habit to edit, or null for a new one. */
  habit: Habit | null;
  /** The month the Habits page shows (for "Only in December"). */
  month: IsoDate;
  /** For new habits: which list to put it in. */
  list: 'base' | 'month';
}

type Track = 'tick' | 'count' | 'focus';

const ICONS = ['✅', '🛏️', '🚶', '💧', '😴', '🧘', '📖', '🏃', '🥗', '🦷', '💊', '🪴', '✍️', '🎸', '📵', '🍬', '☕', '🧠'];

/** Creates or edits a habit. Closes with a HabitInput, or undefined when cancelled. */
@Component({
  selector: 'app-habit-editor',
  imports: [RepeatEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="editor glass" (submit)="$event.preventDefault(); save()">
      <h2>{{ data.habit ? 'Edit habit' : 'New habit' }}</h2>

      <label class="field">
        <span>Habit</span>
        <input
          class="input"
          [value]="title()"
          (input)="title.set(value($event))"
          maxlength="100"
          required
          cdkFocusInitial
          [placeholder]="kind() === 'avoid' ? 'e.g. No sugar, Coffee' : 'e.g. Make bed, Daily walk, Sleep'"
        />
      </label>

      <div class="field">
        <span>Icon</span>
        <div class="options">
          @for (i of icons; track i) {
            <button type="button" class="opt emoji" [class.on]="icon() === i" (click)="icon.set(i)" [attr.aria-pressed]="icon() === i">{{ i }}</button>
          }
          <input class="input custom-icon" maxlength="4" [value]="icons.includes(icon()) ? '' : icon()" (input)="customIcon($event)" placeholder="🙂" aria-label="Custom emoji" />
        </div>
      </div>

      <div class="field">
        <span>List</span>
        <div class="options" role="radiogroup" aria-label="List">
          <button type="button" class="opt" role="radio" [class.on]="list() === 'base'" [attr.aria-checked]="list() === 'base'" (click)="list.set('base')">
            🔁 Every month
          </button>
          <button type="button" class="opt" role="radio" [class.on]="list() === 'month'" [attr.aria-checked]="list() === 'month'" (click)="list.set('month')">
            🗓️ Only in {{ monthLabel }}
          </button>
        </div>
      </div>

      <div class="field">
        <span>Kind</span>
        <div class="options" role="radiogroup" aria-label="Kind">
          <button type="button" class="opt" role="radio" [class.on]="kind() === 'build'" [attr.aria-checked]="kind() === 'build'" (click)="setKind('build')">
            🌱 Build it
          </button>
          <button type="button" class="opt" role="radio" [class.on]="kind() === 'avoid'" [attr.aria-checked]="kind() === 'avoid'" (click)="setKind('avoid')">
            ✋ Avoid it
          </button>
        </div>
      </div>

      <div class="field">
        <span>Track <small class="muted hint">· {{ trackHint() }}</small></span>
        <div class="options" role="radiogroup" aria-label="Track">
          <button type="button" class="opt" role="radio" [class.on]="track() === 'tick'" [attr.aria-checked]="track() === 'tick'" (click)="track.set('tick')">
            ✓ {{ kind() === 'avoid' ? 'Stayed clear' : 'Tick' }}
          </button>
          <button type="button" class="opt" role="radio" [class.on]="track() === 'count'" [attr.aria-checked]="track() === 'count'" (click)="track.set('count')">
            # {{ kind() === 'avoid' ? 'Limit' : 'Count' }}
          </button>
          @if (kind() === 'build') {
            <button type="button" class="opt" role="radio" [class.on]="track() === 'focus'" [attr.aria-checked]="track() === 'focus'" (click)="track.set('focus')">
              🎧 Focus minutes
            </button>
          }
        </div>
        @if (track() !== 'tick') {
          <div class="target-row">
            <label class="inline">
              {{ kind() === 'avoid' ? 'at most' : 'reach' }}
              <input class="input num" type="number" min="1" max="999" [value]="target()" (input)="setTarget($event)" aria-label="Target" />
            </label>
            @if (track() === 'count') {
              <input class="input unit" maxlength="12" [value]="unit()" (input)="unit.set(value($event))" placeholder="unit (h, glasses…)" aria-label="Unit" />
            } @else {
              <span class="muted">minutes of focus</span>
            }
          </div>
        }
      </div>

      <div class="field">
        <span>Time of day <small class="muted hint">· morning habits show in the morning recap, evening ones with the reflection</small></span>
        <div class="options" role="radiogroup" aria-label="Time of day">
          @for (t of times; track t.id) {
            <button type="button" class="opt" role="radio" [class.on]="timeOfDay() === t.id" [attr.aria-checked]="timeOfDay() === t.id" (click)="timeOfDay.set(t.id)">
              {{ t.label }}
            </button>
          }
        </div>
      </div>

      <div class="field">
        <span>Repeat</span>
        <app-repeat-editor [existing]="data.habit?.repeat ?? null" [baseDate]="baseDate" [allowNever]="false" />
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
    .field > span { font-size: 13px; font-weight: 700; color: var(--text-muted); }
    .hint { font-size: 12px; font-weight: 500; }
    .options { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .opt {
      height: 32px; padding: 0 12px; border-radius: var(--radius-pill); border: 1px solid var(--surface-border);
      background: var(--surface); cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-muted);
      transition: transform 0.2s var(--ease-spring), background 0.2s, color 0.2s;
      &:hover { transform: translateY(-1px); }
      &.on { color: #fff; background: var(--accent-grad); border-color: transparent; }
    }
    .emoji { width: 38px; padding: 0; font-size: 18px; }
    .custom-icon { width: 56px; height: 32px; border-radius: var(--radius-pill); text-align: center; font-size: 16px; padding: 0 8px; }
    .target-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 4px; }
    .inline { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--text-muted); }
    .num { width: 76px; height: 34px; padding: 0 10px; border-radius: var(--radius-sm); font-size: 14px; }
    .unit { width: 160px; height: 34px; padding: 0 10px; border-radius: var(--radius-sm); font-size: 14px; }
    .actions {
      position: sticky; bottom: -24px; z-index: 1;
      display: flex; justify-content: flex-end; gap: 8px;
      margin: 8px -24px -24px; padding: 12px 24px 16px;
      background: linear-gradient(var(--surface-strong), var(--surface-strong)) var(--bg-1);
      border-top: 1px solid var(--surface-border);
    }
    @media (max-width: 560px) {
      .editor { padding: 20px 18px; max-height: calc(100dvh - 24px); }
      .actions { bottom: -20px; margin: 8px -18px -20px; padding: 12px 18px calc(12px + env(safe-area-inset-bottom)); }
      .actions .btn { flex: 1; }
      .opt { height: 36px; }
    }
  `,
})
export class HabitEditor {
  protected readonly data = inject<HabitEditorData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<HabitInput>>(DialogRef);
  private readonly repeat = viewChild.required(RepeatEditor);

  protected readonly icons = ICONS;
  protected readonly times: { id: HabitTimeOfDay; label: string }[] = [
    { id: 'anytime', label: 'Anytime' },
    { id: 'morning', label: '🌅 Morning' },
    { id: 'evening', label: '🌙 Evening' },
  ];
  protected readonly monthLabel = monthName(this.data.month);

  private readonly h = this.data.habit;
  protected readonly title = signal(this.h?.title ?? '');
  protected readonly icon = signal(this.h?.icon ?? '✅');
  protected readonly list = signal<'base' | 'month'>(this.h ? (this.h.month ? 'month' : 'base') : this.data.list);
  protected readonly kind = signal<HabitKind>(this.h?.kind ?? 'build');
  protected readonly track = signal<Track>(this.h ? (this.h.countsFocusMinutes ? 'focus' : this.h.target !== null ? 'count' : 'tick') : 'tick');
  protected readonly target = signal(this.h?.target ?? 1);
  protected readonly unit = signal(this.h?.countsFocusMinutes ? '' : (this.h?.unit ?? ''));
  protected readonly timeOfDay = signal<HabitTimeOfDay>(this.h?.timeOfDay ?? 'anytime');

  /** New month habits start with their month (or today, whichever is later). */
  protected readonly baseDate = (() => {
    const today = todayIso();
    const start = monthOf(this.data.month);
    return this.data.list === 'month' && start > today ? start : today;
  })();

  protected readonly trackHint = computed(() => {
    const t = this.track();
    if (t === 'focus') return 'fills up by itself from your focus sessions';
    if (this.kind() === 'avoid') return t === 'tick' ? 'tick the days you stayed clear' : 'log it; done while you stay at or under the limit';
    return t === 'tick' ? 'tick it when done' : 'tap to count up towards the target';
  });

  protected setKind(kind: HabitKind): void {
    this.kind.set(kind);
    if (kind === 'avoid' && this.track() === 'focus') this.track.set('count');
  }

  protected setTarget(e: Event): void {
    const n = Math.round(Number((e.target as HTMLInputElement).value));
    if (n >= 1 && n <= 999) this.target.set(n);
  }

  protected customIcon(e: Event): void {
    const v = (e.target as HTMLInputElement).value.trim();
    this.icon.set(v || '✅');
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected save(): void {
    const title = this.title().trim();
    if (!title) return;
    const track = this.track();
    this.ref.close({
      title: title.slice(0, 100),
      icon: this.icon(),
      month: this.list() === 'month' ? monthOf(this.data.habit?.month ?? this.data.month) : null,
      repeat: this.repeat().value(),
      target: track === 'tick' ? null : this.target(),
      unit: track === 'count' ? this.unit().trim() || null : null,
      kind: this.kind(),
      timeOfDay: this.timeOfDay(),
      countsFocusMinutes: track === 'focus',
    });
  }
}
