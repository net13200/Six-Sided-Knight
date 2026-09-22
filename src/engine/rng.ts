/**
 * Seeded RNG (mulberry32). The state is a single uint32 that lives in
 * GameState, so saving, undo and replay capture it for free.
 */

export interface RngStep {
  readonly value: number; // [0, 1)
  readonly state: number;
}

export function rngNext(state: number): RngStep {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

/** Hashes a string (e.g. a date or level id) into a uint32 seed (FNV-1a). */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stateful convenience wrapper for tools and the generator (not used inside step). */
export class Rng {
  constructor(public state: number) {}
  next(): number {
    const r = rngNext(this.state);
    this.state = r.state;
    return r.value;
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty list');
    return items[this.int(items.length)]!;
  }
}
