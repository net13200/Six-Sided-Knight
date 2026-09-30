/**
 * The world map's layout: Oddmere as one tall board the die rolls across.
 * Each chapter is a district (a band of rows), stacked from the village at
 * the bottom to the Well at the top. Levels are pedestals joined by a road of
 * tiles; landmarks (the Smith, the Daily Roll's notice board, the Well and
 * the Greenwood) hang off side roads. Pure data, so it's unit tested.
 */
import type { Dir } from '../../engine';

/** World width in tiles (the stage is 340 wide: 10 tiles of 34; the road uses 1..9). */
export const COLS = 10;
export const TILE = 34;
/** Rows per district: a wall, then the road climbing ten rows. */
export const BAND_ROWS = 12;
/** Rows above the last district: the Well and the Greenwood. */
export const TOP_ROWS = 4;

export interface Pos {
  readonly c: number;
  readonly r: number;
}

export type LandmarkId = 'smith' | 'daily' | 'well' | 'greenwood';

export interface Landmark {
  readonly id: LandmarkId;
  /** The tile the die stands on to use it. */
  readonly pos: Pos;
  /** Road from the main road to `pos` (excluding `pos`). */
  readonly road: readonly Pos[];
  /** Open from the start, or once the campaign is beaten. */
  readonly when: 'always' | 'campaign';
}

export interface Band {
  readonly chapter: number;
  /** First (top) row of the district. */
  readonly top: number;
}

export interface WorldLayout {
  readonly rows: number;
  readonly bands: readonly Band[];
  readonly pedestals: readonly Pos[];
  /** segments[i]: the road leading into pedestal i (endpoints excluded); segments[0] is empty. */
  readonly segments: readonly (readonly Pos[])[];
  readonly landmarks: readonly Landmark[];
}

export const key = (p: Pos): string => `${p.c},${p.r}`;

/** Tiles strictly between a and b, going along a's row first (or its column first). */
function between(a: Pos, b: Pos, columnFirst = false): Pos[] {
  const out: Pos[] = [];
  let c = a.c;
  let r = a.r;
  const across = () => {
    while (c !== b.c) {
      c += c < b.c ? 1 : -1;
      out.push({ c, r });
    }
  };
  const down = () => {
    while (r !== b.r) {
      r += r < b.r ? 1 : -1;
      out.push({ c, r });
    }
  };
  if (columnFirst) {
    down();
    across();
  } else {
    across();
    down();
  }
  out.pop(); // b itself
  return out;
}

/**
 * Each district's road is a switchback climbing across the board: from level
 * to level it goes one stone up (N) or one stone across (h), four times across
 * and five times up, so the ten levels cross from one side to the other. The
 * next district starts right above, through a gap in the wall, and crosses
 * back (odd districts are mirrored), so the whole road zigzags up the island.
 * It only ever goes up or across, so no two levels are ever next to each
 * other except along the road.
 */
const PATTERNS = ['NhNhNhNhN', 'NNhNhhNhN', 'NhhNNhNhN'];

export function buildWorld(levelCount: number, chapterSize = 10): WorldLayout {
  const chapters = Math.max(1, Math.ceil(levelCount / chapterSize));
  // Three more rows at the bottom: the village, below the first district.
  const rows = TOP_ROWS + chapters * BAND_ROWS + 3;
  const bandTop = (ch: number) => TOP_ROWS + (chapters - 1 - ch) * BAND_ROWS;
  const bands = Array.from({ length: chapters }, (_, ch) => ({ chapter: ch, top: bandTop(ch) }));
  const pedestals: Pos[] = [];
  let c = 1;
  let r = 0;
  for (let i = 0; i < levelCount; i++) {
    const ch = Math.floor(i / chapterSize);
    const j = i % chapterSize;
    const across = ch % 2 ? -2 : 2;
    if (j === 0) r = bandTop(ch) + BAND_ROWS - 1;
    else if (PATTERNS[ch % PATTERNS.length]![j - 1] === 'h') c += across;
    else r -= 2;
    pedestals.push({ c, r });
  }
  const segments: Pos[][] = pedestals.map((p, i) => (i === 0 ? [] : between(pedestals[i - 1]!, p)));

  // Side roads from level 1 (both open from the start): the notice board
  // beside it, the Smith below, in the village.
  const first = pedestals[0] ?? { c: 1, r: rows - 4 };
  const dailyAt = { c: first.c + 2, r: first.r };
  const dailyRoad = [{ c: first.c + 1, r: first.r }];
  const smithAt = { c: first.c, r: first.r + 2 };
  const smithRoad = [{ c: first.c, r: first.r + 1 }];
  // The Well crowns the world, past the last level; the Greenwood beyond it.
  const last = pedestals[pedestals.length - 1] ?? first;
  const well = { c: 5, r: TOP_ROWS - 1 };
  const wellRoad = between(last, well, true);
  const greenwood = { c: 8, r: TOP_ROWS - 3 };
  const greenRoad = between(well, greenwood);
  const landmarks: Landmark[] = [
    { id: 'smith', pos: smithAt, road: smithRoad, when: 'always' },
    { id: 'daily', pos: dailyAt, road: dailyRoad, when: 'always' },
    { id: 'well', pos: well, road: wellRoad, when: 'campaign' },
    { id: 'greenwood', pos: greenwood, road: [well, ...greenRoad], when: 'campaign' },
  ];
  return { rows, bands, pedestals, segments, landmarks };
}

const STEP: Readonly<Record<Dir, readonly [number, number]>> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};

export function stepFrom(p: Pos, d: Dir): Pos {
  return { c: p.c + STEP[d][0], r: p.r + STEP[d][1] };
}

/** Shortest walk over `open` tiles from `from` to `to`, as directions; null if none. */
export function findPath(open: ReadonlySet<string>, from: Pos, to: Pos): Dir[] | null {
  const goal = key(to);
  const start = key(from);
  if (start === goal) return [];
  const prev = new Map<string, [string, Dir]>();
  const queue: Pos[] = [from];
  const seen = new Set([start]);
  while (queue.length) {
    const p = queue.shift()!;
    for (const d of ['N', 'E', 'S', 'W'] as const) {
      const q = stepFrom(p, d);
      const k = key(q);
      if (seen.has(k) || !open.has(k)) continue;
      seen.add(k);
      prev.set(k, [key(p), d]);
      if (k === goal) {
        const path: Dir[] = [];
        let at = k;
        while (at !== start) {
          const [back, dir] = prev.get(at)!;
          path.unshift(dir);
          at = back;
        }
        return path;
      }
      queue.push(q);
    }
  }
  return null;
}

/**
 * The open tile nearest to `p` (a tap on grass, scenery or a locked level):
 * closest by straight-line distance, then by how far the die would roll.
 */
export function nearestOpen(open: ReadonlySet<string>, p: Pos, from: Pos): Pos | null {
  let best: Pos | null = null;
  let bestD = Infinity;
  let bestWalk = Infinity;
  for (const k of open) {
    const [c, r] = k.split(',').map(Number) as [number, number];
    const d = Math.hypot(c - p.c, r - p.r);
    if (d > bestD + 1e-9) continue;
    const walk = Math.abs(c - from.c) + Math.abs(r - from.r);
    if (d < bestD - 1e-9 || walk < bestWalk) {
      best = { c, r };
      bestD = d;
      bestWalk = walk;
    }
  }
  return best;
}
