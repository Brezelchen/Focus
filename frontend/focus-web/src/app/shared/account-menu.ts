import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

/** Avatar button in the navigation with the signed-in account, "connect GitHub" and "sign out". */
@Component({
  selector: 'app-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    @if (auth.user(); as user) {
      <button
        class="icon-btn avatar-btn"
        type="button"
        (click)="open.set(!open())"
        [attr.aria-expanded]="open()"
        aria-haspopup="true"
        [attr.aria-label]="'Account: ' + user.name"
        [title]="user.name"
      >
        @if (user.avatarUrl) {
          <img [src]="user.avatarUrl" alt="" width="30" height="30" referrerpolicy="no-referrer" />
        } @else {
          <span class="initial">{{ initial() }}</span>
        }
      </button>

      @if (open()) {
        <div
          class="menu glass"
          role="menu"
          animate.enter="enter-fade-up"
          animate.leave="leave-fade"
        >
          <div class="who">
            <strong>{{ user.name }}</strong>
            @if (user.email) {
              <span class="muted">{{ user.email }}</span>
            }
            @if (user.gitHubLogin) {
              <span class="muted">GitHub: {{ user.gitHubLogin }}</span>
            }
          </div>
          @if (auth.providers().gitHub && !user.gitHubLogin) {
            <button class="item" type="button" role="menuitem" (click)="connectGitHub()">
              🔗 Connect GitHub
            </button>
          }
          <button class="item" type="button" role="menuitem" (click)="auth.logout()">
            👋 Sign out
          </button>
        </div>
      }
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }
    .avatar-btn {
      overflow: hidden;
      padding: 0;
    }
    img {
      width: 30px;
      height: 30px;
      border-radius: 50%;
    }
    .initial {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      color: #fff;
      font: 700 15px var(--font-display);
      background: var(--accent-grad);
    }
    .menu {
      position: absolute;
      z-index: 30;
      left: calc(100% + 18px);
      bottom: 0;
      min-width: 230px;
      padding: 8px;
      background: var(--surface-strong);
    }
    .who {
      display: grid;
      gap: 2px;
      padding: 8px 10px 10px;
      margin-bottom: 4px;
      border-bottom: 1px solid var(--surface-border);
      font-size: 14px;
      overflow-wrap: anywhere;
    }
    .muted {
      font-size: 13px;
    }
    .item {
      display: block;
      width: 100%;
      padding: 9px 10px;
      border: 0;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--text);
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      &:hover {
        background: var(--surface-hover);
      }
    }
    @media (max-width: 760px) {
      .menu {
        left: auto;
        right: 0;
        bottom: calc(100% + 18px);
      }
    }
  `,
})
export class AccountMenu {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly initial = computed(() =>
    (this.auth.user()?.name.trim()[0] ?? '?').toUpperCase(),
  );

  constructor() {
    void this.auth.loadProviders();
  }

  protected connectGitHub(): void {
    this.auth.signInWithGitHub(this.router.url);
  }

  protected onDocumentClick(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
