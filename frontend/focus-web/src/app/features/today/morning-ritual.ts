import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { greeting, relativeDayName } from '../../core/dates';
import { PlannerStore } from '../../core/planner.store';
import { ProgressRing } from '../../shared/progress-ring';
import { Pup } from '../../shared/pup';

/** First open of the day: how yesterday went, and a one-click way to bring unfinished tasks back. */
@Component({
  selector: 'app-morning-ritual',
  imports: [ProgressRing, Pup],
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
          </p>
          <ul class="returned">
            @for (t of r.returnedTasks; track t.id) {
              <li>
                <span>{{ t.title }}</span>
                @if (broughtBack().has(t.id)) {
                  <span class="chip" data-color="mint">✓ on today</span>
                } @else {
                  <button class="btn btn-ghost small-btn" type="button" (click)="bringBack(t.id)">☀️ Today</button>
                }
              </li>
            }
          </ul>
        }

        <div class="actions">
          @if (r.returnedTasks.length > 1 && broughtBack().size < r.returnedTasks.length) {
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
    .small-btn { height: 32px; padding: 0 12px; font-size: 13px; }
    .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
  `,
})
export class MorningRitual {
  protected readonly store = inject(PlannerStore);
  private readonly ref = inject(DialogRef);

  protected readonly hello = greeting();
  protected readonly broughtBack = signal(new Set<number>());

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

  protected async bringAllBack(): Promise<void> {
    for (const t of this.store.ritual()?.returnedTasks ?? []) {
      if (!this.broughtBack().has(t.id)) await this.bringBack(t.id);
    }
  }

  protected close(): void {
    this.store.dismissRitual();
    this.ref.close();
  }
}
