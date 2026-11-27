import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { TimeOfDay, timeOfDayFor } from '../features/focus-mode/lofi-scene/lofi-scene';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ThemePalette = 'daylight' | 'sunset' | 'ocean' | 'forest' | 'berry' | 'paper';

export interface PaletteInfo {
  id: ThemePalette;
  name: string;
  description: string;
  /** Two colours for the swatch in the picker (the light variant's accents). */
  swatch: [string, string];
}

/** Colour themes. The colours themselves live in styles.scss under [data-palette]. */
export const PALETTES: PaletteInfo[] = [
  {
    id: 'daylight',
    name: 'Daylight',
    description: 'Follows the time of day',
    swatch: ['#ff9a8b', '#4facfe'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm peach and coral',
    swatch: ['#ffa36c', '#ff5e7e'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Calm blues and teal',
    swatch: ['#26c6da', '#3d6bff'],
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Moss and pine greens',
    swatch: ['#7bc96f', '#239a7a'],
  },
  { id: 'berry', name: 'Berry', description: 'Bold pink and plum', swatch: ['#ff5fa2', '#9b4dff'] },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Quiet greys, ink accent',
    swatch: ['#8b93a7', '#3a4256'],
  },
];

const MODE_KEY = 'focus.theme';
const PALETTE_KEY = 'focus.palette';

/**
 * Light/dark mode plus a colour palette. The default "Daylight" palette follows the time of day
 * (sunrise → day → sunset → night). Written to <html data-theme data-palette data-tod> so plain CSS can react to it.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);

  readonly mode = signal<ThemeMode>(readMode());
  readonly palette = signal<ThemePalette>(readPalette());
  readonly paletteInfo = computed(
    () => PALETTES.find((p) => p.id === this.palette()) ?? PALETTES[0],
  );
  readonly timeOfDay = signal<TimeOfDay>(timeOfDayFor(new Date()));
  readonly isDark = computed(() =>
    this.mode() === 'auto' ? this.systemDark() : this.mode() === 'dark',
  );
  /**
   * The current accent and background colours, read back from CSS after a theme change (for canvas charts that can't use CSS variables).
   * Recomputes whenever the mode, palette or time of day changes.
   */
  readonly accents = computed(() => {
    this.isDark();
    this.palette();
    this.timeOfDay();
    return this.readAccents();
  });

  constructor() {
    const onChange = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
    this.media?.addEventListener('change', onChange);
    const timer = setInterval(() => this.timeOfDay.set(timeOfDayFor(new Date())), 60_000);
    inject(DestroyRef).onDestroy(() => {
      this.media?.removeEventListener('change', onChange);
      clearInterval(timer);
    });

    effect(() => {
      this.apply();
      this.document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', this.readVar('--bg-2') || '#fbe3e8');
    });
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    save(MODE_KEY, mode);
  }

  setPalette(palette: ThemePalette): void {
    this.palette.set(palette);
    save(PALETTE_KEY, palette);
  }

  /** auto → light → dark → auto */
  cycle(): void {
    const next: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };
    this.setMode(next[this.mode()]);
  }

  /** Writes the theme to <html> (also used by `accents` so the read-back sees the new values). */
  private apply(): void {
    const root = this.document.documentElement;
    root.dataset['theme'] = this.isDark() ? 'dark' : 'light';
    root.dataset['palette'] = this.palette();
    root.dataset['tod'] = this.timeOfDay();
  }

  private readAccents(): { accent1: string; accent2: string; background: string } {
    this.apply();
    return {
      accent1: this.readVar('--accent-1') || '#ff8e9e',
      accent2: this.readVar('--accent-2') || '#a17cff',
      background: this.readVar('--bg-2') || (this.isDark() ? '#1b1638' : '#fbe3f1'),
    };
  }

  private readVar(name: string): string {
    const view = this.document.defaultView;
    return view
      ? view.getComputedStyle(this.document.documentElement).getPropertyValue(name).trim()
      : '';
  }
}

function readMode(): ThemeMode {
  const v = load(MODE_KEY);
  return v === 'light' || v === 'dark' ? v : 'auto';
}

function readPalette(): ThemePalette {
  const v = load(PALETTE_KEY);
  return PALETTES.some((p) => p.id === v) ? (v as ThemePalette) : 'daylight';
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: keep the in-memory choice */
  }
}
