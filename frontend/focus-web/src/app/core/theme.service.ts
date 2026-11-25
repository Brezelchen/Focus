import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { TimeOfDay, timeOfDayFor } from '../features/focus-mode/lofi-scene/lofi-scene';

export type ThemeMode = 'auto' | 'light' | 'dark';
const STORAGE_KEY = 'focus.theme';

/**
 * Light/dark theme plus a time-of-day palette (sunrise → day → sunset → night) that the
 * gradients follow. Written to <html data-theme data-tod> so plain CSS can react to it.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);

  readonly mode = signal<ThemeMode>(readMode());
  readonly timeOfDay = signal<TimeOfDay>(timeOfDayFor(new Date()));
  readonly isDark = computed(() => (this.mode() === 'auto' ? this.systemDark() : this.mode() === 'dark'));

  constructor() {
    const onChange = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
    this.media?.addEventListener('change', onChange);
    const timer = setInterval(() => this.timeOfDay.set(timeOfDayFor(new Date())), 60_000);
    inject(DestroyRef).onDestroy(() => {
      this.media?.removeEventListener('change', onChange);
      clearInterval(timer);
    });

    effect(() => {
      const root = this.document.documentElement;
      root.dataset['theme'] = this.isDark() ? 'dark' : 'light';
      root.dataset['tod'] = this.timeOfDay();
      this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.isDark() ? '#1b1638' : '#fbe3e8');
    });
  }

  cycle(): void {
    const next: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };
    this.mode.set(next[this.mode()]);
    try {
      localStorage.setItem(STORAGE_KEY, this.mode());
    } catch {
      /* storage unavailable: keep the in-memory choice */
    }
  }
}

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}
