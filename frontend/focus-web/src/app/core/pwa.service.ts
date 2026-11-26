import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ToastService } from './toast.service';

/** The non-standard event Chromium fires when the app can be installed. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Installable-app plumbing: online/offline state, the install prompt, and service-worker updates.
 * The service worker itself (only in production builds) caches the app shell and recent API reads
 * (see ngsw-config.json), so the last-seen data still shows when the server or network is away.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly document = inject(DOCUMENT);
  private readonly toast = inject(ToastService);
  private readonly updates = inject(SwUpdate);
  private readonly window = this.document.defaultView;

  /** Browser network state. The server can still be unreachable while this is true. */
  readonly online = signal(this.window?.navigator.onLine ?? true);
  /** True when the browser offers to install the app (Chromium-based browsers). */
  readonly canInstall = signal(false);
  /** Running as an installed app window. */
  readonly installed = signal(this.window?.matchMedia?.('(display-mode: standalone)').matches ?? false);

  private installEvent: BeforeInstallPromptEvent | null = null;

  constructor() {
    const win = this.window;
    if (!win) return;

    const onOnline = () => this.online.set(true);
    const onOffline = () => this.online.set(false);
    const onInstallable = (e: Event) => {
      e.preventDefault(); // keep the browser's mini-infobar quiet; we offer our own button
      this.installEvent = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    };
    const onInstalled = () => {
      this.installEvent = null;
      this.canInstall.set(false);
      this.installed.set(true);
      this.toast.show('Focus is installed. Find it with your other apps ✨', 'success');
    };
    win.addEventListener('online', onOnline);
    win.addEventListener('offline', onOffline);
    win.addEventListener('beforeinstallprompt', onInstallable);
    win.addEventListener('appinstalled', onInstalled);

    if (this.updates.isEnabled) {
      const sub = this.updates.versionUpdates.subscribe((e) => {
        if (e.type === 'VERSION_READY') {
          this.toast.show('A new version of Focus is ready.', 'info', { label: 'Reload', run: () => win.location.reload() }, 60_000);
        }
      });
      const broken = this.updates.unrecoverable.subscribe(() => {
        this.toast.show('Focus needs a reload to keep working offline.', 'error', { label: 'Reload', run: () => win.location.reload() }, 60_000);
      });
      // Look for updates when the app comes back to the foreground (installed apps stay open for days).
      const onVisible = () => {
        if (this.document.visibilityState === 'visible') void this.updates.checkForUpdate().catch(() => undefined);
      };
      this.document.addEventListener('visibilitychange', onVisible);
      inject(DestroyRef).onDestroy(() => {
        sub.unsubscribe();
        broken.unsubscribe();
        this.document.removeEventListener('visibilitychange', onVisible);
      });
    }

    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('online', onOnline);
      win.removeEventListener('offline', onOffline);
      win.removeEventListener('beforeinstallprompt', onInstallable);
      win.removeEventListener('appinstalled', onInstalled);
    });
  }

  async install(): Promise<void> {
    const event = this.installEvent;
    if (!event) return;
    // A prompt event can only be used once; if the user dismisses it the browser offers a new one later.
    this.installEvent = null;
    this.canInstall.set(false);
    await event.prompt();
    await event.userChoice;
  }
}
