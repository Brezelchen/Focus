import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { PetService } from './core/pet.service';
import { PlannerStore } from './core/planner.store';
import { PwaService } from './core/pwa.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';
import { CommandPaletteService } from './features/command-palette/command-palette.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly toasts = inject(ToastService);
  protected readonly store = inject(PlannerStore);
  protected readonly pet = inject(PetService);
  protected readonly pwa = inject(PwaService);
  protected readonly palette = inject(CommandPaletteService);
  /** "⌘K" on Apple devices, "Ctrl+K" elsewhere. */
  protected readonly paletteKeys = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
  private readonly router = inject(Router);

  /** Focus mode is full-screen: no navigation chrome. */
  protected readonly immersive = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects.startsWith('/focus')),
    ),
    { initialValue: false },
  );

  protected readonly themeIcon = { auto: '🌗', light: '☀️', dark: '🌙' } as const;

  constructor() {
    void this.store.init();
    // Fetch the command palette once the app has settled, so Ctrl+K opens instantly.
    setTimeout(() => void this.palette.preload().catch(() => undefined), 2000);

    // Pick up a new day after midnight or when the PWA comes back from the background.
    const check = () => void this.store.checkNewDay();
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 60_000);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    });

    // Back online: run the rollover and refresh everything that may have been served from the offline cache.
    let wasOnline = this.pwa.online();
    effect(() => {
      const online = this.pwa.online();
      if (online && !wasOnline) untracked(() => void this.store.init());
      wasOnline = online;
    });
  }

  protected onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.palette.toggle();
    }
  }
}
