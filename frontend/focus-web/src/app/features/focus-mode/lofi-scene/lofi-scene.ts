import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/** morning 5–11, afternoon 11–17, evening 17–21, night otherwise (local time). */
export function timeOfDayFor(date: Date): TimeOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

/**
 * Full-bleed, decorative "lofi" room illustration for Focus Mode:
 * a girl working on her laptop in an armchair with her little dog asleep beside her.
 * Fills its positioned parent; purely presentational (aria-hidden).
 */
@Component({
  selector: 'app-lofi-scene',
  templateUrl: './lofi-scene.html',
  styleUrl: './lofi-scene.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.data-time]': 'timeOfDay()',
    '[class.celebrating]': 'celebrating()',
    '[class.paused]': 'paused()',
  },
})
export class LofiScene {
  readonly timeOfDay = input<TimeOfDay>('evening');
  readonly celebrating = input(false);
  readonly paused = input(false);
  /** Which companion sleeps on the cushion. */
  readonly pet = input<'dog' | 'cat'>('dog');
}
