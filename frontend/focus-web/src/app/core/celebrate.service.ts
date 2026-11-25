import { Injectable, inject } from '@angular/core';
import confetti from 'canvas-confetti';
import { AmbienceService } from '../features/focus-mode/audio/ambience.service';

const COLORS = ['#ff9a9e', '#fad0c4', '#a18cd1', '#fbc2eb', '#84fab0', '#8fd3f4', '#ffd36e'];

/** Little moments of delight: confetti + a soft sound. Confetti is skipped for reduced-motion users. */
@Injectable({ providedIn: 'root' })
export class CelebrateService {
  private readonly ambience = inject(AmbienceService);

  /** Small burst where a task was checked off. */
  taskDone(origin?: { x: number; y: number }): void {
    this.ambience.playPop();
    const x = origin ? origin.x / window.innerWidth : 0.5;
    const y = origin ? origin.y / window.innerHeight : 0.5;
    void confetti({
      particleCount: 36,
      spread: 60,
      startVelocity: 26,
      gravity: 0.9,
      scalar: 0.8,
      ticks: 120,
      origin: { x, y },
      colors: COLORS,
      disableForReducedMotion: true,
    });
  }

  /** Big celebration: the day hit 100% or a focus session finished. */
  big(): void {
    const fire = (angle: number, x: number) =>
      confetti({
        particleCount: 90,
        angle,
        spread: 70,
        startVelocity: 55,
        origin: { x, y: 0.75 },
        colors: COLORS,
        shapes: ['circle', 'square', 'star'],
        disableForReducedMotion: true,
      });
    void fire(60, 0);
    void fire(120, 1);
    setTimeout(() => void confetti({ particleCount: 120, spread: 110, origin: { y: 0.4 }, colors: COLORS, disableForReducedMotion: true }), 250);
  }
}
