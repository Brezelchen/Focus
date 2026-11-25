/**
 * Shared DSP helpers for the Focus Mode ambience engine.
 *
 * Everything here is pure Web Audio: noise buffers are generated once per
 * AudioContext, and short one-shot events (droplets, crackles, drum hits) are
 * built from tiny throw-away node graphs scheduled at sample-accurate times.
 */

/** Pre-rendered looping noise buffers shared by every layer. */
export interface NoiseBank {
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  readonly brown: AudioBuffer;
}

/**
 * A sound layer driven by the service's lookahead scheduler.
 * `tick` is only called while the layer is active, so inactive layers cost nothing.
 */
export interface AmbienceLayer {
  /** Start (true) or tear down (false) the layer's continuous sources at `time`. */
  setActive(active: boolean, time: number): void;
  /** Schedule any discrete events that fall in [now, horizon). */
  tick(now: number, horizon: number): void;
}

export type NoiseColor = 'white' | 'pink' | 'brown';

const NOISE_SECONDS = 4;
/** Length of the crossfade that hides the loop seam. */
const SEAM_SECONDS = 0.15;

/** Converts a MIDI note number to Hz (A4 = 69 = 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Uniform random number in [min, max). */
export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Picks a random element of a non-empty array. */
export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Generates `NOISE_SECONDS` of mono noise of the given colour that loops seamlessly.
 *
 * - white: independent uniform samples.
 * - pink: Paul Kellet's "economy" 1/f filter bank (−3 dB/oct).
 * - brown: leaky integrator of white noise (−6 dB/oct), normalised afterwards.
 *
 * To make the loop click-free we render `SEAM_SECONDS` extra samples and crossfade
 * them into the start, so the last sample flows straight into the first.
 */
export function createNoiseBuffer(ctx: BaseAudioContext, color: NoiseColor): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const seam = Math.floor(ctx.sampleRate * SEAM_SECONDS);
  const raw = new Float32Array(length + seam);

  let b0 = 0, b1 = 0, b2 = 0; // pink filter state
  let last = 0; // brown integrator state
  for (let i = 0; i < raw.length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === 'white') {
      raw[i] = white;
    } else if (color === 'pink') {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      raw[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    } else {
      last = (last + 0.02 * white) / 1.02;
      raw[i] = last;
    }
  }

  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const out = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) out[i] = raw[i];
  // Crossfade the overflow tail into the head: out[0] continues from out[length-1].
  for (let i = 0; i < seam; i++) {
    const t = i / seam;
    out[i] = raw[i] * t + raw[length + i] * (1 - t);
  }
  normalize(out, color === 'white' ? 0.9 : 0.8);
  return buffer;
}

/** Scales samples so the peak equals `peak` (brown noise wanders, so this matters). */
function normalize(data: Float32Array, peak: number): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max === 0) return;
  const k = peak / max;
  for (let i = 0; i < data.length; i++) data[i] *= k;
}

export function createNoiseBank(ctx: BaseAudioContext): NoiseBank {
  return {
    white: createNoiseBuffer(ctx, 'white'),
    pink: createNoiseBuffer(ctx, 'pink'),
    brown: createNoiseBuffer(ctx, 'brown'),
  };
}

/**
 * Builds a stereo reverb impulse response: exponentially decaying noise with a
 * gentle low-pass (a one-pole smoother whose cutoff drops over time), which
 * gives a warm, dark room rather than a bright metallic tail.
 */
export function createImpulseResponse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Smoothing coefficient grows over time -> high frequencies die out first.
      const k = 0.55 + 0.4 * t;
      smooth = smooth * k + (Math.random() * 2 - 1) * (1 - k);
      data[i] = smooth * Math.pow(1 - t, decay) * 2;
    }
  }
  return ir;
}

/** Starts a looping buffer source at a random offset (decorrelates repeated buffers). */
export function startLoop(ctx: BaseAudioContext, buffer: AudioBuffer, dest: AudioNode, time: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(dest);
  src.start(time, Math.random() * buffer.duration);
  return src;
}

/** Starts a sine LFO feeding `param` with ±`depth` around the param's own value. */
export function startLfo(ctx: BaseAudioContext, param: AudioParam, freq: number, depth: number, time: number): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  osc.connect(amount).connect(param);
  osc.start(time);
  osc.onended = () => amount.disconnect();
  return osc;
}

export interface NoiseBurstOptions {
  readonly buffer: AudioBuffer;
  readonly dest: AudioNode;
  readonly time: number;
  /** Seconds until the envelope reaches silence. */
  readonly duration: number;
  readonly gain: number;
  readonly filter: BiquadFilterType;
  readonly frequency: number;
  readonly q?: number;
  readonly attack?: number;
}

/**
 * A short filtered noise "tick": the building block for rain droplets, fire
 * crackles, vinyl pops and hats. Reads a random slice of a shared noise buffer
 * so no per-event buffer allocation is needed.
 */
export function noiseBurst(ctx: BaseAudioContext, o: NoiseBurstOptions): void {
  const src = ctx.createBufferSource();
  src.buffer = o.buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = o.filter;
  filter.frequency.value = o.frequency;
  filter.Q.value = o.q ?? 0.7;
  const env = ctx.createGain();
  const attack = o.attack ?? 0.001;
  env.gain.setValueAtTime(0, o.time);
  env.gain.linearRampToValueAtTime(o.gain, o.time + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, o.time + Math.max(attack + 0.002, o.duration));
  src.connect(filter).connect(env).connect(o.dest);
  const offset = Math.random() * (o.buffer.duration - o.duration - 0.05);
  src.start(o.time, Math.max(0, offset), o.duration + 0.02);
  src.onended = () => env.disconnect();
}

/**
 * Poisson-process event generator for the lookahead scheduler: fires `emit`
 * for every event time inside the scheduling window, with exponentially
 * distributed gaps (mean `meanInterval` seconds) so textures never sound looped.
 */
export class RandomEvents {
  private next = -1;

  constructor(
    private readonly meanInterval: number,
    private readonly emit: (time: number) => void,
  ) {}

  run(now: number, horizon: number): void {
    // After a pause the cursor is stale; restart it from "now".
    if (this.next < now) this.next = now + this.gap();
    while (this.next < horizon) {
      this.emit(this.next);
      this.next += this.gap();
    }
  }

  private gap(): number {
    return Math.max(0.005, -Math.log(1 - Math.random()) * this.meanInterval);
  }
}

/** Stops a set of continuous sources at `time` and forgets them. */
export function stopAll(nodes: AudioScheduledSourceNode[], time: number): void {
  for (const node of nodes) {
    try {
      node.stop(time);
    } catch {
      // Already stopped – nothing to do.
    }
  }
  nodes.length = 0;
}
