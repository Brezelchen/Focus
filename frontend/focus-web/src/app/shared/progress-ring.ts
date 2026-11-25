import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let nextId = 0;

/** Circular progress with an animated gradient stroke. */
@Component({
  selector: 'app-progress-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 100 100" role="img" [attr.aria-label]="label()">
      <defs>
        <linearGradient [attr.id]="gradId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="var(--accent-1)" />
          <stop offset="100%" stop-color="var(--accent-2)" />
        </linearGradient>
      </defs>
      <circle class="track" cx="50" cy="50" [attr.r]="r" />
      <circle
        class="bar"
        cx="50"
        cy="50"
        [attr.r]="r"
        [attr.stroke]="'url(#' + gradId + ')'"
        [attr.stroke-dasharray]="circumference"
        [attr.stroke-dashoffset]="offset()"
      />
    </svg>
    <div class="center"><ng-content /></div>
  `,
  styles: `
    :host { position: relative; display: inline-grid; place-items: center; }
    svg { transform: rotate(-90deg); overflow: visible; }
    circle { fill: none; stroke-width: 9; }
    .track { stroke: color-mix(in srgb, var(--text-faint) 22%, transparent); }
    .bar {
      stroke-linecap: round;
      transition: stroke-dashoffset 0.9s cubic-bezier(0.34, 1.3, 0.64, 1);
      filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--accent-2) 50%, transparent));
    }
    .center { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; }
  `,
})
export class ProgressRing {
  readonly value = input(0); // 0..1
  readonly size = input(120);
  readonly label = input('Progress');

  protected readonly gradId = `ring-grad-${nextId++}`;
  protected readonly r = 42;
  protected readonly circumference = 2 * Math.PI * this.r;
  protected readonly offset = computed(() => this.circumference * (1 - Math.min(Math.max(this.value(), 0), 1)));
}
