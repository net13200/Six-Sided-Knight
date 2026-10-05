/**
 * Themed rooms for the Daily Roll. Each day leans on one mechanic: the room
 * is built around it (walls with a narrow gap that only that mechanic gets
 * you through, more of its tiles or enemies), and a floor only counts if
 * the fewest-moves route really uses it and takes some thought:
 *
 * - detour: the best route is longer than just walking to the stairs (you
 *   have to turn the die, fetch a face, go around);
 * - novice: heading straight for the stairs mostly fails;
 * - the theme: the route opens a door, lands Shield-down, slides, ...
 */
import type { Dir, LevelData, Rules } from '../engine';
import type { Rng } from '../engine';
import { parWithout, routeFacts } from '../levels/teaches';
import type { Rating } from '../solver/rate';

export const THEMES = ['keys', 'ice', 'bombs', 'archers', 'spikes', 'treasure', 'mixed'] as const;
export type Theme = (typeof THEMES)[number];

/** What a floor must reach to count (besides being solvable). */
export interface Bar {
  readonly band: readonly [number, number];
  /** Moves more than just walking to the stairs. */
  readonly detour: number;
  /** Highest share of naive playouts that may win. */
  readonly novice: number;
}

const W = 8;
const H = 9;
type Pos = [number, number];
const key = (p: readonly [number, number]) => `${p[0]},${p[1]}`;
const manhattan = (a: Pos, b: Pos) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/**
 * A room for `theme`. `d` (0-1) scales how much is in it. Walls split the
 * room into two or three parts joined by narrow gaps; the theme's blocker
 * sits in a gap (a door, a chest, spikes, a golem), or the theme fills the
 * room (ice, archers).
 */
export function buildThemedGrid(rng: Rng, d: number, theme: Theme): string[] {
  const g: string[][] = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) =>
      x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.',
    ),
  );
  const start: Pos = [1 + rng.int(W - 2), H - 2 - rng.int(2)];
  let exit: Pos = [1 + rng.int(W - 2), 1 + rng.int(2)];
  for (let i = 0; i < 10 && manhattan(start, exit) < 6; i++)
    exit = [1 + rng.int(W - 2), 1 + rng.int(2)];
  const reserved = new Set([key(start), key(exit)]);
  const isFree = (x: number, y: number) => g[y]?.[x] === '.' && !reserved.has(key([x, y]));

  // Mixed days take two themes' worth of features.
  const parts: Theme[] =
    theme === 'mixed'
      ? pickTwo(rng, ['keys', 'ice', 'bombs', 'archers', 'spikes', 'treasure'])
      : [theme];

  // Dividers: full rows of wall with one or two gaps. The gaps are where the
  // theme's blockers go.
  const gaps: Pos[] = [];
  const rows = d > 0.45 && rng.next() < 0.7 ? [3, 6] : [3 + rng.int(3)];
  for (const y of rows) {
    if (y >= start[1] || y <= exit[1]) continue;
    const holes = rng.next() < 0.6 ? 1 : 2;
    const xs = new Set<number>();
    while (xs.size < holes) xs.add(1 + rng.int(W - 2));
    for (let x = 1; x < W - 1; x++) if (!xs.has(x)) g[y]![x] = '#';
    for (const x of xs) gaps.push([x, y]);
  }
  // A few short walls for shape, kept only if the stairs stay reachable.
  const interior: Pos[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) interior.push([x, y]);
  for (let i = 0; i < 1 + Math.round(d * 4); i++) {
    const [x0, y0] = rng.pick(interior);
    const horizontal = rng.next() < 0.5;
    const placed: Pos[] = [];
    for (let k = 0; k < 1 + rng.int(3); k++) {
      const x = x0 + (horizontal ? k : 0);
      const y = y0 + (horizontal ? 0 : k);
      if (!isFree(x, y) || gaps.some((p) => p[0] === x && p[1] === y)) break;
      g[y]![x] = '#';
      placed.push([x, y]);
    }
    if (!connected(g, start, exit)) for (const [x, y] of placed) g[y]![x] = '.';
  }

  const free = (avoidStart = 0): Pos | null => {
    const cells = interior.filter(
      ([x, y]) =>
        isFree(x, y) &&
        !gaps.some((p) => p[0] === x && p[1] === y) &&
        manhattan([x, y], start) > avoidStart,
    );
    return cells.length ? rng.pick(cells) : null;
  };
  const put = (glyph: string, n: number, avoidStart = 0) => {
    for (let i = 0; i < n; i++) {
      const c = free(avoidStart);
      if (c) g[c[1]]![c[0]] = glyph;
    }
  };
  /** The theme's blocker in a gap, or (no gaps) on a cell every route crosses. */
  const block = (glyph: string) => {
    const open = gaps.filter(([x, y]) => g[y]![x] === '.');
    const at = open.length ? rng.pick(open) : cutCell(g, rng, start, exit, reserved);
    if (at) g[at[1]]![at[0]] = glyph;
  };
  const enemy = (glyph: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const c = free(2);
      if (!c) continue;
      // archers never start in line with the die: turn 1 is never a forced hit
      if (glyph === 'a' && (c[0] === start[0] || c[1] === start[1])) continue;
      g[c[1]]![c[0]] = glyph;
    }
  };
  const foes = () => (rng.next() < 0.6 ? 'k' : 's');

  for (const part of parts) {
    switch (part) {
      case 'keys':
        block('|');
        if (gaps.length > 1 && rng.next() < 0.6) block('|');
        enemy(foes(), Math.round(d * 2 * rng.next()));
        put('^', rng.int(2));
        break;
      case 'treasure':
        block('$');
        if (rng.next() < 0.4) block(rng.next() < 0.5 ? '$' : '|');
        enemy(foes(), Math.round(d * 2 * rng.next()));
        break;
      case 'spikes':
        for (const [x, y] of gaps) if (g[y]![x] === '.') g[y]![x] = '^';
        put('^', 2 + Math.round(d * 5));
        if (rng.next() < 0.4) put('~', 1);
        enemy(foes(), Math.round(d * 1.5 * rng.next()));
        break;
      case 'ice': {
        // big patches of ice: a slide only stops at walls, floor and enemies
        for (let i = 0; i < 2 + Math.round(d * 3); i++) iceStrip(g, rng, reserved, 3 + rng.int(4));
        put('^', rng.int(3));
        enemy(rng.next() < 0.5 ? 's' : 'g', Math.round(d * 2 * rng.next()));
        break;
      }
      case 'bombs':
        block('g');
        enemy('g', Math.round(d * rng.next()));
        // a tight group: one Bomb in the middle gets them all
        cluster(g, rng, reserved, start, 2 + Math.round(d * 2 * rng.next()));
        break;
      case 'archers':
        enemy('a', 1 + Math.round(d * 2));
        enemy(foes(), Math.round(d * rng.next()));
        put('#', 1 + rng.int(3));
        break;
      case 'mixed':
        break;
    }
  }
  if (!connected(g, start, exit)) return []; // a blocker cut the room in two; try again
  g[start[1]]![start[0]] = '@';
  g[exit[1]]![exit[0]] = '>';
  return g.map((row) => row.join(''));
}

/**
 * Does this floor count? Returns a score (higher is better) when it meets
 * the bar, or null. The fewest-moves route (from the rating) must use the
 * theme.
 */
export function dailyQuality(
  rules: Rules,
  level: LevelData,
  rating: Rating,
  theme: Theme,
  bar: Bar,
): number | null {
  if (!rating.solvable) return null;
  const [lo, hi] = bar.band;
  if (rating.score < lo || rating.score > hi) return null;
  if (rating.noviceWinRate > bar.novice) return null;
  const walk = walkDistance(rules, level);
  const detour = rating.minMoves - walk;
  if (walk < 0 || detour < bar.detour) return null;
  if (!usesTheme(rules, level, rating.path, theme)) return null;
  return detour * 2 + (1 - rating.noviceWinRate) * 10 + rating.breadth;
}

function usesTheme(rules: Rules, level: LevelData, path: readonly Dir[], theme: Theme): boolean {
  const f = routeFacts(rules, level, path);
  const bomb = f.kills.some((k) => k.face === 'Bomb') || f.splashHits.length > 0;
  const uses: Record<Exclude<Theme, 'mixed'>, () => boolean> = {
    keys: () => f.doors > 0,
    treasure: () => f.chests > 0,
    spikes: () => f.shieldSpikeLandings > 0,
    ice: () => f.slides >= 2,
    bombs: () => bomb,
    // the arrows shape the route: without them it would be shorter
    archers: () => {
      if (!level.grid.some((r) => r.includes('a'))) return false;
      const p = parWithout(level, 'arrows');
      return p !== null && p < path.length;
    },
  };
  if (theme !== 'mixed') return uses[theme]();
  const cheap = [f.doors > 0, f.chests > 0, f.shieldSpikeLandings > 0, f.slides >= 2, bomb];
  return cheap.filter(Boolean).length >= 2;
}

/** Steps from the die to the stairs, ignoring everything but walls. */
export function walkDistance(rules: Rules, level: LevelData): number {
  const cells = level.grid.join('');
  const glyph = new Map(rules.tiles.all().map((t) => [t.glyph, t]));
  const start = cells.indexOf('@');
  const dist = new Map([[start, 0]]);
  const queue = [start];
  for (const c of queue) {
    if (cells[c] === '>') return dist.get(c)!;
    const x = c % W;
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ] as const) {
      const nx = x + dx;
      const ny = (c - x) / W + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      const t = glyph.get(cells[n]!);
      // enemies and the die stand on floor; doors and chests can be opened
      if (dist.has(n) || (t && !t.passable && !t.onLeadInto)) continue;
      dist.set(n, dist.get(c)! + 1);
      queue.push(n);
    }
  }
  return -1;
}

function pickTwo<T>(rng: Rng, items: readonly T[]): T[] {
  const a = rng.int(items.length);
  let b = rng.int(items.length - 1);
  if (b >= a) b++;
  return [items[a]!, items[b]!];
}

function iceStrip(g: string[][], rng: Rng, reserved: Set<string>, len: number): void {
  const x0 = 1 + rng.int(W - 2);
  const y0 = 1 + rng.int(H - 2);
  const horizontal = rng.next() < 0.6;
  for (let k = 0; k < len; k++) {
    const x = x0 + (horizontal ? k : 0);
    const y = y0 + (horizontal ? 0 : k);
    if (x > W - 2 || y > H - 2) break;
    if (g[y]![x] === '.' && !reserved.has(key([x, y]))) g[y]![x] = '=';
  }
}

/** Skeletons and slimes side by side, away from the start. */
function cluster(g: string[][], rng: Rng, reserved: Set<string>, start: Pos, n: number): void {
  for (let tries = 0; tries < 12; tries++) {
    const x = 1 + rng.int(W - 2);
    const y = 1 + rng.int(H - 2);
    if (manhattan([x, y], start) < 4) continue;
    const cells: Pos[] = [
      [x, y],
      [x + 1, y],
      [x - 1, y],
      [x, y - 1],
    ];
    const ok = cells
      .slice(0, n)
      .filter(([cx, cy]) => g[cy]?.[cx] === '.' && !reserved.has(key([cx, cy])));
    if (ok.length < Math.min(n, 2)) continue;
    for (const [cx, cy] of ok) g[cy]![cx] = rng.next() < 0.7 ? 'k' : 's';
    return;
  }
}

/** A floor cell every route from start to exit crosses, if there is one. */
function cutCell(
  g: string[][],
  rng: Rng,
  start: Pos,
  exit: Pos,
  reserved: Set<string>,
): Pos | null {
  const cands: Pos[] = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (g[y]![x] !== '.' || reserved.has(key([x, y]))) continue;
      g[y]![x] = '#';
      if (!connected(g, start, exit)) cands.push([x, y]);
      g[y]![x] = '.';
    }
  return cands.length ? rng.pick(cands) : null;
}

/** Start and exit connected, treating doors, chests and enemies as passable. */
function connected(g: string[][], a: Pos, b: Pos): boolean {
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
      const n: Pos = [x + dx, y + dy];
      const c = g[n[1]]?.[n[0]];
      if (c === undefined || c === '#' || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return false;
}
