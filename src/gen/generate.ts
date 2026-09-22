/**
 * Seeded procedural levels. Every level returned is proven solvable by the
 * solver (at the given starting HP) and rated; the generator retries with
 * new sub-seeds until the rating lands in the target band. If no attempt
 * lands in the band, it returns the solvable candidate closest to it — it
 * never returns an unsolvable level.
 *
 * Same seed + same params = same level, on every device.
 */
import { Rng, createState, validateLevel, type LevelData, type Rules } from '../engine';
import { rate, type Rating } from '../solver/rate';

export interface GenParams {
  readonly seed: number;
  /** Target difficulty band (rater score, 0-100). */
  readonly band: readonly [number, number];
  readonly id: string;
  readonly name: string;
  /** Starting HP the level must be solvable with. */
  readonly hp?: number;
  readonly maxAttempts?: number;
}

export interface Generated {
  readonly level: LevelData;
  readonly rating: Rating;
  readonly attempts: number;
  readonly inBand: boolean;
}

const W = 8;
const H = 9;

/** Glyphs used when writing grids (must match the registered content). */
const G = {
  wall: '#',
  floor: '.',
  spikes: '^',
  pool: '~',
  door: '|',
  chest: '$',
  gem: '*',
  exit: '>',
  player: '@',
  skeleton: 'k',
  slime: 's',
} as const;

type Cell = string;

export function generateLevel(rules: Rules, params: GenParams): Generated {
  const [lo, hi] = params.band;
  const target = (lo + hi) / 2;
  const maxAttempts = params.maxAttempts ?? 24;
  let best: { level: LevelData; rating: Rating; miss: number } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = new Rng((params.seed ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0);
    // After the first miss, nudge the next attempt toward the band.
    const d = clamp01(target / 100 + (best ? Math.sign(target - best.rating.score) * 0.08 : 0));
    const grid = buildGrid(rng, d);
    const level: LevelData = { schema: 1, id: params.id, name: params.name, grid };
    if (validateLevel(rules, level).length) continue;
    const start = createState(rules, level, { hp: params.hp ?? 5 });
    const rating = rate(rules, start);
    if (!rating.solvable) continue;
    const withPar = { ...level, par: rating.minMoves };
    const miss = rating.score < lo ? lo - rating.score : rating.score > hi ? rating.score - hi : 0;
    if (!best || miss < best.miss) best = { level: withPar, rating, miss };
    if (miss === 0) return { level: withPar, rating, attempts: attempt + 1, inBand: true };
  }

  if (best) return { level: best.level, rating: best.rating, attempts: maxAttempts, inBand: false };
  // Extremely unlikely: fall back to a guaranteed-solvable corridor.
  const level = fallbackLevel(params);
  return {
    level,
    rating: rate(rules, createState(rules, level, { hp: params.hp ?? 5 })),
    attempts: maxAttempts,
    inBand: false,
  };
}

/**
 * Builds a candidate grid. `d` (0-1) scales wall density, hazards and enemies.
 */
function buildGrid(rng: Rng, d: number): string[] {
  const g: Cell[][] = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) =>
      x === 0 || y === 0 || x === W - 1 || y === H - 1 ? G.wall : G.floor,
    ),
  );
  const interior: Array<[number, number]> = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) interior.push([x, y]);

  // Start near the bottom, exit near the top, well apart.
  const start: [number, number] = [1 + rng.int(W - 2), H - 2 - rng.int(2)];
  let exit: [number, number] = [1 + rng.int(W - 2), 1 + rng.int(2)];
  for (let i = 0; i < 10 && manhattan(start, exit) < 6; i++)
    exit = [1 + rng.int(W - 2), 1 + rng.int(2)];
  const reserved = new Set([key(start), key(exit)]);

  // Walls: short segments, kept only if start and exit stay connected.
  const segments = Math.round(2 + d * 6);
  for (let i = 0; i < segments; i++) {
    const [x0, y0] = rng.pick(interior);
    const horizontal = rng.next() < 0.5;
    const len = 1 + rng.int(3);
    const placed: Array<[number, number]> = [];
    for (let k = 0; k < len; k++) {
      const x = x0 + (horizontal ? k : 0);
      const y = y0 + (horizontal ? 0 : k);
      if (x < 1 || y < 1 || x > W - 2 || y > H - 2 || reserved.has(key([x, y]))) break;
      if (g[y]![x] !== G.floor) continue;
      g[y]![x] = G.wall;
      placed.push([x, y]);
    }
    if (!connected(g, start, exit)) for (const [x, y] of placed) g[y]![x] = G.floor;
  }

  const free = () => {
    const cells = interior.filter(([x, y]) => g[y]![x] === G.floor && !reserved.has(key([x, y])));
    return cells.length ? rng.pick(cells) : null;
  };
  const put = (glyph: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const c = free();
      if (c) g[c[1]]![c[0]] = glyph;
    }
  };

  // Features scale with difficulty.
  put(G.gem, 1 + rng.int(2));
  if (rng.next() < 0.35 + d * 0.3) put(G.chest, 1);
  put(G.spikes, Math.round(rng.next() * (1 + d * 4)));
  if (rng.next() < 0.4) put(G.pool, 1);
  // A door on a cell that sits between start and exit makes a key puzzle.
  if (rng.next() < 0.2 + d * 0.4) placeDoor(g, rng, start, exit, reserved);
  const enemies = Math.min(3, Math.round(d * 3.2 + rng.next() * 0.8 - 0.3));
  for (let i = 0; i < enemies; i++) {
    const c = free();
    // Keep enemies off the start's neighbourhood so turn 1 isn't a forced hit.
    if (c && manhattan(c, start) > 2) g[c[1]]![c[0]] = rng.next() < 0.6 ? G.skeleton : G.slime;
  }

  g[start[1]]![start[0]] = G.player;
  g[exit[1]]![exit[0]] = G.exit;
  return g.map((row) => row.join(''));
}

/** Puts a door on a floor cell whose removal disconnects start from exit, if one exists. */
function placeDoor(
  g: Cell[][],
  rng: Rng,
  start: [number, number],
  exit: [number, number],
  reserved: Set<string>,
): void {
  const candidates: Array<[number, number]> = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (g[y]![x] !== G.floor || reserved.has(key([x, y]))) continue;
      g[y]![x] = G.wall;
      if (!connected(g, start, exit)) candidates.push([x, y]);
      g[y]![x] = G.floor;
    }
  }
  if (candidates.length) {
    const [x, y] = rng.pick(candidates);
    g[y]![x] = G.door;
  }
}

/** Start and exit connected, treating doors and chests as openable. */
function connected(g: Cell[][], a: [number, number], b: [number, number]): boolean {
  const seen = new Set([key(a)]);
  const queue = [a];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (x === b[0] && y === b[1]) return true;
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ] as const) {
      const n: [number, number] = [x + dx, y + dy];
      const c = g[n[1]]?.[n[0]];
      if (c === undefined || c === G.wall || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return false;
}

function fallbackLevel(params: GenParams): LevelData {
  return {
    schema: 1,
    id: params.id,
    name: params.name,
    par: 5,
    grid: [
      '########',
      '########',
      '########',
      '########',
      '#@....>#',
      '########',
      '########',
      '########',
      '########',
    ],
  };
}

const key = (p: readonly [number, number]) => `${p[0]},${p[1]}`;
const manhattan = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
