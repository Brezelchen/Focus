import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { PetService } from './core/pet.service';
import { PlannerStore } from './core/planner.store';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly toasts = inject(ToastService);
  protected readonly store = inject(PlannerStore);
  protected readonly pet = inject(PetService);
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

    // Pick up a new day after midnight or when the PWA comes back from the background.
    const check = () => void this.store.checkNewDay();
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 60_000);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    });
  }
}
