import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';

export interface User {
  id: number;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  gitHubLogin: string | null;
  /** False when the account can only sign in with GitHub. */
  hasPassword: boolean;
}

export interface AuthProviders {
  gitHub: boolean;
}

/** The last signed-in user, so an installed app opened offline still knows who you are. */
const USER_KEY = 'focus.user';
/** Per-user things kept in localStorage that shouldn't carry over to whoever signs in next. */
const PER_USER_KEYS = [USER_KEY, 'focus.selection', 'focus.ritualShownOn'];

/**
 * Who is signed in. The server keeps you signed in with a long-lived cookie (renewed while you use the app),
 * so this only asks the server; there's no token to store or refresh here.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(null);
  readonly signedIn = computed(() => this.user() !== null);
  readonly providers = signal<AuthProviders>({ gitHub: false });

  private checking: Promise<User | null> | null = null;

  /** Resolves the signed-in user once per app start: null when signed out. Offline, falls back to the last known user. */
  ensureUser(): Promise<User | null> {
    if (this.user()) return Promise.resolve(this.user());
    this.checking ??= firstValueFrom(this.http.get<User>('/api/auth/me'))
      .then((user) => this.setUser(user))
      .catch((err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.forget();
          return null;
        }
        // Server or network unreachable: stay signed in as the last user; the app shows its offline banner.
        const cached = readCachedUser();
        if (cached) this.user.set(cached);
        return cached;
      })
      .finally(() => (this.checking = null));
    return this.checking;
  }

  async loadProviders(): Promise<void> {
    try {
      this.providers.set(await firstValueFrom(this.http.get<AuthProviders>('/api/auth/providers')));
    } catch {
      // Keep the defaults; email sign-in still works.
    }
  }

  async login(email: string, password: string): Promise<User> {
    return this.setUser(
      await firstValueFrom(this.http.post<User>('/api/auth/login', { email, password })),
    );
  }

  async register(email: string, password: string, name: string): Promise<User> {
    return this.setUser(
      await firstValueFrom(this.http.post<User>('/api/auth/register', { email, password, name })),
    );
  }

  /** Full-page navigation: GitHub sends the browser back to the API, which then returns to the app. */
  signInWithGitHub(returnUrl = '/'): void {
    location.assign(`/api/auth/github?returnUrl=${encodeURIComponent(returnUrl)}&ngsw-bypass=true`);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // Signing out locally still makes sense when the server can't be reached.
    }
    this.forget();
    await clearCachedApiData();
    // A full reload drops every bit of in-memory state from this account.
    location.assign('/login');
  }

  /** Called when the server says the session is gone (e.g. the cookie expired after a year without use). */
  sessionEnded(): void {
    if (!this.user()) return;
    this.forget();
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  private setUser(user: User): User {
    // A different account than last time on this device: drop the previous one's local leftovers.
    if (readCachedUser()?.id !== user.id)
      PER_USER_KEYS.forEach((k) => storage(() => localStorage.removeItem(k)));
    this.user.set(user);
    storage(() => localStorage.setItem(USER_KEY, JSON.stringify(user)));
    return user;
  }

  private forget(): void {
    this.user.set(null);
    storage(() => localStorage.removeItem(USER_KEY));
  }
}

/** Lets only signed-in users in; others go to the sign-in page and come back afterwards. */
// Guards inject everything before their first `await`: inject() only works synchronously.
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (await auth.ensureUser()) return true;
  return router.createUrlTree(['/login'], {
    queryParams: state.url === '/' ? {} : { returnUrl: state.url },
  });
};

/** The sign-in page is for signed-out users only. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.ensureUser()) ? router.createUrlTree(['/']) : true;
};

/** A 401 from the API outside the sign-in endpoints means the session ended: go to the sign-in page. */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.startsWith('/api/auth/')
      )
        auth.sessionEnded();
      return throwError(() => err);
    }),
  );
};

function readCachedUser(): User | null {
  return storage(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });
}

/** The service worker keeps recent API reads for offline use; they belong to the account that just signed out. */
async function clearCachedApiData(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.includes(':api-reads:')).map((n) => caches.delete(n)));
  } catch {
    // Best effort.
  }
}

function storage<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null; // private mode / blocked storage
  }
}
