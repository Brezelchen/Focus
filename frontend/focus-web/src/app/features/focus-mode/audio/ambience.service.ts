import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';
import { BrownLayer, FireLayer, RainLayer } from './ambient-layers';
import { AmbienceLayer, NoiseBank, createImpulseResponse, createNoiseBank, midiToHz } from './audio-utils';
import { LofiMusic } from './lofi-music';

export type AmbienceChannel = 'music' | 'rain' | 'fire' | 'brown';

export const AMBIENCE_CHANNELS: { id: AmbienceChannel; label: string; icon: string }[] = [
  { id: 'music', label: 'Lofi beats', icon: '🎵' },
  { id: 'rain', label: 'Rain', icon: '🌧️' },
  { id: 'fire', label: 'Fireplace', icon: '🔥' },
  { id: 'brown', label: 'Soft noise', icon: '🌊' },
];

const STORAGE_KEY = 'focus.ambience.volumes';
const DEFAULT_VOLUMES: Record<AmbienceChannel, number> = { music: 0.5, rain: 0.35, fire: 0, brown: 0 };
const CHANNEL_IDS: readonly AmbienceChannel[] = ['music', 'rain', 'fire', 'brown'];

/** Per-channel trim so equal slider positions feel equally loud. */
const CHANNEL_TRIM: Record<AmbienceChannel, number> = { music: 0.7, rain: 0.45, fire: 0.6, brown: 0.55 };
const MASTER_LEVEL = 0.8;
const FADE_IN = 1.5;
const FADE_OUT = 1;
const VOLUME_RAMP = 0.2;

/** Scheduler period and how far ahead of the audio clock events are scheduled. */
const TICK_MS = 25;
const LOOKAHEAD = 0.1;
/** Background tabs throttle timers to ~1 Hz, so look much further ahead there. */
const HIDDEN_LOOKAHEAD = 1.5;

type AudioContextCtor = typeof AudioContext;

/** Everything that exists only once Web Audio has been initialised. */
interface Engine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  /** One-shot effects bus: bypasses the master fade so chimes work while ambience is stopped. */
  readonly sfx: GainNode;
  readonly sfxReverb: GainNode;
  readonly noise: NoiseBank;
  readonly channelGains: Record<AmbienceChannel, GainNode>;
  readonly layers: Record<AmbienceChannel, AmbienceLayer>;
  readonly active: Record<AmbienceChannel, boolean>;
}

/**
 * Procedurally generated ambience (rain, fireplace, brown noise) and a generative
 * lofi music loop for Focus Mode, plus small UI sound effects. No audio files.
 *
 * Graph: layer → channel gain → master gain ─┐
 *                                 sfx bus ───┴→ gentle compressor → destination
 *
 * The AudioContext is created lazily on the first `start()` or `playChime()` call. Browsers require `start()` to be triggered by a user gesture.
 * When Web Audio is unavailable (SSR, tests, old browsers) every method is a no-op.
 */
@Injectable({ providedIn: 'root' })
export class AmbienceService {
  private readonly _volumes = signal<Record<AmbienceChannel, number>>(loadVolumes());
  private readonly _playing = signal(false);

  /** Current 0..1 volume per channel (persisted). */
  readonly volumes: Signal<Record<AmbienceChannel, number>> = this._volumes.asReadonly();
  /** Whether ambience is currently playing (true from `start()` until `stop()`). */
  readonly playing: Signal<boolean> = this._playing.asReadonly();

  private engine: Engine | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Bumped on every start/stop so a stale delayed stop can be ignored. */
  private generation = 0;
  /** Audio-clock time until which a one-shot effect is still ringing. */
  private sfxBusyUntil = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stopScheduler();
      void this.engine?.ctx.close().catch(() => undefined);
      this.engine = null;
    });
  }

  setVolume(channel: AmbienceChannel, value: number): void {
    const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
    this._volumes.update((vols) => ({ ...vols, [channel]: v }));
    saveVolumes(this._volumes());

    const engine = this.engine;
    if (!engine) return;
    const now = engine.ctx.currentTime;
    rampTo(engine.channelGains[channel].gain, channelGain(channel, v), now, VOLUME_RAMP);
    if (this._playing()) this.syncLayer(engine, channel, now);
  }

  async start(): Promise<void> {
    if (this._playing()) return;
    const engine = this.ensureEngine();
    if (!engine) return;
    this.generation++;
    this._playing.set(true);

    try {
      if (engine.ctx.state !== 'running') await engine.ctx.resume();
    } catch {
      // Autoplay policy rejected the resume (no user gesture) – stay silent but consistent.
    }
    if (!this._playing()) return; // stop() was called while resuming

    const now = engine.ctx.currentTime;
    rampTo(engine.master.gain, MASTER_LEVEL, now, FADE_IN);
    for (const ch of CHANNEL_IDS) this.syncLayer(engine, ch, now);
    this.startScheduler();
  }

  stop(): void {
    if (!this._playing()) return;
    this._playing.set(false);
    const engine = this.engine;
    if (!engine) return;

    const gen = ++this.generation;
    rampTo(engine.master.gain, 0, engine.ctx.currentTime, FADE_OUT);
    setTimeout(() => {
      if (gen !== this.generation || this._playing()) return;
      this.stopScheduler();
      const now = engine.ctx.currentTime;
      for (const ch of CHANNEL_IDS) this.syncLayer(engine, ch, now);
      this.maybeSuspend(engine);
    }, FADE_OUT * 1000 + 100);
  }

  toggle(): Promise<void> {
    if (this._playing()) {
      this.stop();
      return Promise.resolve();
    }
    return this.start();
  }

  /** Soft marimba/bell arpeggio (Fmaj9 rising) for "timer finished", ~2.5 s. */
  playChime(): void {
    this.withSfx((engine, t) => {
      const notes = [65, 69, 72, 76, 79]; // F4 A4 C5 E5 G5
      notes.forEach((midi, i) => this.bell(engine, midi, t + i * 0.16, i === notes.length - 1 ? 2.2 : 1.6));
      return 3.2;
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Bell/marimba voice: a sine fundamental plus a quickly decaying partial at
   * ~3.9× (the characteristic marimba overtone) and a faint octave.
   */
  private bell(engine: Engine, midi: number, t: number, decay: number, level = 0.2): void {
    const { ctx } = engine;
    const f = midiToHz(midi);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    env.connect(engine.sfx);
    env.connect(engine.sfxReverb);

    const partials: [number, number, number][] = [
      // [frequency ratio, relative gain, decay fraction]
      [1, 1, 1],
      [2, 0.12, 0.5],
      [3.9, 0.18, 0.12],
    ];
    let last: OscillatorNode | null = null;
    for (const [ratio, gain, frac] of partials) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.03, decay * frac));
      osc.connect(g).connect(env);
      osc.start(t);
      osc.stop(t + decay + 0.05);
      last = osc;
    }
    if (last) last.onended = () => env.disconnect();
  }

  /**
   * Runs a one-shot effect, resuming the context if needed. If ambience is not
   * playing, the context is suspended again once the effect has rung out.
   * `play` returns the effect's duration in seconds.
   */
  private withSfx(play: (engine: Engine, time: number) => number): void {
    const engine = this.ensureEngine();
    if (!engine) return;
    const run = () => {
      const now = engine.ctx.currentTime;
      const duration = play(engine, now + 0.01);
      this.sfxBusyUntil = Math.max(this.sfxBusyUntil, now + duration);
      if (!this._playing()) setTimeout(() => this.maybeSuspend(engine), duration * 1000);
    };
    if (engine.ctx.state === 'running') {
      run();
    } else {
      engine.ctx.resume().then(run, () => undefined);
    }
  }

  /** Suspends the context (zero CPU) unless ambience is playing or an effect is still ringing. */
  private maybeSuspend(engine: Engine): void {
    if (this._playing() || this.engine !== engine || engine.ctx.state !== 'running') return;
    const remaining = this.sfxBusyUntil - engine.ctx.currentTime;
    if (remaining > 0) {
      setTimeout(() => this.maybeSuspend(engine), remaining * 1000 + 50);
      return;
    }
    void engine.ctx.suspend().catch(() => undefined);
  }

  /** Starts or tears down a layer so silent channels cost no CPU. */
  private syncLayer(engine: Engine, channel: AmbienceChannel, now: number): void {
    const shouldRun = this._playing() && this._volumes()[channel] > 0;
    if (shouldRun === engine.active[channel]) return;
    engine.active[channel] = shouldRun;
    // When turning off, the layer stops its sources slightly later (after the gain ramp).
    engine.layers[channel].setActive(shouldRun, now);
  }

  private startScheduler(): void {
    if (this.timer !== null) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopScheduler(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Lookahead scheduler: each active layer schedules events in [now, now + lookahead). */
  private tick(): void {
    const engine = this.engine;
    if (!engine || engine.ctx.state !== 'running') return;
    const now = engine.ctx.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const horizon = now + (hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
    for (const ch of CHANNEL_IDS) {
      if (engine.active[ch]) engine.layers[ch].tick(now, horizon);
    }
  }

  /** Lazily builds the audio graph. Returns null when Web Audio is unavailable. */
  private ensureEngine(): Engine | null {
    if (this.engine) return this.engine;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;

    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'playback' });
    } catch {
      return null;
    }

    // Gentle glue compression – mostly a safety net against stacked transients.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp);

    const sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(comp);
    const reverb = ctx.createConvolver();
    reverb.buffer = createImpulseResponse(ctx, 2.5, 2.5);
    const sfxReverb = ctx.createGain();
    sfxReverb.gain.value = 0.35;
    sfxReverb.connect(reverb).connect(sfx);

    const noise = createNoiseBank(ctx);
    const vols = this._volumes();
    const channelGains = {} as Record<AmbienceChannel, GainNode>;
    for (const ch of CHANNEL_IDS) {
      const g = ctx.createGain();
      g.gain.value = channelGain(ch, vols[ch]);
      g.connect(master);
      channelGains[ch] = g;
    }

    this.engine = {
      ctx, master, sfx, sfxReverb, noise, channelGains,
      layers: {
        music: new LofiMusic(ctx, noise, channelGains.music),
        rain: new RainLayer(ctx, noise, channelGains.rain),
        fire: new FireLayer(ctx, noise, channelGains.fire),
        brown: new BrownLayer(ctx, noise, channelGains.brown),
      },
      active: { music: false, rain: false, fire: false, brown: false },
    };
    return this.engine;
  }
}

/** Slider value → gain. Squaring gives a more natural (roughly perceptual) taper. */
function channelGain(channel: AmbienceChannel, volume: number): number {
  return volume * volume * CHANNEL_TRIM[channel];
}

/** Smoothly ramps a param from its current value, cancelling pending automation. */
function rampTo(param: AudioParam, value: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function loadVolumes(): Record<AmbienceChannel, number> {
  const result = { ...DEFAULT_VOLUMES };
  try {
    if (typeof localStorage === 'undefined') return result;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return result;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return result;
    for (const ch of CHANNEL_IDS) {
      const v = (parsed as Record<string, unknown>)[ch];
      if (typeof v === 'number' && Number.isFinite(v)) result[ch] = Math.min(1, Math.max(0, v));
    }
  } catch {
    // Corrupt or inaccessible storage – use defaults.
  }
  return result;
}

function saveVolumes(volumes: Record<AmbienceChannel, number>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(volumes));
  } catch {
    // Storage full / blocked – volumes simply won't persist.
  }
}
