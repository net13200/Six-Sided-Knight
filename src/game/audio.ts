import { MusicPlayer, type TrackId } from './music';

/**
 * Sound effects synthesized with WebAudio (no audio files). The context is
 * created at startup; where the browser blocks sound until the player
 * interacts, it starts on the first touch or key press anywhere.
 */
export type SfxName =
  | 'roll'
  | 'bump'
  | 'hit'
  | 'clunk'
  | 'kill'
  | 'block'
  | 'hurt'
  | 'heal'
  | 'gold'
  | 'unlock'
  | 'win'
  | 'lose'
  | 'undo'
  | 'click'
  | 'slide'
  | 'freeze'
  | 'pull'
  | 'shoot'
  | 'buy';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlayed = new Map<SfxName, number>();
  private music: MusicPlayer | null = null;
  private track: TrackId | null = null;
  private musicVolume = 0.5;
  private isMuted = false;

  /** Mutes sound effects and music. */
  get muted(): boolean {
    return this.isMuted;
  }
  set muted(on: boolean) {
    this.isMuted = on;
    this.applyMusicVolume();
  }

  /** The music track the game wants playing (for tests and debugging). */
  get currentTrack(): TrackId | null {
    return this.track;
  }

  /** Background music track to play (starts after the first user gesture). */
  setTrack(id: TrackId | null): void {
    this.track = id;
    this.music?.play(id);
  }

  /** Music volume 0 (off) to 1. */
  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    this.applyMusicVolume();
  }

  private applyMusicVolume(): void {
    // Music sits under the sound effects.
    this.music?.setVolume(this.isMuted ? 0 : this.musicVolume * 0.6);
  }

  /** Whether sound is actually playing (not blocked by the browser or suspended). */
  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /**
   * Starts sound. Called at startup (works where the browser allows sound
   * without a gesture) and again from gestures. Safe to call repeatedly.
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.music = new MusicPlayer(this.ctx, this.master);
      this.applyMusicVolume();
      this.music.play(this.track);
      const len = Math.floor(this.ctx.sampleRate * 0.3);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < len; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = (seed / 4294967296) * 2 - 1;
      }
    } catch {
      this.ctx = null;
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  play(name: SfxName, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime + delay;
    // Avoid stacking the same sound many times in one instant (e.g. splash).
    const last = this.lastPlayed.get(name) ?? -1;
    if (Math.abs(t - last) < 0.03) return;
    this.lastPlayed.set(name, t);

    switch (name) {
      case 'roll':
        this.noiseHit(t, 0.06, 900, 0.25);
        this.tone(t, 'triangle', 180, 120, 0.07, 0.18);
        break;
      case 'bump':
        this.tone(t, 'sine', 110, 80, 0.08, 0.25);
        break;
      case 'hit':
        this.noiseHit(t, 0.08, 2200, 0.35);
        this.tone(t, 'square', 320, 160, 0.09, 0.12);
        break;
      case 'clunk':
        this.tone(t, 'triangle', 140, 90, 0.12, 0.3);
        this.noiseHit(t, 0.04, 500, 0.2);
        break;
      case 'kill':
        this.tone(t, 'square', 520, 90, 0.2, 0.12);
        this.noiseHit(t + 0.02, 0.15, 1200, 0.25);
        break;
      case 'block':
        this.tone(t, 'triangle', 880, 860, 0.12, 0.15);
        this.tone(t, 'sine', 1320, 1300, 0.1, 0.08);
        break;
      case 'hurt':
        this.tone(t, 'sawtooth', 220, 110, 0.18, 0.15);
        break;
      case 'heal':
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.07, 'sine', f, f, 0.14, 0.18));
        break;
      case 'gold':
        this.tone(t, 'square', 988, 988, 0.06, 0.08);
        this.tone(t + 0.06, 'square', 1319, 1319, 0.12, 0.08);
        break;
      case 'unlock':
        this.noiseHit(t, 0.03, 3000, 0.3);
        this.tone(t + 0.04, 'triangle', 660, 990, 0.15, 0.15);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone(t + i * 0.09, 'triangle', f, f, 0.22, 0.2),
        );
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) =>
          this.tone(t + i * 0.14, 'triangle', f, f * 0.97, 0.25, 0.2),
        );
        break;
      case 'undo':
        this.tone(t, 'sine', 500, 300, 0.08, 0.12);
        break;
      case 'click':
        this.tone(t, 'sine', 700, 700, 0.04, 0.1);
        break;
      case 'slide':
        this.noiseHit(t, 0.18, 4200, 0.12);
        this.tone(t, 'sine', 1400, 900, 0.16, 0.05);
        break;
      case 'freeze':
        [1568, 2093, 2637].forEach((f, i) => this.tone(t + i * 0.04, 'sine', f, f, 0.16, 0.08));
        this.noiseHit(t, 0.1, 5000, 0.12);
        break;
      case 'pull':
        this.tone(t, 'triangle', 300, 700, 0.14, 0.15);
        this.noiseHit(t + 0.1, 0.04, 1500, 0.2);
        break;
      case 'shoot':
        this.noiseHit(t, 0.07, 3500, 0.2);
        this.tone(t, 'sine', 900, 400, 0.08, 0.08);
        break;
      case 'buy':
        [659, 988, 1319].forEach((f, i) => this.tone(t + i * 0.06, 'square', f, f, 0.1, 0.07));
        break;
    }
  }

  private tone(
    t: number,
    type: OscillatorType,
    from: number,
    to: number,
    dur: number,
    vol: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseHit(t: number, dur: number, cutoff: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
