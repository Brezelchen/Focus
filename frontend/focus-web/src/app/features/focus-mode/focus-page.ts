import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup, moveItemInArray } from '@angular/cdk/drag-drop';
import { Dialog } from '@angular/cdk/dialog';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { CelebrateService } from '../../core/celebrate.service';
import { Task } from '../../core/models';
import { PlannerStore } from '../../core/planner.store';
import { PetService } from '../../core/pet.service';
import { ThemeService } from '../../core/theme.service';
import { AMBIENCE_CHANNELS, AmbienceChannel, AmbienceService } from './audio/ambience.service';
import { LofiScene } from './lofi-scene/lofi-scene';

type Phase = 'setup' | 'running' | 'paused' | 'finished';

const PRESETS = [15, 25, 45, 60];
const DURATION_KEY = 'focus.duration';

interface Summary {
  status: 'completed' | 'endedEarly';
  focusedSeconds: number;
  done: string[];
  total: number;
}

/**
 * Full-screen Focus Mode: the cozy lofi scene, a tray of tasks to work on, a timer and ambient sound.
 * Each run is recorded as a focus session for the stats.
 */
@Component({
  selector: 'app-focus-page',
  imports: [LofiScene, CdkDropListGroup, CdkDropList, CdkDrag],
  templateUrl: './focus-page.html',
  styleUrl: './focus-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class FocusPage {
  protected readonly store = inject(PlannerStore);
  protected readonly ambience = inject(AmbienceService);
  protected readonly theme = inject(ThemeService);
  protected readonly pet = inject(PetService);
  private readonly api = inject(Api);
  private readonly celebrateService = inject(CelebrateService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = inject(Dialog);

  protected readonly presets = PRESETS;
  protected readonly channels = AMBIENCE_CHANNELS;

  protected readonly phase = signal<Phase>('setup');
  protected readonly minutes = signal(readDuration());
  protected readonly customOpen = signal(false);
  protected readonly mixerOpen = signal(false);
  protected readonly drawerOpen = signal(false);
  protected readonly celebrating = signal(false);
  protected readonly fullscreen = signal(!!this.document.fullscreenElement);
  protected readonly summary = signal<Summary | null>(null);

  private readonly now = signal(Date.now());
  private endsAt = 0;
  private readonly pausedRemaining = signal(0);
  private sessionId: number | null = null;
  private sessionTaskTitles = new Map<number, string>();
  private readonly completedIds = signal(new Set<number>());
  private ticker: ReturnType<typeof setInterval> | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private celebrateTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly originalTitle = this.title.getTitle();

  /** Tasks in the tray (open ones from the planner + ones finished during this session). */
  protected readonly trayTasks = computed(() => this.store.focusTasks());
  protected readonly doneInSession = computed(() => [...this.completedIds()].map((id) => this.sessionTaskTitles.get(id) ?? ''));

  /** Today's open tasks that aren't in the tray yet. */
  protected readonly available = computed(() => {
    const inTray = new Set(this.store.focusIds());
    return this.store.openTasks().filter((t) => !inTray.has(t.id));
  });

  protected readonly remainingMs = computed(() => {
    switch (this.phase()) {
      case 'running':
        return Math.max(0, this.endsAt - this.now());
      case 'paused':
        return this.pausedRemaining();
      default:
        return this.minutes() * 60_000;
    }
  });
  protected readonly clock = computed(() => {
    const total = Math.ceil(this.remainingMs() / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0');
    return `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
  });
  protected readonly progress = computed(() => 1 - this.remainingMs() / (this.minutes() * 60_000));
  protected readonly active = computed(() => this.phase() === 'running' || this.phase() === 'paused');
  protected readonly allDone = computed(
    () => this.active() && this.trayTasks().length === 0 && this.completedIds().size > 0,
  );

  constructor() {
    // Make sure today's list is loaded (Focus Mode can be opened directly).
    if (!this.store.isToday()) void this.store.selectDate(this.store.today());

    effect(() => {
      this.title.setTitle(this.active() ? `${this.clock()} · ${this.phase() === 'paused' ? 'Paused' : 'Focusing'}` : 'Focus mode · Focus');
    });

    effect(() => {
      if (this.phase() === 'running' && this.remainingMs() <= 0) void this.finish('completed');
    });

    const onFullscreen = () => this.fullscreen.set(!!this.document.fullscreenElement);
    const onVisibility = () => {
      if (this.document.visibilityState === 'visible' && this.phase() === 'running') void this.lockScreen();
    };
    this.document.addEventListener('fullscreenchange', onFullscreen);
    this.document.addEventListener('visibilitychange', onVisibility);

    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('fullscreenchange', onFullscreen);
      this.document.removeEventListener('visibilitychange', onVisibility);
      if (this.active() && this.sessionId !== null) {
        // Leaving mid-session counts as ending early.
        this.api.finishSession(this.sessionId, 'endedEarly', this.focusedSeconds()).subscribe({ error: () => undefined });
      }
      this.stopTicker();
      this.ambience.stop();
      void this.releaseScreen();
      if (this.document.fullscreenElement) void this.document.exitFullscreen().catch(() => undefined);
      if (this.celebrateTimer) clearTimeout(this.celebrateTimer);
      this.title.setTitle(this.originalTitle);
    });
  }

  // ---- Timer --------------------------------------------------------------------------------

  protected setMinutes(value: number): void {
    const m = Math.round(Math.min(Math.max(value || 0, 1), 240));
    this.minutes.set(m);
    try {
      localStorage.setItem(DURATION_KEY, String(m));
    } catch {
      /* ignore */
    }
  }

  protected async start(): Promise<void> {
    // Start audio first, synchronously within the click, so the browser allows it.
    if (!this.ambience.playing()) void this.ambience.start();

    this.completedIds.set(new Set());
    this.summary.set(null);
    this.endsAt = Date.now() + this.minutes() * 60_000;
    this.now.set(Date.now());
    this.phase.set('running');
    this.startTicker();
    void this.lockScreen();

    const tasks = await this.store.prepareFocusTasks();
    this.sessionTaskTitles = new Map(tasks.map((t) => [t.id, t.title]));
    try {
      const session = await firstValueFrom(this.api.startSession(tasks.map((t) => t.id), this.minutes()));
      this.sessionId = session.id;
    } catch {
      this.sessionId = null; // the timer still works; this session just won't show in the stats
    }
  }

  protected pause(): void {
    if (this.phase() !== 'running') return;
    this.pausedRemaining.set(Math.max(0, this.endsAt - Date.now()));
    this.phase.set('paused');
    this.stopTicker();
    void this.releaseScreen();
  }

  protected resume(): void {
    if (this.phase() !== 'paused') return;
    this.endsAt = Date.now() + this.pausedRemaining();
    this.now.set(Date.now());
    this.phase.set('running');
    this.startTicker();
    void this.lockScreen();
  }

  protected async finish(status: 'completed' | 'endedEarly'): Promise<void> {
    if (!this.active()) return;
    const focusedSeconds = this.focusedSeconds();
    if (this.phase() === 'running') this.pausedRemaining.set(Math.max(0, this.endsAt - Date.now()));
    this.phase.set('finished');
    this.stopTicker();
    void this.releaseScreen();

    this.summary.set({
      status,
      focusedSeconds,
      done: this.doneInSession(),
      total: this.completedIds().size + this.trayTasks().length,
    });

    if (status === 'completed' || this.completedIds().size > 0) {
      this.ambience.playChime();
      this.celebrate(6000);
      this.celebrateService.big();
    }

    if (this.sessionId !== null) {
      const id = this.sessionId;
      this.sessionId = null;
      await firstValueFrom(this.api.finishSession(id, status, focusedSeconds)).catch(() => undefined);
    }
  }

  protected again(): void {
    this.summary.set(null);
    this.phase.set('setup');
  }

  protected exit(): void {
    void this.router.navigate(['/']);
  }

  private focusedSeconds(): number {
    const remaining = this.phase() === 'running' ? Math.max(0, this.endsAt - Date.now()) : this.pausedRemaining();
    return Math.round((this.minutes() * 60_000 - remaining) / 1000);
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = setInterval(() => this.now.set(Date.now()), 250);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  // ---- Tasks --------------------------------------------------------------------------------

  protected async completeTask(task: Task, event: MouseEvent): Promise<void> {
    this.sessionTaskTitles.set(task.id, task.title);
    this.completedIds.update((s) => new Set(s).add(task.id));
    this.store.removeFromFocus(task.id);
    this.celebrate(3500);
    await this.store.complete(task, { x: event.clientX, y: event.clientY });
  }

  protected stepsDone(task: Task): number {
    return task.subtasks.filter((s) => s.isDone).length;
  }

  protected addTask(task: Task): void {
    this.store.addToFocus(task.id);
    this.sessionTaskTitles.set(task.id, task.title);
  }

  protected onTrayDrop(event: CdkDragDrop<any, any, Task>): void {
    if (event.previousContainer === event.container) {
      const ids = [...this.store.focusIds()];
      const visible = this.trayTasks().map((t) => t.id);
      const from = ids.indexOf(visible[event.previousIndex]);
      const to = ids.indexOf(visible[event.currentIndex]);
      if (from >= 0 && to >= 0) {
        moveItemInArray(ids, from, to);
        this.store.focusIds.set(ids);
      }
      return;
    }
    this.store.addToFocus(event.item.data.id, event.currentIndex);
    this.sessionTaskTitles.set(event.item.data.id, event.item.data.title);
  }

  private celebrate(ms: number): void {
    this.celebrating.set(true);
    if (this.celebrateTimer) clearTimeout(this.celebrateTimer);
    this.celebrateTimer = setTimeout(() => this.celebrating.set(false), ms);
  }

  // ---- Sound, screen, keyboard --------------------------------------------------------------

  protected setVolume(channel: AmbienceChannel, event: Event): void {
    this.ambience.setVolume(channel, Number((event.target as HTMLInputElement).value) / 100);
  }

  protected toggleFullscreen(): void {
    if (this.document.fullscreenElement) void this.document.exitFullscreen();
    else void this.document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  private async lockScreen(): Promise<void> {
    try {
      this.wakeLock ??= (await navigator.wakeLock?.request('screen')) ?? null;
      this.wakeLock?.addEventListener('release', () => (this.wakeLock = null), { once: true });
    } catch {
      this.wakeLock = null; // not supported or not allowed — fine
    }
  }

  private async releaseScreen(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    await lock?.release().catch(() => undefined);
  }

  protected onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, [role="slider"]') || this.dialog.openDialogs.length) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (this.phase() === 'running') this.pause();
      else if (this.phase() === 'paused') this.resume();
    } else if (e.key === 'f') {
      this.toggleFullscreen();
    } else if (e.key === 'm') {
      void this.ambience.toggle();
    }
  }

  protected formatFocused(seconds: number): string {
    const m = Math.floor(seconds / 60);
    return m >= 1 ? `${m} min` : `${seconds} sec`;
  }

  protected numberValue(e: Event): number {
    return Number((e.target as HTMLInputElement).value);
  }
}

function readDuration(): number {
  try {
    const v = Number(localStorage.getItem(DURATION_KEY));
    return v >= 1 && v <= 240 ? v : 25;
  } catch {
    return 25;
  }
}
