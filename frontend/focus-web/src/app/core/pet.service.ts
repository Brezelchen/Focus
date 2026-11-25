import { Injectable, computed, signal } from '@angular/core';

export type PetKind = 'dog' | 'cat';
const STORAGE_KEY = 'focus.pet';

/** The companion shown on Today, in the morning ritual and in Focus Mode. Remembered per browser. */
@Injectable({ providedIn: 'root' })
export class PetService {
  readonly kind = signal<PetKind>(read());
  readonly icon = computed(() => (this.kind() === 'cat' ? '🐱' : '🐶'));
  /** "pup" / "kitty", for friendly copy. */
  readonly nickname = computed(() => (this.kind() === 'cat' ? 'kitty' : 'pup'));

  toggle(): void {
    this.kind.set(this.kind() === 'dog' ? 'cat' : 'dog');
    try {
      localStorage.setItem(STORAGE_KEY, this.kind());
    } catch {
      /* storage unavailable: keep the in-memory choice */
    }
  }
}

function read(): PetKind {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'cat' ? 'cat' : 'dog';
  } catch {
    return 'dog';
  }
}
