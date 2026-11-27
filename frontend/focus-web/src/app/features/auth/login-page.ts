import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Pup } from '../../shared/pup';

/** Messages for the `error` query parameter the API sets when a GitHub sign-in fails. */
const ERRORS: Record<string, string> = {
  github: "Signing in with GitHub didn't work out. Please try again.",
  'email-taken':
    'There is already a Focus account with your GitHub email. Sign in with your password, then connect GitHub from the account menu.',
  'github-linked-elsewhere': 'This GitHub account belongs to a different Focus account.',
};

@Component({
  selector: 'app-login-page',
  imports: [Pup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card glass" aria-labelledby="login-title">
      <app-pup mood="happy" [size]="104" />
      <h1 id="login-title">
        @if (mode() === 'login') {
          Welcome back to <span class="gradient-text">Focus</span>
        } @else {
          Make yourself at home
        }
      </h1>
      <p class="muted">
        {{
          mode() === 'login'
            ? 'Sign in to pick up where you left off.'
            : 'Create an account to keep your plans safe.'
        }}
        You'll stay signed in on this device.
      </p>

      @if (message(); as m) {
        <p class="error" role="alert">{{ m }}</p>
      }

      @if (auth.providers().gitHub) {
        <button class="btn btn-github" type="button" (click)="github()">
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          Continue with GitHub
        </button>
        <div class="divider"><span>or with email</span></div>
      }

      <form (submit)="submit($event)" novalidate>
        @if (mode() === 'register') {
          <label>
            <span>Your name</span>
            <input
              class="input"
              name="name"
              autocomplete="name"
              maxlength="100"
              placeholder="Optional"
            />
          </label>
        }
        <label>
          <span>Email</span>
          <input
            class="input"
            name="email"
            type="email"
            autocomplete="email"
            required
            maxlength="254"
          />
        </label>
        <label>
          <span>Password</span>
          <input
            class="input"
            name="password"
            type="password"
            required
            [attr.minlength]="mode() === 'register' ? 8 : null"
            maxlength="128"
            [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
            [attr.placeholder]="mode() === 'register' ? 'At least 8 characters' : null"
          />
        </label>
        <button class="btn btn-primary submit" type="submit" [disabled]="busy()">
          {{ busy() ? 'One moment…' : mode() === 'login' ? 'Sign in' : 'Create account' }}
        </button>
      </form>

      <p class="switch muted">
        @if (mode() === 'login') {
          New here?
          <button type="button" class="link" (click)="switchMode('register')">
            Create an account
          </button>
        } @else {
          Already have an account?
          <button type="button" class="link" (click)="switchMode('login')">Sign in</button>
        }
      </p>
    </section>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr); /* lets the card shrink below 420px on phones */
      place-items: center;
      min-height: calc(100dvh - 48px);
    }
    .card {
      width: 420px;
      max-width: 100%;
      padding: 32px 28px 24px;
      @media (max-width: 420px) { padding: 24px 18px 20px; }
      text-align: center;
      background: var(--surface-strong);
    }
    h1 {
      margin: 8px 0 6px;
      font-size: 26px;
    }
    .muted {
      margin: 0 0 20px;
    }
    .error {
      margin: 0 0 16px;
      padding: 10px 14px;
      border-radius: var(--radius);
      color: var(--danger);
      background: color-mix(in srgb, var(--danger) 12%, transparent);
      text-align: left;
    }
    .btn-github {
      width: 100%;
      height: 44px;
      color: #fff;
      background: #24292f;
      &:hover:not(:disabled) {
        transform: translateY(-2px);
        background: #32383f;
      }
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 18px 0;
      color: var(--text-faint);
      font-size: 13px;
      &::before,
      &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--surface-border);
      }
    }
    :host-context([data-theme='dark']) .divider::before,
    :host-context([data-theme='dark']) .divider::after {
      background: var(--text-faint);
      opacity: 0.4;
    }
    form {
      display: grid;
      gap: 14px;
      text-align: left;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
    }
    .submit {
      height: 44px;
      margin-top: 4px;
    }
    .switch {
      margin: 18px 0 0;
      font-size: 14px;
    }
    .link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--accent-2);
      font-weight: 600;
      cursor: pointer;
      &:hover {
        text-decoration: underline;
      }
    }
  `,
})
export class LoginPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query parameters (component input binding). */
  readonly returnUrl = input<string>();
  readonly error = input<string>();

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);

  ngOnInit(): void {
    void this.auth.loadProviders();
    const code = this.error();
    if (code) this.message.set(ERRORS[code] ?? ERRORS['github']);
  }

  protected switchMode(mode: 'login' | 'register'): void {
    this.mode.set(mode);
    this.message.set(null);
  }

  protected github(): void {
    this.auth.signInWithGitHub(this.target());
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (!email || !password) {
      this.message.set('Please enter your email and password.');
      return;
    }

    this.busy.set(true);
    this.message.set(null);
    try {
      if (this.mode() === 'login') await this.auth.login(email, password);
      else await this.auth.register(email, password, String(data.get('name') ?? '').trim());
      await this.router.navigateByUrl(this.target());
    } catch (err) {
      const status = (err as { status?: number }).status;
      this.message.set(
        status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : errorMessage(err),
      );
    } finally {
      this.busy.set(false);
    }
  }

  /** Where to go after signing in: only paths within the app. */
  private target(): string {
    const url = this.returnUrl();
    return url?.startsWith('/') &&
      !url.startsWith('//') &&
      !url.startsWith('/\\') &&
      !url.startsWith('/login')
      ? url
      : '/';
  }
}
