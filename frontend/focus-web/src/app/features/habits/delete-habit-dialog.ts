import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { longDate } from '../../core/dates';
import { Habit, HabitHistory } from '../../core/models';

export type DeleteHabitChoice = 'delete' | 'archive';

/**
 * Confirms deleting a habit. Shows what would be lost and offers archiving (keeps the history) as the safe
 * default; deleting is the red button. Closes with the choice, or undefined when cancelled.
 */
@Component({
  selector: 'app-delete-habit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="box glass" role="alertdialog" aria-labelledby="del-title" aria-describedby="del-desc">
      <div class="icon" aria-hidden="true">{{ habit.icon }}</div>
      <h2 id="del-title">Delete "{{ habit.title }}"?</h2>

      <div id="del-desc">
        @if (history(); as h) {
          @if (h.row.total > 0) {
            <ul class="loss">
              <li><strong>{{ h.row.total }}</strong> {{ totalLabel() }}</li>
              @if (h.row.bestStreak > 1) {
                <li>a best streak of <strong>{{ h.row.bestStreak }} days</strong></li>
              }
              <li>tracked since <strong>{{ since }}</strong></li>
            </ul>
            <p class="muted">All of this history goes with it, from the tracker, your streaks and your stats. This can't be undone.</p>
          } @else {
            <p class="muted">Nothing has been logged for it yet, so no history will be lost.</p>
          }
        } @else {
          <p class="muted">Its whole history goes with it, from the tracker, your streaks and your stats. This can't be undone.</p>
        }

        @if (!habit.archivedAt) {
          <p class="tip">💡 <strong>Archiving</strong> takes it off your lists from today but keeps every past tick.</p>
        }
      </div>

      <div class="actions">
        <!-- Delete sits apart from the safe choices; the safe choice gets the focus, so a stray Enter never deletes. -->
        <button type="button" class="btn danger" (click)="ref.close('delete')">🗑️ Delete forever</button>
        <span class="safe">
          @if (habit.archivedAt) {
            <button type="button" class="btn btn-ghost" (click)="ref.close()" cdkFocusInitial>Cancel</button>
          } @else {
            <button type="button" class="btn btn-ghost cancel" (click)="ref.close()">Cancel</button>
            <button type="button" class="btn btn-primary" (click)="ref.close('archive')" cdkFocusInitial>🗄️ Archive instead</button>
          }
        </span>
      </div>
    </div>
  `,
  styles: `
    .box { width: 480px; max-width: 100%; padding: 24px; background: var(--surface-strong); text-align: center; }
    .icon {
      width: 64px; height: 64px; margin: 0 auto 10px; display: grid; place-items: center; font-size: 32px;
      border-radius: 50%; background: color-mix(in srgb, var(--danger) 12%, var(--surface));
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--danger) 6%, transparent);
    }
    h2 { font-size: 20px; margin: 0 0 12px; overflow-wrap: anywhere; }
    .loss {
      list-style: none; margin: 0 0 10px; padding: 10px 14px; border-radius: var(--radius);
      background: var(--surface); display: flex; flex-direction: column; gap: 2px; font-size: 14px;
    }
    p { font-size: 14px; margin: 0 0 10px; }
    .tip { padding: 10px 12px; border-radius: var(--radius); background: color-mix(in srgb, var(--accent-2) 10%, var(--surface)); text-align: left; }
    .actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 18px; }
    .safe { display: flex; gap: 8px; }
    .danger {
      color: #fff; background: var(--danger); border: 0;
      box-shadow: 0 10px 22px -14px var(--danger);
      &:hover { filter: brightness(1.05); }
    }
    /* Phones: stacked, safest first (Archive, Cancel), Delete last and away from the thumb's default spot. */
    @media (max-width: 520px) {
      .actions, .safe { flex-direction: column; align-items: stretch; width: 100%; }
      .actions { flex-direction: column-reverse; }
      .safe { flex-direction: column-reverse; }
      .actions .btn { width: 100%; }
    }
  `,
})
export class DeleteHabitDialog {
  protected readonly habit = inject<Habit>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<DeleteHabitChoice>>(DialogRef);
  private readonly api = inject(Api);

  protected readonly history = signal<HabitHistory | null>(null);
  protected readonly since = longDate(this.habit.repeat.startDate);

  constructor() {
    // Best effort: the dialog works without the numbers.
    void firstValueFrom(this.api.habitHistory(this.habit.id))
      .then((h) => this.history.set(h))
      .catch(() => undefined);
  }

  protected totalLabel(): string {
    const h = this.habit;
    if (h.target === null) return h.kind === 'avoid' ? 'days stayed clear' : 'times done';
    return `${h.unit ?? 'counted'} logged`;
  }
}
