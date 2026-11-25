import { AmbienceLayer, NoiseBank, RandomEvents, noiseBurst, rand, startLfo, startLoop, stopAll } from './audio-utils';

/**
 * Soft, steady rain: a looped pink-noise bed band-limited to the "hiss" region,
 * a quiet low brown-noise layer for body (rain on a roof), a very slow
 * intensity swell, and sparse resonant droplet ticks on top.
 */
export class RainLayer implements AmbienceLayer {
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly bedInput: AudioNode;
  private readonly bed: BiquadFilterNode;
  private readonly bedGain: GainNode;
  private readonly body: BiquadFilterNode;
  private readonly droplets: RandomEvents;

  constructor(private readonly ctx: BaseAudioContext, private readonly noise: NoiseBank, private readonly out: AudioNode) {
    // Bed: pink noise -> high-pass 400 Hz -> low-pass ~2.6 kHz (soft, not sizzling).
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    this.bed = ctx.createBiquadFilter();
    this.bed.type = 'lowpass';
    this.bed.frequency.value = 2600;
    this.bed.Q.value = 0.3;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.55;
    hp.connect(this.bed).connect(this.bedGain).connect(out);
    this.bedInput = hp;

    // Body: brown noise low-passed at 300 Hz, quiet.
    this.body = ctx.createBiquadFilter();
    this.body.type = 'lowpass';
    this.body.frequency.value = 300;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.35;
    this.body.connect(bodyGain).connect(out);

    // ~7 droplets per second, each a 10–35 ms band-passed tick at a random pitch.
    this.droplets = new RandomEvents(0.14, (t) =>
      noiseBurst(this.ctx, {
        buffer: this.noise.white,
        dest: this.out,
        time: t,
        duration: rand(0.01, 0.035),
        gain: Math.pow(Math.random(), 2) * 0.22,
        filter: 'bandpass',
        frequency: rand(1800, 4200),
        q: rand(3, 8),
      }),
    );
  }

  setActive(active: boolean, time: number): void {
    stopAll(this.sources, active ? time : time + 0.4);
    if (!active) return;
    this.sources.push(
      startLoop(this.ctx, this.noise.pink, this.bedInput, time),
      startLoop(this.ctx, this.noise.brown, this.body, time),
      // Slow "intensity" swell: ~25 s period on the bed brightness and level.
      startLfo(this.ctx, this.bed.frequency, 0.04, 350, time),
      startLfo(this.ctx, this.bedGain.gain, 0.03, 0.08, time),
    );
  }

  tick(now: number, horizon: number): void {
    this.droplets.run(now, horizon);
  }
}

/**
 * Fireplace: a low brown-noise rumble whose level "breathes" with two slow,
 * non-harmonically related LFOs, a faint airy hiss, and random crackles —
 * very short high-passed noise bursts that sometimes come in small clusters,
 * with an occasional deeper "pop".
 */
export class FireLayer implements AmbienceLayer {
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly rumble: BiquadFilterNode;
  private readonly rumbleGain: GainNode;
  private readonly hiss: BiquadFilterNode;
  private readonly crackles: RandomEvents;

  constructor(private readonly ctx: BaseAudioContext, private readonly noise: NoiseBank, private readonly out: AudioNode) {
    this.rumble = ctx.createBiquadFilter();
    this.rumble.type = 'lowpass';
    this.rumble.frequency.value = 320;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.8;
    this.rumble.connect(this.rumbleGain).connect(out);

    this.hiss = ctx.createBiquadFilter();
    this.hiss.type = 'bandpass';
    this.hiss.frequency.value = 1400;
    this.hiss.Q.value = 0.6;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.06;
    this.hiss.connect(hissGain).connect(out);

    this.crackles = new RandomEvents(0.28, (t) => {
      this.crackle(t);
      // ~30% of crackles are followed by a short burst of 1–3 more.
      if (Math.random() < 0.3) {
        const extra = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < extra; i++) this.crackle(t + rand(0.015, 0.09));
      }
      // Rare, softer, lower "log pop".
      if (Math.random() < 0.06) {
        noiseBurst(this.ctx, {
          buffer: this.noise.white, dest: this.out, time: t, duration: rand(0.04, 0.08),
          gain: rand(0.15, 0.3), filter: 'bandpass', frequency: rand(500, 900), q: 1.5,
        });
      }
    });
  }

  private crackle(t: number): void {
    noiseBurst(this.ctx, {
      buffer: this.noise.white,
      dest: this.out,
      time: t,
      duration: rand(0.004, 0.02),
      // Cubed random -> mostly tiny ticks, occasionally a louder snap.
      gain: 0.05 + Math.pow(Math.random(), 3) * 0.45,
      filter: 'highpass',
      frequency: rand(1500, 3500),
    });
  }

  setActive(active: boolean, time: number): void {
    stopAll(this.sources, active ? time : time + 0.4);
    if (!active) return;
    this.sources.push(
      startLoop(this.ctx, this.noise.brown, this.rumble, time),
      startLoop(this.ctx, this.noise.pink, this.hiss, time),
      startLfo(this.ctx, this.rumbleGain.gain, 0.13, 0.15, time),
      startLfo(this.ctx, this.rumbleGain.gain, 0.37, 0.07, time),
    );
  }

  tick(now: number, horizon: number): void {
    this.crackles.run(now, horizon);
  }
}

/** Calm "focus noise": smooth brown noise, gently low-passed, no events. */
export class BrownLayer implements AmbienceLayer {
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly filter: BiquadFilterNode;

  constructor(private readonly ctx: BaseAudioContext, private readonly noise: NoiseBank, out: AudioNode) {
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 700;
    this.filter.Q.value = 0.4;
    this.filter.connect(out);
  }

  setActive(active: boolean, time: number): void {
    stopAll(this.sources, active ? time : time + 0.4);
    if (!active) return;
    this.sources.push(startLoop(this.ctx, this.noise.brown, this.filter, time));
  }

  tick(): void {
    // Continuous only – nothing to schedule.
  }
}
