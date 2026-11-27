import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { PALETTES, ThemeMode, ThemeService } from '../core/theme.service';

const MODES: { id: ThemeMode; icon: string; label: string }[] = [
  { id: 'auto', icon: '🌗', label: 'Auto' },
  { id: 'light', icon: '☀️', label: 'Light' },
  { id: 'dark', icon: '🌙', label: 'Dark' },
];

/** Nav button that opens a small menu: light/dark mode and the colour theme. */
@Component({
  selector: 'app-theme-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    <button
      class="icon-btn"
      type="button"
      (click)="open.set(!open())"
      [attr.aria-expanded]="open()"
      aria-haspopup="dialog"
      [attr.aria-label]="
        'Theme: ' + theme.paletteInfo().name + ', ' + theme.mode() + '. Change theme.'
      "
      [title]="'Theme: ' + theme.paletteInfo().name"
    >
      🎨
    </button>

    @if (open()) {
      <div
        class="menu glass"
        role="dialog"
        aria-label="Theme"
        animate.enter="enter-fade-up"
        animate.leave="leave-fade"
      >
        <div class="modes" role="radiogroup" aria-label="Light or dark">
          @for (m of modes; track m.id) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="theme.mode() === m.id"
              [class.active]="theme.mode() === m.id"
              (click)="theme.setMode(m.id)"
            >
              <span aria-hidden="true">{{ m.icon }}</span> {{ m.label }}
            </button>
          }
        </div>

        <div class="palettes" role="radiogroup" aria-label="Colour theme">
          @for (p of palettes; track p.id) {
            <button
              type="button"
              class="palette"
              role="radio"
              [attr.aria-checked]="theme.palette() === p.id"
              [class.active]="theme.palette() === p.id"
              (click)="theme.setPalette(p.id)"
            >
              <span
                class="swatch"
                [style.background]="
                  'linear-gradient(135deg, ' + p.swatch[0] + ', ' + p.swatch[1] + ')'
                "
              ></span>
              <span class="text">
                <strong>{{ p.name }}</strong>
                <small>{{ p.description }}</small>
              </span>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }
    .menu {
      position: absolute;
      z-index: 30;
      left: calc(100% + 18px);
      bottom: 0;
      width: 260px;
      padding: 10px;
      background: var(--surface-strong);
    }
    .modes {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      padding: 4px;
      margin-bottom: 8px;
      border-radius: var(--radius-pill);
      background: var(--surface);
      button {
        height: 32px;
        border: 0;
        border-radius: var(--radius-pill);
        background: none;
        color: var(--text-muted);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        &.active {
          color: var(--text);
          background: var(--surface-strong);
          box-shadow: var(--shadow);
        }
      }
    }
    .palettes {
      display: grid;
      gap: 2px;
    }
    .palette {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 7px 8px;
      border: 0;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--text);
      text-align: left;
      cursor: pointer;
      &:hover {
        background: var(--surface-hover);
      }
      &.active {
        background: var(--surface-hover);
        box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent-2) 55%, transparent);
      }
    }
    .swatch {
      flex: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.5);
    }
    .text {
      display: grid;
      line-height: 1.25;
      strong {
        font-size: 14px;
      }
      small {
        color: var(--text-muted);
        font-size: 12px;
      }
    }
    @media (max-width: 760px) {
      .menu {
        left: auto;
        right: -48px;
        bottom: calc(100% + 18px);
      }
    }
  `,
})
export class ThemePicker {
  protected readonly theme = inject(ThemeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly modes = MODES;
  protected readonly palettes = PALETTES;

  protected onDocumentClick(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
