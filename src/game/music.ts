/**
 * Background music, composed for the game and synthesized with WebAudio (no
 * audio files). Each track is a short loop written as note lists; small
 * instruments (plucked lute/harp, recorder, soft pad, bells, frame drum)
 * are built from oscillators and noise.
 *
 * Tracks:
 * - hall:   title screen. D dorian, 6/8, a heroic little tune on recorder
 *           over lute arpeggios and a frame drum.
 * - puzzle: campaign levels. A minor, slow harp arpeggios and sparse bells:
 *           calm enough to think over.
 * - depths: Depths and Gauntlets. D phrygian, a low drone, a heartbeat drum
 *           and distant bells.
 */

export type Voice = 'pluck' | 'harp' | 'recorder' | 'pad' | 'bass' | 'bell' | 'drum' | 'tick';

/** [start in steps, MIDI note (0 for drums), length in steps, volume 0..1] */
export type Note = readonly [number, number, number, number?];

export interface Part {
  readonly voice: Voice;
  readonly gain: number;
  readonly notes: readonly Note[];
  /**
   * Which passes of the arrangement cycle this part plays on (default: all).
   * Parts dropping in and out make each pass a little different, so the
   * music never sounds like it ends and starts again.
   */
  readonly passes?: readonly number[];
}

export interface Track {
  readonly name: string;
  /** Seconds per step. */
  readonly step: number;
  /** Loop length in steps. */
  readonly length: number;
  /** Passes before the arrangement repeats exactly. */
  readonly cycle: number;
  readonly parts: readonly Part[];
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// ---------- composition helpers ----------

/** Repeats a bar pattern over chord roots: pattern offsets are semitones from the root. */
function arpeggio(
  roots: readonly number[],
  pattern: readonly number[],
  barSteps: number,
  len = 1,
  vol = 1,
): Note[] {
  const out: Note[] = [];
  roots.forEach((root, bar) => {
    pattern.forEach((off, i) => {
      if (Number.isNaN(off)) return;
      out.push([bar * barSteps + i, root + off, len, vol]);
    });
  });
  return out;
}

function shift(notes: readonly Note[], by: number, transpose = 0, vol = 1): Note[] {
  return notes.map(([s, m, l, v = 1]) => [s + by, m === 0 ? 0 : m + transpose, l, v * vol]);
}

// ---------- "Hall of the Die" (title) ----------

const HALL_MELODY: Note[] = [
  // Dm
  [0, 69, 2],
  [2, 74, 1],
  [3, 76, 2],
  [5, 77, 1],
  // C
  [6, 79, 3],
  [9, 76, 2],
  [11, 72, 1],
  // Dm
  [12, 74, 2],
  [14, 76, 1],
  [15, 77, 1],
  [16, 76, 1],
  [17, 74, 1],
  // Am
  [18, 76, 6],
  // F
  [24, 81, 2],
  [26, 79, 1],
  [27, 77, 2],
  [29, 76, 1],
  // C
  [30, 79, 2],
  [32, 77, 1],
  [33, 76, 3],
  // G (the B natural gives it the dorian, old-tune colour)
  [36, 74, 2],
  [38, 76, 1],
  [39, 71, 2],
  [41, 74, 1],
  // Dm
  [42, 74, 6],
];
// Answer phrase for the second half: same shape, climbing higher.
const HALL_ANSWER: Note[] = [
  [0, 81, 2],
  [2, 79, 1],
  [3, 77, 2],
  [5, 76, 1],
  [6, 79, 3],
  [9, 77, 2],
  [11, 76, 1],
  [12, 74, 2],
  [14, 77, 1],
  [15, 81, 3],
  [18, 79, 4],
  [22, 77, 1],
  [23, 76, 1],
  [24, 77, 2],
  [26, 76, 1],
  [27, 74, 2],
  [29, 72, 1],
  [30, 74, 2],
  [32, 76, 1],
  [33, 79, 3],
  [36, 77, 2],
  [38, 76, 1],
  [39, 73, 2],
  [41, 76, 1],
  [42, 74, 6],
];
const HALL_ROOTS = [50, 48, 50, 45, 41, 48, 43, 50]; // D C D A F C G D (octave 3)
const HALL_MINOR = new Set([0, 2, 3]);
const hallArp = (roots: readonly number[]) =>
  roots.flatMap((root, bar) => {
    const third = HALL_MINOR.has(bar) || bar === 7 ? 3 : 4;
    const pat = [0, 7, 12, third + 12, 7, 12];
    return pat.map((o, i) => [bar * 6 + i, root + o, 1, i === 0 ? 1 : 0.7] as Note);
  });

export const HALL: Track = {
  name: 'Hall of the Die',
  step: 0.2,
  length: 96,
  // Pass 1 adds a harp an octave below the tune; pass 2 is an instrumental
  // break (no tune); pass 3 lets the drum rest.
  cycle: 4,
  parts: [
    {
      voice: 'recorder',
      gain: 0.5,
      notes: [...HALL_MELODY, ...shift(HALL_ANSWER, 48)],
      passes: [0, 1, 3],
    },
    {
      voice: 'harp',
      gain: 0.22,
      notes: [...shift(HALL_MELODY, 0, -12), ...shift(HALL_ANSWER, 48, -12)],
      passes: [1],
    },
    {
      voice: 'pluck',
      gain: 0.32,
      notes: [...hallArp(HALL_ROOTS), ...shift(hallArp(HALL_ROOTS), 48)],
    },
    {
      voice: 'bass',
      gain: 0.42,
      notes: [...HALL_ROOTS, ...HALL_ROOTS].flatMap((r, bar) => [
        [bar * 6, r - 12, 3] as Note,
        [bar * 6 + 3, r - 5, 3, 0.7] as Note,
      ]),
    },
    {
      voice: 'drum',
      passes: [0, 1, 2],
      gain: 0.5,
      notes: Array.from({ length: 16 }, (_, bar) => [
        [bar * 6, 0, 1, 1] as Note,
        [bar * 6 + 3, 0, 1, 0.55] as Note,
        [bar * 6 + 5, 0, 1, 0.35] as Note,
      ]).flat(),
    },
    {
      voice: 'tick',
      passes: [0, 1, 2],
      gain: 0.1,
      notes: Array.from({ length: 16 * 6 }, (_, i) => [i, 0, 1, i % 3 === 0 ? 1 : 0.5] as Note),
    },
  ],
};

// ---------- "Quiet Stones" (puzzle levels) ----------

const PUZZLE_ROOTS = [57, 53, 48, 55, 57, 50, 52, 57]; // Am F C G Am Dm E Am
const PUZZLE_QUALITY = [3, 4, 4, 4, 3, 3, 4, 3]; // minor/major third per bar
const puzzleHarp = PUZZLE_ROOTS.flatMap((root, bar) => {
  const t = PUZZLE_QUALITY[bar]!;
  return [0, 7, 12, t + 12, 19, t + 12, 12, 7].map(
    (o, i) => [bar * 8 + i, root - 12 + o, 2, i === 0 ? 0.9 : 0.6] as Note,
  );
});
const PUZZLE_BELLS: Note[] = [
  [0, 76, 4],
  [6, 72, 2],
  [8, 69, 8],
  [16, 67, 3],
  [20, 76, 4],
  [24, 74, 8],
  [32, 72, 3],
  [36, 76, 4],
  [40, 77, 5],
  [46, 74, 2],
  [48, 71, 3],
  [52, 68, 4],
  [56, 69, 8],
];

export const PUZZLE: Track = {
  name: 'Quiet Stones',
  step: 0.4,
  length: 128,
  // Pass 0: harp, bells, pad. Pass 1: harp and pad only. Pass 2: harp and bells.
  cycle: 3,
  parts: [
    { voice: 'harp', gain: 0.3, notes: [...puzzleHarp, ...shift(puzzleHarp, 64)] },
    // Softer bells the first time round, then an octave up: the loop breathes.
    {
      voice: 'bell',
      gain: 0.22,
      notes: [...shift(PUZZLE_BELLS, 0, 0, 0.6), ...shift(PUZZLE_BELLS, 64, 12)],
      passes: [0, 2],
    },
    {
      voice: 'pad',
      gain: 0.16,
      notes: [...PUZZLE_ROOTS, ...PUZZLE_ROOTS].map((r, bar) => [bar * 8, r - 12, 8] as Note),
      passes: [0, 1],
    },
  ],
};

// ---------- "Into the Depths" (Depths, Gauntlets) ----------

const DEPTHS_WHISTLE: Note[] = [
  [8, 74, 3],
  [11, 75, 1],
  [12, 74, 4], // D Eb D: the phrygian half-step
  [24, 77, 2],
  [26, 75, 2],
  [28, 74, 4],
  [40, 70, 3],
  [43, 72, 1],
  [44, 74, 6],
  [56, 75, 2],
  [58, 74, 2],
  [60, 72, 2],
  [62, 70, 2],
];

export const DEPTHS: Track = {
  name: 'Into the Depths',
  step: 0.3,
  length: 64,
  // The whistle comes and goes; bells and harp take turns.
  cycle: 4,
  parts: [
    {
      voice: 'pad',
      gain: 0.22,
      notes: [
        [0, 38, 32],
        [0, 45, 32],
        [32, 39, 16],
        [32, 46, 16],
        [48, 38, 16],
        [48, 45, 16],
      ],
    },
    { voice: 'recorder', gain: 0.22, notes: DEPTHS_WHISTLE, passes: [1, 3] },
    {
      voice: 'drum',
      gain: 0.28,
      notes: Array.from({ length: 16 }, (_, i) => [
        [i * 4, 0, 1, 1] as Note,
        [i * 4 + 1, 0, 1, 0.5] as Note,
      ]).flat(),
    },
    {
      voice: 'bell',
      passes: [0, 2, 3],
      gain: 0.14,
      notes: [
        [4, 62, 8],
        [20, 65, 8],
        [36, 63, 8],
        [52, 62, 8],
      ],
    },
    {
      voice: 'harp',
      passes: [0, 1, 2],
      gain: 0.18,
      notes: arpeggio(
        [50, 50, 51, 50],
        [0, NaN, 7, NaN, 13, NaN, 7, NaN, 12, NaN, NaN, NaN, 7, NaN, NaN, NaN],
        16,
        2,
        0.6,
      ),
    },
  ],
};

export const TRACKS = { hall: HALL, puzzle: PUZZLE, depths: DEPTHS } as const;
export type TrackId = keyof typeof TRACKS;

// ---------- instruments ----------

/** Schedules one note. Works with live and offline audio contexts. */
export function playVoice(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  voice: Voice,
  midi: number,
  t: number,
  dur: number,
  vol: number,
): void {
  const env = (g: GainNode, attack: number, peak: number, release: number, hold = 0) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return t + attack + hold + release + 0.05;
  };
  const osc = (type: OscillatorType, f: number, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    return o;
  };
  const f = hz(midi);
  switch (voice) {
    case 'pluck':
    case 'harp': {
      // Bright attack that darkens quickly, like a plucked gut string.
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(voice === 'pluck' ? 3200 : 2400, t);
      lp.frequency.exponentialRampToValueAtTime(voice === 'pluck' ? 600 : 800, t + 0.4);
      const a = osc('triangle', f);
      const b = osc('sawtooth', f, 4);
      const bg = ctx.createGain();
      bg.gain.value = 0.25;
      const end = env(g, 0.004, vol, voice === 'pluck' ? 0.55 : 1.4);
      a.connect(lp);
      b.connect(bg).connect(lp);
      lp.connect(g).connect(out);
      for (const o of [a, b]) {
        o.start(t);
        o.stop(end);
      }
      break;
    }
    case 'recorder': {
      // Breathy, softly vibrato'd flute tone.
      const g = ctx.createGain();
      const a = osc('sine', f);
      const b = osc('triangle', f * 2);
      const bg = ctx.createGain();
      bg.gain.value = 0.12;
      const lfo = osc('sine', 5.2);
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.3);
      lfo.connect(lg).connect(a.frequency);
      const breath = ctx.createBufferSource();
      breath.buffer = noise;
      breath.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * 2;
      bp.Q.value = 4;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.12, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      const end = env(g, 0.04, vol, 0.12, Math.max(0, dur - 0.1));
      a.connect(g);
      b.connect(bg).connect(g);
      g.connect(out);
      breath.connect(bp).connect(ng).connect(out);
      for (const o of [a, b, lfo]) {
        o.start(t);
        o.stop(end);
      }
      breath.start(t);
      breath.stop(t + 0.15);
      break;
    }
    case 'pad': {
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const oscs = [osc('sawtooth', f, -7), osc('sawtooth', f, 7), osc('triangle', f / 2)];
      const end = env(
        g,
        Math.min(1.2, dur / 3),
        vol,
        Math.min(1.5, dur / 3),
        Math.max(0, dur - 1.6),
      );
      for (const o of oscs) {
        o.connect(lp);
        o.start(t);
        o.stop(end);
      }
      lp.connect(g).connect(out);
      break;
    }
    case 'bass': {
      const g = ctx.createGain();
      const o = osc('triangle', f);
      const end = env(g, 0.01, vol, Math.min(1.2, dur));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(end);
      break;
    }
    case 'bell': {
      // Inharmonic partials with long, staggered decays.
      for (const [ratio, amp, decay] of [
        [1, 1, 2.6],
        [2.76, 0.35, 1.2],
        [5.4, 0.15, 0.6],
      ] as const) {
        const g = ctx.createGain();
        const o = osc('sine', f * ratio);
        const end = env(g, 0.005, vol * amp, decay);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(end);
      }
      break;
    }
    case 'drum': {
      // Frame drum: a pitched thump plus a little skin noise.
      const g = ctx.createGain();
      const o = osc('sine', 110);
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
      const end = env(g, 0.003, vol, 0.35);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(end);
      const n = ctx.createBufferSource();
      n.buffer = noise;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.3, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      n.connect(lp).connect(ng).connect(out);
      n.start(t);
      n.stop(t + 0.1);
      break;
    }
    case 'tick': {
      // Tambourine-ish tick.
      const n = ctx.createBufferSource();
      n.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      n.connect(hp).connect(g).connect(out);
      n.start(t);
      n.stop(t + 0.06);
      break;
    }
  }
}

export function playsOnPass(part: Part, track: Track, pass: number): boolean {
  return !part.passes || part.passes.includes(pass % track.cycle);
}

/** Schedules one full pass of a track starting at time `t0`. Returns when it ends. */
export function scheduleLoop(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  track: Track,
  t0: number,
  pass = 0,
): number {
  for (const part of track.parts) {
    if (!playsOnPass(part, track, pass)) continue;
    for (const [s, m, l, v = 1] of part.notes) {
      if (s >= track.length) continue;
      playVoice(ctx, out, noise, part.voice, m, t0 + s * track.step, l * track.step, part.gain * v);
    }
  }
  return t0 + track.length * track.step;
}

export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 987654321;
  for (let i = 0; i < len; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = (seed / 4294967296) * 2 - 1;
  }
  return buf;
}

/**
 * A small stone-hall echo: two filtered feedback delays mixed under the dry
 * signal. Returns the node to play into.
 */
export function createRoom(ctx: BaseAudioContext, out: AudioNode): AudioNode {
  const input = ctx.createGain();
  input.connect(out);
  for (const [time, fb, level] of [
    [0.137, 0.32, 0.22],
    [0.229, 0.28, 0.18],
  ] as const) {
    const d = ctx.createDelay(1);
    d.delayTime.value = time;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const feedback = ctx.createGain();
    feedback.gain.value = fb;
    const wet = ctx.createGain();
    wet.gain.value = level;
    input.connect(d);
    d.connect(lp).connect(feedback).connect(d);
    lp.connect(wet).connect(out);
  }
  return input;
}

/** Note start times (seconds) over several passes, as the player schedules them. */
export function noteTimes(track: Track, passes: number): number[] {
  const times: number[] = [];
  for (let pass = 0; pass < passes; pass++) {
    const t0 = pass * track.length * track.step;
    for (const part of track.parts) {
      if (!playsOnPass(part, track, pass)) continue;
      for (const [s] of part.notes) if (s < track.length) times.push(t0 + s * track.step);
    }
  }
  return times.sort((a, b) => a - b);
}

// ---------- the live player ----------

interface Event {
  readonly step: number;
  readonly part: Part;
  readonly note: Note;
}

/**
 * Plays tracks endlessly. Notes are scheduled a few seconds ahead in small
 * batches (so a track can stop or change at any moment), and each pass
 * starts exactly where the last one ended: no gap, no restart feeling.
 * Changing track cross-fades.
 */
export class MusicPlayer {
  private bus: GainNode;
  private room: AudioNode;
  private noise: AudioBuffer;
  private current: {
    id: TrackId;
    gain: GainNode;
    events: Event[];
    index: number;
    pass: number;
    passStart: number;
  } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private volume = 0.4;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = this.volume;
    this.bus.connect(out);
    this.room = createRoom(ctx, this.bus);
    this.noise = makeNoise(ctx);
    this.timer = setInterval(() => this.pump(), 250);
  }

  get trackId(): TrackId | null {
    return this.current?.id ?? null;
  }

  /** 0 (off) to 1. */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(this.volume, t, 0.08);
  }

  /** Switches to a track (cross-fading), or keeps playing if it's already on. */
  play(id: TrackId | null): void {
    if (this.current?.id === id) return;
    const t = this.ctx.currentTime;
    if (this.current) {
      const old = this.current.gain;
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + 1.5);
      setTimeout(() => old.disconnect(), 4000);
      this.current = null;
    }
    if (!id) return;
    const track = TRACKS[id];
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 1.2);
    gain.connect(this.room);
    const events: Event[] = track.parts
      .flatMap((part) => part.notes.map((note) => ({ step: note[0], part, note })))
      .filter((e) => e.step < track.length)
      .sort((a, b) => a.step - b.step);
    this.current = { id, gain, events, index: 0, pass: 0, passStart: t + 0.1 };
    this.pump();
  }

  /** Schedules everything due in the next few seconds. */
  private pump(): void {
    const cur = this.current;
    if (!cur || this.ctx.state !== 'running') return;
    const track = TRACKS[cur.id];
    const horizon = this.ctx.currentTime + 3;
    // Never schedule into the past (e.g. after the app was in the background).
    if (cur.passStart + track.length * track.step < this.ctx.currentTime) {
      cur.passStart = this.ctx.currentTime + 0.05;
      cur.index = 0;
      cur.pass++;
    }
    for (;;) {
      if (cur.index >= cur.events.length) {
        // Next pass starts exactly where this one ends.
        cur.passStart += track.length * track.step;
        cur.pass++;
        cur.index = 0;
      }
      const e = cur.events[cur.index]!;
      const t = cur.passStart + e.step * track.step;
      if (t > horizon) break;
      cur.index++;
      if (t < this.ctx.currentTime || !playsOnPass(e.part, track, cur.pass)) continue;
      const [, midi, len, v = 1] = e.note;
      playVoice(
        this.ctx,
        cur.gain,
        this.noise,
        e.part.voice,
        midi,
        t,
        len * track.step,
        e.part.gain * v,
      );
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.bus.disconnect();
  }
}
