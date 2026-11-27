import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './core/auth.service';
import { PetService } from './core/pet.service';
import { PlannerStore } from './core/planner.store';
import { PwaService } from './core/pwa.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';
import { CommandPaletteService } from './features/command-palette/command-palette.service';
import { AccountMenu } from './shared/account-menu';
import { ThemePicker } from './shared/theme-picker';

/** Messages for the `auth` query parameter the API adds after linking GitHub from the account menu. */
const AUTH_NOTICES: Record<string, { text: string; kind: 'success' | 'error' }> = {
  'github-linked': { text: 'GitHub is connected. You can sign in with it from now on ✨', kind: 'success' },
  'github-linked-elsewhere': { text: 'That GitHub account already belongs to a different Focus account.', kind: 'error' },
  'email-taken': { text: 'That GitHub account uses an email that belongs to another Focus account.', kind: 'error' },
  github: { text: "Connecting GitHub didn't work out. Please try again.", kind: 'error' },
};

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AccountMenu, ThemePicker],
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
  protected readonly auth = inject(AuthService);
  /** "⌘K" on Apple devices, "Ctrl+K" elsewhere. */
  protected readonly paletteKeys = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: '' },
  );
  /** Focus mode is full-screen: no navigation chrome. */
  protected readonly immersive = computed(() => this.url().startsWith('/focus'));
  /** The sign-in page has no navigation either. */
  protected readonly signInPage = computed(() => this.url().startsWith('/login'));

  constructor() {
    this.showAuthNotice();

    // Load the planner as soon as someone is signed in (the route guards check the session first).
    let palettePreloaded = false;
    effect(() => {
      if (!this.auth.signedIn()) return;
      untracked(() => {
        void this.store.init();
        if (!palettePreloaded) {
          palettePreloaded = true;
          // Fetch the command palette once the app has settled, so Ctrl+K opens instantly.
          setTimeout(() => void this.palette.preload().catch(() => undefined), 2000);
        }
      });
    });

    // Pick up a new day after midnight or when the PWA comes back from the background.
    const check = () => {
      if (this.auth.signedIn()) void this.store.checkNewDay();
    };
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
      if (online && !wasOnline && untracked(this.auth.signedIn)) untracked(() => void this.store.init());
      wasOnline = online;
    });
  }

  protected onKey(e: KeyboardEvent): void {
    if (!this.auth.signedIn()) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.palette.toggle();
    }
  }

  /** After linking GitHub the API returns to `/?auth=<result>`: show it as a toast and tidy the URL. */
  private showAuthNotice(): void {
    const params = new URLSearchParams(location.search);
    const code = params.get('auth');
    if (!code) return;
    const notice = AUTH_NOTICES[code] ?? AUTH_NOTICES['github'];
    this.toasts.show(notice.text, notice.kind, undefined, 8000);
    params.delete('auth');
    const query = params.toString();
    history.replaceState(history.state, '', location.pathname + (query ? `?${query}` : '') + location.hash);
  }
}
