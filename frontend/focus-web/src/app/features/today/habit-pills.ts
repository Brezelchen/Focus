import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { HabitStore } from '../../core/habit.store';
import { fillRatio, isOverLimit, progressLabel } from '../../core/habits';
import { HabitDayItem, IsoDate } from '../../core/models';
import { CheckInData, CheckInDialog, CheckInResult } from '../habits/check-in-dialog';

/** Tappable habit pills for one day: tap ticks (or counts up), ⋯ sets an amount or a rest day. */
@Component({
  selector: 'app-habit-pills',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="pills" [class.compact]="compact()" [class.subtle]="subtle()">
      @for (item of items(); track item.habit.id) {
        <li
          class="pill"
          [class.done]="item.done"
          [class.skipped]="item.skipped"
          [class.over]="over(item)"
          [class.avoid]="item.habit.kind === 'avoid'"
          [style.--fill]="fill(item)"
        >
          <button
            type="button"
            class="tap"
            [disabled]="readonly() || item.skipped"
            [attr.aria-pressed]="item.habit.target === null ? item.done : null"
            [attr.aria-label]="ariaLabel(item)"
            (click)="tap(item, $event)"
          >
            <span class="ico" aria-hidden="true">{{ item.done && item.habit.kind === 'avoid' && item.habit.target === null ? '✋' : item.habit.icon }}</span>
            <span class="title">{{ item.habit.title }}</span>
            @if (item.skipped) {
              <span class="meta">😴 rest</span>
            } @else if (item.habit.target !== null) {
              <span class="meta">{{ label(item) }}</span>
            } @else if (item.done) {
              <span class="meta check" aria-hidden="true">✓</span>
            }
            @if (item.missedYesterday && !item.done && !item.skipped && !readonly()) {
              <span class="comeback" title="Missed yesterday. Never miss twice!" aria-hidden="true">🌱</span>
            }
          </button>
          @if (!readonly()) {
            <button class="more" type="button" [cdkMenuTriggerFor]="menu" [attr.aria-label]="'More for ' + item.habit.title">⋯</button>
            <ng-template #menu>
              <div class="action-menu glass" cdkMenu>
                @if (item.habit.target !== null && !item.habit.countsFocusMinutes) {
                  <button cdkMenuItem (cdkMenuItemTriggered)="openAmount(item)">🔢 Set amount…</button>
                  @if (item.count > 0) {
                    <button cdkMenuItem (cdkMenuItemTriggered)="store.setCount(item, date(), 0)">↩️ Reset</button>
                  }
                }
                <button cdkMenuItem (cdkMenuItemTriggered)="store.toggleSkip(item, date())">
                  {{ item.skipped ? '💪 Not a rest day' : '😴 Rest day (keeps the streak)' }}
                </button>
              </div>
            </ng-template>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .pills { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .pill {
      --fill: 0;
      position: relative; display: flex; align-items: stretch;
      border-radius: var(--radius-pill); border: 1px solid var(--surface-border);
      background: linear-gradient(to right, color-mix(in srgb, var(--accent-2) 22%, transparent) calc(var(--fill) * 100%), var(--surface) 0);
      transition: transform 0.25s var(--ease-spring), background 0.25s, box-shadow 0.25s;
      &:hover { transform: translateY(-1px); }
      &.done { background: var(--accent-grad); border-color: transparent; color: #fff; box-shadow: 0 10px 22px -14px var(--accent-2); }
      &.done .meta, &.done .more { color: #fff; }
      &.skipped { opacity: 0.65; }
      &.over { border-color: color-mix(in srgb, var(--danger) 45%, transparent); background: color-mix(in srgb, var(--danger) 12%, var(--surface)); }
      &.over .meta { color: var(--danger); }
    }
    .tap {
      display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 4px 0 14px;
      border: 0; background: none; font: inherit; font-weight: 700; font-size: 14px; color: inherit; cursor: pointer;
      &:disabled { cursor: default; }
    }
    .ico { font-size: 17px; }
    .title { white-space: nowrap; max-width: 22ch; overflow: hidden; text-overflow: ellipsis; }
    .meta { font-size: 12px; font-weight: 700; color: var(--text-muted); white-space: nowrap; }
    .check { font-size: 14px; }
    .comeback { font-size: 13px; animation: bob 1.6s ease-in-out infinite; }
    .more {
      border: 0; background: none; color: var(--text-faint); font-size: 16px; font-weight: 800; cursor: pointer;
      padding: 0 12px 0 6px; border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
    }
    .compact .tap { min-height: 34px; font-size: 13px; padding-left: 12px; }

    /* Subtle: quiet outline pills that sit in the background of Today instead of competing with the tasks. */
    .subtle { gap: 6px; }
    .subtle .pill {
      border-color: color-mix(in srgb, var(--text-faint) 30%, transparent);
      background: linear-gradient(to right, color-mix(in srgb, var(--accent-2) 10%, transparent) calc(var(--fill) * 100%), transparent 0);
      color: var(--text-muted);
      &:hover { transform: none; border-color: var(--surface-border); background-color: var(--surface); }
      &.done { background: color-mix(in srgb, var(--accent-2) 8%, transparent); border-color: transparent; color: var(--text-faint); box-shadow: none; }
      &.done .meta, &.done .more { color: var(--accent-2); }
      &.done .title { text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--text-faint) 60%, transparent); }
      &.over { background: color-mix(in srgb, var(--danger) 6%, transparent); }
    }
    .subtle .tap { min-height: 30px; padding-left: 10px; gap: 5px; font-size: 13px; font-weight: 600; }
    .subtle .ico { font-size: 13px; }
    .subtle .meta { font-size: 11px; font-weight: 600; }
    .subtle .more { padding: 0 9px 0 4px; font-size: 13px; opacity: 0; transition: opacity 0.15s; }
    .subtle .pill:hover .more, .subtle .pill:focus-within .more { opacity: 1; }
    /* Staying under a limit isn't "crossed off": no strike-through for avoid habits. */
    .subtle .pill.done.avoid .title { text-decoration: none; }
    .subtle .comeback { font-size: 10px; animation: none; opacity: 0.55; }
    @media (hover: none) { .subtle .more { opacity: 0.6; } }
    /* Phones: one line that scrolls sideways instead of a block of pills. */
    @media (max-width: 560px) {
      .subtle { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-right: -16px; padding-right: 16px; }
      .subtle::-webkit-scrollbar { display: none; }
      .subtle .pill { flex: none; }
    }
    @keyframes bob { 50% { transform: translateY(-2px); } }
    @media (prefers-reduced-motion: reduce) { .comeback { animation: none; } }
  `,
})
export class HabitPills {
  protected readonly store = inject(HabitStore);
  private readonly dialog = inject(Dialog);

  readonly items = input.required<HabitDayItem[]>();
  readonly date = input.required<IsoDate>();
  /** Future days: shown but not tickable. */
  readonly readonly = input(false);
  readonly compact = input(false);
  /** Quiet look for the Today strip. */
  readonly subtle = input(false);

  protected label(item: HabitDayItem): string {
    return progressLabel(item.habit, item.count);
  }

  protected fill(item: HabitDayItem): number {
    return item.done || item.habit.kind === 'avoid' ? 0 : fillRatio(item.habit, item.count);
  }

  protected over(item: HabitDayItem): boolean {
    return isOverLimit(item.habit, item.count);
  }

  protected ariaLabel(item: HabitDayItem): string {
    if (item.skipped) return `${item.habit.title}: rest day`;
    const progress = item.habit.target !== null ? `, ${this.label(item)}` : '';
    const action = item.habit.countsFocusMinutes ? '' : item.habit.target !== null ? '. Tap to add one' : item.done ? '. Tap to untick' : '. Tap to tick';
    return `${item.habit.title}${progress}${item.done ? ', done' : ''}${action}`;
  }

  protected tap(item: HabitDayItem, e: MouseEvent): void {
    if (item.habit.countsFocusMinutes) return void this.openAmount(item);
    void this.store.tap(item, this.date(), { x: e.clientX, y: e.clientY });
  }

  protected openAmount(item: HabitDayItem): void {
    const ref = this.dialog.open<CheckInResult, CheckInData>(CheckInDialog, {
      data: { habit: item.habit, date: this.date(), count: item.count, skipped: item.skipped },
      panelClass: 'focus-dialog',
      backdropClass: 'focus-backdrop',
    });
    ref.closed.subscribe((r) => r && void this.store.setCount(item, this.date(), r.count, r.skipped));
  }
}
