import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { longDate } from '../../core/dates';
import { meets, progressLabel } from '../../core/habits';
import { Habit, IsoDate } from '../../core/models';

export interface CheckInData {
  habit: Habit;
  date: IsoDate;
  count: number;
  skipped: boolean;
}

export interface CheckInResult {
  count: number;
  skipped: boolean;
}

/** Sets a habit's count for one day, or marks the day as a rest day. */
@Component({
  selector: 'app-check-in-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="box glass" (submit)="$event.preventDefault(); save()">
      <h2><span aria-hidden="true">{{ data.habit.icon }}</span> {{ data.habit.title }}</h2>
      <p class="muted when">{{ when }}</p>

      @if (data.habit.countsFocusMinutes) {
        <p class="muted">This one fills up from your focus sessions ({{ data.count }} min so far).</p>
      } @else if (data.habit.target !== null) {
        <div class="stepper" [class.off]="skipped()">
          <button type="button" class="icon-btn big" (click)="add(-1)" aria-label="One less" [disabled]="skipped() || count() === 0">−</button>
          <input class="input num" type="number" min="0" max="9999" [value]="count()" (input)="setCount($event)" aria-label="Count" [disabled]="skipped()" cdkFocusInitial />
          <button type="button" class="icon-btn big" (click)="add(1)" aria-label="One more" [disabled]="skipped()">+</button>
        </div>
        <p class="progress" [class.met]="met()">{{ label() }} {{ met() ? '✓' : '' }}</p>
      } @else {
        <label class="tick">
          <input type="checkbox" [checked]="count() > 0" (change)="count.set(count() > 0 ? 0 : 1)" [disabled]="skipped()" />
          {{ data.habit.kind === 'avoid' ? 'Stayed clear' : 'Done' }}
        </label>
      }

      <label class="tick rest">
        <input type="checkbox" [checked]="skipped()" (change)="skipped.set(!skipped())" />
        😴 Rest day <small class="muted">(sick, travelling… keeps your streak)</small>
      </label>

      <div class="actions">
        <button type="button" class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  `,
  styles: `
    .box { width: 360px; max-width: 100%; padding: 24px; background: var(--surface-strong); }
    h2 { font-size: 20px; margin: 0; }
    .when { margin: 2px 0 16px; font-size: 14px; }
    .stepper { display: flex; align-items: center; justify-content: center; gap: 10px; }
    .stepper.off { opacity: 0.5; }
    .big { width: 44px; height: 44px; font-size: 22px; }
    .num { width: 96px; height: 44px; text-align: center; font-size: 20px; font-weight: 700; }
    .progress { text-align: center; font-weight: 700; color: var(--text-muted); margin: 8px 0 12px; }
    .progress.met { color: var(--success); }
    .tick { display: flex; align-items: center; gap: 8px; font-weight: 600; margin: 8px 0; cursor: pointer; }
    .tick input { width: 18px; height: 18px; accent-color: var(--accent-2); }
    .rest small { font-weight: 500; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `,
})
export class CheckInDialog {
  protected readonly data = inject<CheckInData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<CheckInResult>>(DialogRef);

  protected readonly when = longDate(this.data.date);
  protected readonly count = signal(this.data.count);
  protected readonly skipped = signal(this.data.skipped);
  protected readonly label = computed(() => progressLabel(this.data.habit, this.count()));
  protected readonly met = computed(() => meets(this.data.habit, this.count()));

  protected add(delta: number): void {
    this.count.set(Math.max(0, Math.min(9999, this.count() + delta)));
  }

  protected setCount(e: Event): void {
    const n = Math.round(Number((e.target as HTMLInputElement).value));
    if (n >= 0 && n <= 9999) this.count.set(n);
  }

  protected save(): void {
    this.ref.close({ count: this.skipped() || this.data.habit.countsFocusMinutes ? 0 : this.count(), skipped: this.skipped() });
  }
}
