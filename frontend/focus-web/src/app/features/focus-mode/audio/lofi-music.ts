import {
  AmbienceLayer, NoiseBank, RandomEvents, createImpulseResponse, midiToHz, noiseBurst, pick, rand, startLfo,
  startLoop, stopAll,
} from './audio-utils';

/** A chord: a bass root plus a rootless, jazzy upper-structure voicing (MIDI notes). */
interface Chord {
  readonly bass: number;
  readonly keys: readonly number[];
}

// Voicings are hand voice-led around middle C so consecutive chords move by small steps.
const CHORDS = {
  Fmaj9: { bass: 41, keys: [57, 60, 64, 67] }, // A C E G
  Em7: { bass: 40, keys: [55, 59, 62, 64] }, // G B D E
  Dm9: { bass: 38, keys: [53, 57, 60, 64] }, // F A C E
  Cmaj9: { bass: 36, keys: [52, 55, 59, 62] }, // E G B D
  G9: { bass: 43, keys: [53, 57, 59, 64] }, // F A B E (G13 colour)
  Am9: { bass: 45, keys: [55, 59, 60, 64] }, // G B C E
} satisfies Record<string, Chord>;

/** Four-bar loops; the music switches progression every two passes. */
const PROGRESSIONS: readonly (readonly Chord[])[] = [
  [CHORDS.Fmaj9, CHORDS.Em7, CHORDS.Dm9, CHORDS.Cmaj9], // IV – iii – ii – I
  [CHORDS.Dm9, CHORDS.G9, CHORDS.Cmaj9, CHORDS.Am9], // ii – V – I – vi
  [CHORDS.Fmaj9, CHORDS.G9, CHORDS.Em7, CHORDS.Am9], // IV – V – iii – vi
  [CHORDS.Am9, CHORDS.Dm9, CHORDS.Fmaj9, CHORDS.G9], // vi – ii – IV – V
];

/** Keys comping rhythms per bar: [16th-step, length in steps, velocity scale]. */
const COMP_PATTERNS: readonly (readonly [number, number, number][])[] = [
  [[0, 15, 1]],
  [[0, 9, 1], [10, 5, 0.7]],
  [[0, 6, 1], [6, 10, 0.75]],
  [[0, 3, 0.9], [3, 12, 0.8]],
];

/** Kick placements on the 16th grid (boom-bap feel). */
const KICK_PATTERNS: readonly (readonly number[])[] = [[0, 10], [0, 7, 10], [0, 3, 10], [0, 10, 11]];

const BPM = 74;
const STEPS_PER_BAR = 16;
/** Off-beat 16ths are delayed by this fraction of a step (≈ 64/36 swing). */
const SWING = 0.28;
const BARS_PER_PROGRESSION = 4;

/**
 * Generative lofi hip-hop loop.
 *
 * Signal flow:
 *   keys ─┬─ duck ─────────────┐
 *         └─ reverb (wet) ─────┤
 *   bass ──────────────────────┼─► tape low-pass (wobbling cutoff) ─► output
 *   drums ─────────────────────┘
 *   vinyl hiss + crackle ───────────────────────────────────────────► output
 *
 * Pitched voices get their `detune` modulated by a shared "wow & flutter" bus
 * for that slightly warped-cassette feel. Notes are scheduled by `tick()` from
 * the service's lookahead clock, one 16th step at a time.
 */
export class LofiMusic implements AmbienceLayer {
  private readonly keysIn: GainNode;
  private readonly duck: GainNode;
  private readonly bassIn: GainNode;
  private readonly drumsIn: GainNode;
  private readonly tape: BiquadFilterNode;
  private readonly vinyl: GainNode;
  /** Pitch wobble in cents; connected to every pitched oscillator's detune. */
  private readonly wobble: GainNode;
  private readonly continuous: AudioScheduledSourceNode[] = [];
  private readonly crackle: RandomEvents;

  private readonly stepDur = 60 / BPM / 4;
  private nextStepTime = 0;
  private step = 0;
  private bar = 0;
  private progression: readonly Chord[] = PROGRESSIONS[0];
  private kickPattern: readonly number[] = KICK_PATTERNS[0];
  private duckFreeAt = 0;

  constructor(private readonly ctx: BaseAudioContext, private readonly noise: NoiseBank, out: AudioNode) {
    // Tape: gentle 12 dB/oct low-pass around 2.6 kHz – the main "warmth" control.
    this.tape = ctx.createBiquadFilter();
    this.tape.type = 'lowpass';
    this.tape.frequency.value = 2600;
    this.tape.Q.value = 0.5;
    this.tape.connect(out);

    // Keys: extra darkening low-pass, then a sidechain-style duck driven by the kick.
    this.keysIn = ctx.createGain();
    this.keysIn.gain.value = 0.9;
    const keysTone = ctx.createBiquadFilter();
    keysTone.type = 'lowpass';
    keysTone.frequency.value = 1900;
    this.duck = ctx.createGain();
    this.keysIn.connect(keysTone).connect(this.duck).connect(this.tape);

    // Light, dark room reverb on the keys only.
    const reverb = ctx.createConvolver();
    reverb.buffer = createImpulseResponse(ctx, 2.4, 3);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    keysTone.connect(reverb).connect(wet).connect(this.tape);

    this.bassIn = ctx.createGain();
    const bassTone = ctx.createBiquadFilter();
    bassTone.type = 'lowpass';
    bassTone.frequency.value = 380;
    this.bassIn.connect(bassTone).connect(this.tape);

    this.drumsIn = ctx.createGain();
    this.drumsIn.gain.value = 0.85;
    this.drumsIn.connect(this.tape);

    // Vinyl bypasses the tape filter but is itself band-limited and very quiet.
    this.vinyl = ctx.createGain();
    this.vinyl.gain.value = 0.5;
    this.vinyl.connect(out);
    this.crackle = new RandomEvents(0.18, (t) =>
      noiseBurst(this.ctx, {
        buffer: this.noise.white, dest: this.vinyl, time: t, duration: rand(0.001, 0.004),
        gain: 0.02 + Math.pow(Math.random(), 4) * 0.12, filter: 'bandpass', frequency: rand(1500, 4000), q: 0.8,
      }),
    );

    this.wobble = ctx.createGain();
  }

  setActive(active: boolean, time: number): void {
    stopAll(this.continuous, active ? time : time + 0.4);
    if (!active) return;

    // Wow (slow, ±6 cents) + flutter (fast, ±1.5 cents) on pitch; slow sweep of the tape cutoff.
    this.continuous.push(
      this.lfoInto(this.wobble, 0.45, 6, time),
      this.lfoInto(this.wobble, 5.5, 1.5, time),
      startLfo(this.ctx, this.tape.frequency, 0.05, 300, time),
    );

    // Constant tape hiss: pink noise, high-passed, barely audible.
    const hissFilter = this.ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 3000;
    hissFilter.Q.value = 0.4;
    const hissGain = this.ctx.createGain();
    hissGain.gain.value = 0.025;
    hissFilter.connect(hissGain).connect(this.vinyl);
    const hiss = startLoop(this.ctx, this.noise.pink, hissFilter, time);
    hiss.onended = () => hissGain.disconnect();
    this.continuous.push(hiss);

    // Restart the arrangement from the top with a fresh progression.
    this.nextStepTime = time + 0.05;
    this.step = 0;
    this.bar = 0;
    this.progression = pick(PROGRESSIONS);
  }

  tick(now: number, horizon: number): void {
    // If the clock fell behind (e.g. throttled timer), skip ahead rather than burst-schedule.
    if (this.nextStepTime < now - 0.2) this.nextStepTime = now + 0.05;
    while (this.nextStepTime < horizon) {
      const swing = this.step % 2 === 1 ? SWING * this.stepDur : 0;
      this.scheduleStep(this.nextStepTime + swing);
      this.nextStepTime += this.stepDur;
      if (++this.step === STEPS_PER_BAR) {
        this.step = 0;
        this.bar++;
      }
    }
    this.crackle.run(now, horizon);
  }

  // ---------------------------------------------------------------------------
  // Arrangement
  // ---------------------------------------------------------------------------

  private scheduleStep(t: number): void {
    const step = this.step;
    const barInLoop = this.bar % BARS_PER_PROGRESSION;

    if (step === 0) {
      // New progression every two 4-bar loops.
      if (this.bar > 0 && this.bar % (BARS_PER_PROGRESSION * 2) === 0) this.progression = pick(PROGRESSIONS);
      this.kickPattern = pick(KICK_PATTERNS);
      this.scheduleBar(t, this.progression[barInLoop]);
    }

    // Two-bar drum break every 16 bars, and a keys-only first bar as an intro.
    const drumsOn = this.bar > 0 && this.bar % 16 < 14;
    if (!drumsOn) return;

    const v = () => rand(0.85, 1);
    if (this.kickPattern.includes(step)) this.kick(t, (step === 0 ? 1 : 0.8) * v());
    if (step === 4 || step === 12) this.snare(t, v());
    else if (step === 15 && Math.random() < 0.12) this.snare(t, 0.3);
    if (step % 2 === 0) this.hat(t, (step % 4 === 0 ? 0.8 : 1) * v(), step === 14 && Math.random() < 0.25);
    else if (Math.random() < 0.15) this.hat(t, 0.4, false);
  }

  /** Schedules keys, bass and an optional melody fragment for one bar starting at `t`. */
  private scheduleBar(t: number, chord: Chord): void {
    const stepTime = (s: number) => t + s * this.stepDur + (s % 2 === 1 ? SWING * this.stepDur : 0);
    const voicing = this.vary(chord.keys);

    for (const [s, len, vel] of pick(COMP_PATTERNS)) {
      voicing.forEach((midi, i) => {
        // Slight upward strum + humanised velocity.
        const strum = i * 0.014 + rand(0, 0.008);
        this.key(midi, stepTime(s) + strum, len * this.stepDur, 0.075 * vel * rand(0.85, 1));
      });
    }

    this.bassNote(chord.bass, stepTime(0), 6 * this.stepDur, 0.32);
    if (Math.random() < 0.6) {
      const second = pick([chord.bass, chord.bass + 7, chord.bass + 12]);
      this.bassNote(second, stepTime(10), 4 * this.stepDur, 0.24);
    }

    // Occasional sparse melody: 2–3 chord tones in the octave above middle C.
    if (this.bar > 1 && Math.random() < 0.35) {
      const pool = [...new Set(voicing.map((n) => 72 + (((n % 12) + 12) % 12)))];
      const steps = [2, 4, 6, 8, 10, 12, 14].filter(() => Math.random() < 0.35).slice(0, 3);
      for (const s of steps) this.key(pick(pool), stepTime(s), 2 * this.stepDur, 0.06, true);
    }
  }

  /** Random inversions keep repeated chords from sounding identical. */
  private vary(keys: readonly number[]): number[] {
    const v = [...keys];
    const r = Math.random();
    if (r < 0.25 && v[0] + 12 <= 74) {
      v.push(v.shift()! + 12); // lowest note up an octave
    } else if (r < 0.45 && v[v.length - 1] - 12 >= 48) {
      v.unshift(v.pop()! - 12); // top note down an octave
    }
    return v;
  }

  // ---------------------------------------------------------------------------
  // Voices
  // ---------------------------------------------------------------------------

  /** Connects a new LFO into an existing GainNode's input (summing). */
  private lfoInto(node: AudioNode, freq: number, depth: number, time: number): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = freq;
    const amount = this.ctx.createGain();
    amount.gain.value = depth;
    osc.connect(amount).connect(node);
    osc.start(time);
    osc.onended = () => amount.disconnect();
    return osc;
  }

  /** Creates a pitched oscillator wired to the wobble bus; `onEnd` runs after it stops (for cleanup). */
  private osc(
    type: OscillatorType, freq: number, detune: number, dest: AudioNode, start: number, stop: number, onEnd?: () => void,
  ): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    this.wobble.connect(o.detune);
    o.start(start);
    o.stop(stop);
    o.onended = () => {
      this.wobble.disconnect(o.detune);
      o.disconnect();
      onEnd?.();
    };
  }

  /**
   * Electric-piano-ish note: sine fundamental + slightly detuned triangle for body,
   * plus a quick-decaying 4th harmonic "tine" on the attack. Soft 12 ms attack,
   * decay towards a low sustain, then release.
   */
  private key(midi: number, t: number, dur: number, vel: number, bright = false): void {
    const f = midiToHz(midi);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.012);
    env.gain.setTargetAtTime(vel * 0.3, t + 0.012, 0.45);
    env.gain.setTargetAtTime(0, t + dur, 0.18);
    env.connect(this.keysIn);
    const end = t + dur + 1;

    // The fundamental stops last, so it owns the envelope cleanup.
    this.osc('sine', f, 0, env, t, end, () => env.disconnect());
    const tri = this.ctx.createGain();
    tri.gain.value = 0.22;
    tri.connect(env);
    this.osc('triangle', f, 4, tri, t, end);

    const tineEnv = this.ctx.createGain();
    const tineLevel = bright ? 0.35 : 0.18;
    tineEnv.gain.setValueAtTime(tineLevel, t);
    tineEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    tineEnv.connect(env);
    this.osc('sine', f * 4, -3, tineEnv, t, t + 0.3);
  }

  /** Mellow bass: sine + a little triangle for definition on small speakers. */
  private bassNote(midi: number, t: number, dur: number, vel: number): void {
    const f = midiToHz(midi);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.015);
    env.gain.setTargetAtTime(vel * 0.6, t + 0.015, 0.3);
    env.gain.setTargetAtTime(0, t + dur, 0.06);
    env.connect(this.bassIn);
    const end = t + dur + 0.5;
    this.osc('sine', f, 0, env, t, end, () => env.disconnect());
    const tri = this.ctx.createGain();
    tri.gain.value = 0.25;
    tri.connect(env);
    this.osc('triangle', f, 0, tri, t, end);
  }

  /** Kick: sine with a fast exponential pitch drop (120 → 45 Hz); also ducks the keys. */
  private kick(t: number, vel: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.55 * vel, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(env).connect(this.drumsIn);
    o.start(t);
    o.stop(t + 0.5);
    o.onended = () => env.disconnect();

    // Gentle sidechain pump on the keys (skipped if the previous pump is still running,
    // so automation events never overlap).
    if (t < this.duckFreeAt) return;
    this.duckFreeAt = t + 0.28;
    this.duck.gain.setValueAtTime(1, t);
    this.duck.gain.linearRampToValueAtTime(0.8, t + 0.02);
    this.duck.gain.linearRampToValueAtTime(1, t + 0.28);
  }

  /** Snare: band-passed noise burst plus a short triangle "body" at ~185 Hz. */
  private snare(t: number, vel: number): void {
    noiseBurst(this.ctx, {
      buffer: this.noise.white, dest: this.drumsIn, time: t, duration: 0.2,
      gain: 0.22 * vel, filter: 'bandpass', frequency: 1800, q: 0.7, attack: 0.002,
    });
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.18 * vel, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(env).connect(this.drumsIn);
    o.start(t);
    o.stop(t + 0.12);
    o.onended = () => env.disconnect();
  }

  /** Closed hat: high-passed noise tick (dulled further by the tape filter). */
  private hat(t: number, vel: number, open: boolean): void {
    noiseBurst(this.ctx, {
      buffer: this.noise.white, dest: this.drumsIn, time: t, duration: open ? 0.16 : rand(0.03, 0.05),
      gain: 0.1 * vel, filter: 'highpass', frequency: 3000,
    });
  }
}

