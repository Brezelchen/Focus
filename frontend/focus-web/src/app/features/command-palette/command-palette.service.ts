import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { Injectable, inject } from '@angular/core';
import type { CommandPalette } from './command-palette';

/**
 * Opens and closes the Ctrl+K command palette. Its code is a separate chunk, preloaded shortly after
 * startup so that opening is synchronous and no keystrokes typed right after Ctrl+K get lost.
 */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);
  private ref: DialogRef<unknown, CommandPalette> | null = null;
  private component: typeof CommandPalette | null = null;
  private loading: Promise<typeof CommandPalette> | null = null;

  /** Downloads the palette's code ahead of time. */
  preload(): Promise<typeof CommandPalette> {
    this.loading ??= import('./command-palette').then((m) => (this.component = m.CommandPalette));
    return this.loading;
  }

  open(): void {
    if (this.ref) return;
    if (!this.component) {
      void this.preload().then(() => this.open());
      return;
    }
    const ref = this.dialog.open(this.component, {
      ariaLabel: 'Command palette',
      panelClass: ['focus-dialog', 'palette-panel'],
      backdropClass: 'focus-backdrop',
      width: '620px',
      maxWidth: 'calc(100vw - 24px)',
      positionStrategy: this.overlay.position().global().centerHorizontally().top('12vh'),
    });
    this.ref = ref;
    ref.closed.subscribe(() => (this.ref = null));
  }

  close(): void {
    this.ref?.close();
  }

  toggle(): void {
    if (this.ref) this.close();
    else this.open();
  }
}
