/**
 * Sound, synthesised in WebAudio rather than shipped as files: the whole
 * palette here is bubbles, thuds and chimes, which cost a few oscillators and
 * would otherwise be a megabyte of assets on a game that loads in one request.
 *
 * The AudioContext is created lazily on the first cue, which always follows
 * the player pressing Dive, so autoplay policy is satisfied without a special
 * case.
 */
const STORE_KEY = 'sunkenhold.muted';

function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = loadMuted();

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(STORE_KEY, muted ? '1' : '0');
    } catch {
      /* not fatal */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  private ready(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** One second of white noise, reused for every bubble and rumble. */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    return this.noise;
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    gain: number,
    delay = 0,
  ): void {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp).connect(this.master!);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private hiss(
    ctx: AudioContext,
    filter: BiquadFilterType,
    from: number,
    to: number,
    duration: number,
    gain: number,
  ): void {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const band = ctx.createBiquadFilter();
    band.type = filter;
    band.frequency.setValueAtTime(from, t);
    band.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + duration);
    band.Q.value = 1.2;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(band).connect(amp).connect(this.master!);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  /** A diver dropping: bubble wash sweeping downward. */
  descend(riders: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.hiss(ctx, 'bandpass', 900, 260, 0.5, 0.16);
    // A fuller rope with riders on it should sound heavier.
    if (riders > 0) this.tone(ctx, 'sine', 180, 90, 0.42, 0.1);
  }

  /** Settling onto the ledge below. */
  land(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(ctx, 'sine', 120, 62, 0.2, 0.22);
  }

  /** Treasure, brighter for a richer haul. */
  treasure(value: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const base = 620 + Math.min(value, 12) * 26;
    this.tone(ctx, 'triangle', base, base, 0.38, 0.16);
    this.tone(ctx, 'triangle', base * 1.5, base * 1.5, 0.44, 0.12, 0.07);
  }

  /** Surfacing with nothing. */
  abort(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(ctx, 'sawtooth', 380, 150, 0.5, 0.1);
  }

  /** A trench picked clean. */
  closed(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.hiss(ctx, 'lowpass', 320, 70, 0.85, 0.2);
  }

  /** Cards leaving the hand. */
  spend(count: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    for (let i = 0; i < count; i++) this.tone(ctx, 'square', 760, 380, 0.06, 0.045, i * 0.06);
  }

  /** Cards arriving from the deck. */
  deal(count: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    for (let i = 0; i < count; i++) this.tone(ctx, 'triangle', 1150, 900, 0.045, 0.035, i * 0.07);
  }
}
