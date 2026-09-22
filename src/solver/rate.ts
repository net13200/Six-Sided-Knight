/**
 * Difficulty rater. Combines what the solver learns about a level with how
 * a naive player fares on it:
 *
 * - minMoves:  length of the optimal solution
 * - breadth:   log2 of the states a breadth-first search expands before
 *              solving (how much there is to consider)
 * - novice:    share of seeded "novice" playouts that win. A novice heads
 *              for the exit most of the time and wanders otherwise; this
 *              captures traps and face-orientation puzzles the search
 *              numbers miss.
 * - enemies:   enemy count at the start
 *
 * The score is a weighted sum, clamped to 0-100. Weights were tuned so the
 * tutorial levels land roughly 10-60, leaving headroom for generated
 * levels; see tests/unit/rate.test.ts.
 */
import { DIRS, rngNext, step, type Dir, type GameState, type Rules } from '../engine';
import { solve } from './solve';

export interface Rating {
  readonly score: number;
  readonly solvable: boolean;
  readonly minMoves: number;
  readonly breadth: number;
  readonly noviceWinRate: number;
  readonly enemies: number;
}

export const RATING_WEIGHTS = { moves: 1, breadth: 1.8, novice: 25, enemies: 2 } as const;
/** Breadth below this (log2 nodes) counts as trivial. */
const BREADTH_FLOOR = 3;

const PLAYOUTS = 48;

export function rate(rules: Rules, start: GameState, maxNodes = 20_000): Rating {
  const best = solve(rules, start, { maxNodes: maxNodes * 3, algorithm: 'idastar' });
  if (best.status !== 'solved') {
    return {
      score: 100,
      solvable: false,
      minMoves: -1,
      breadth: 0,
      noviceWinRate: 0,
      enemies: start.enemies.length,
    };
  }
  const bfs = solve(rules, start, { maxNodes });
  const breadth = exactLog2((bfs.status === 'solved' ? bfs.nodes : maxNodes) + 1);
  const noviceWinRate = novicePlayouts(rules, start, best.moves);
  const w = RATING_WEIGHTS;
  const raw =
    w.moves * best.moves +
    w.breadth * Math.max(0, breadth - BREADTH_FLOOR) +
    w.novice * (1 - noviceWinRate) +
    w.enemies * start.enemies.length;
  return {
    score: Math.round(Math.max(0, Math.min(100, raw))),
    solvable: true,
    minMoves: best.moves,
    breadth,
    noviceWinRate,
    enemies: start.enemies.length,
  };
}

/**
 * log2 using only integer ops and exact arithmetic: floor(log2 n) plus a
 * linear fraction. Math.log2 may differ in the last bit between JS engines,
 * which could make the "same for everyone" daily differ between browsers.
 */
export function exactLog2(n: number): number {
  const v = Math.max(1, Math.floor(n)) >>> 0;
  const k = 31 - Math.clz32(v);
  const base = 2 ** k;
  return k + (v - base) / base;
}

/** Seeded naive playouts; returns the fraction that reach the exit. */
export function novicePlayouts(
  rules: Rules,
  start: GameState,
  minMoves: number,
  runs = PLAYOUTS,
): number {
  const dist = exitDistances(rules, start);
  let seed = 0x9e3779b9 ^ start.tiles.length;
  const rand = () => {
    const r = rngNext(seed);
    seed = r.state;
    return r.value;
  };
  const limit = minMoves * 3 + 8;
  let wins = 0;
  for (let run = 0; run < runs; run++) {
    let s = start;
    for (let i = 0; i < limit && s.status === 'playing'; i++) {
      const options: Array<{ dir: Dir; state: GameState; d: number }> = [];
      for (const dir of DIRS) {
        const r = step(rules, s, { type: 'move', dir });
        if (r.consumed)
          options.push({
            dir,
            state: r.state,
            d: dist[r.state.player.y * s.width + r.state.player.x] ?? 99,
          });
      }
      if (options.length === 0) break;
      let pick = options[Math.floor(rand() * options.length)]!;
      if (rand() < 0.7) {
        const bestD = Math.min(...options.map((o) => o.d));
        const bests = options.filter((o) => o.d === bestD);
        pick = bests[Math.floor(rand() * bests.length)]!;
      }
      s = pick.state;
    }
    if (s.status === 'won') wins++;
  }
  return wins / runs;
}

/** Walking distance to the nearest exit, treating every passable-looking tile as walkable. */
function exitDistances(rules: Rules, s: GameState): Int16Array {
  const w = s.width;
  const n = s.tiles.length;
  const dist = new Int16Array(n).fill(99);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (rules.tiles.get(s.tiles[i]!).goal) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q]!;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= s.height) continue;
      const ni = ny * w + nx;
      const t = rules.tiles.get(s.tiles[ni]!);
      const walkable = t.passable || t.onLeadInto !== undefined; // doors and chests can open
      if (!walkable || dist[ni]! <= dist[cur]! + 1) continue;
      dist[ni] = dist[cur]! + 1;
      queue.push(ni);
    }
  }
  return dist;
}
