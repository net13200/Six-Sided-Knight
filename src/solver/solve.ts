/**
 * Solvers over full game states (position, orientation, HP, enemies, changed
 * tiles). Two algorithms, both optimal and both bounded by a node budget:
 *
 * - bfs:     breadth-first; best for short puzzles, finds every optimal length.
 * - idastar: iterative-deepening A* with a transposition table; low memory,
 *            guided by the distance to the nearest exit (admissible because
 *            one action moves the die at most one tile).
 *
 * States are de-duplicated by a compact key (see StateEncoder): small
 * integers packed into a string, so building and hashing a key is cheap.
 */
import { DIRS, step, type Dir, type GameState, type Rules } from '../engine';

export interface SolveOptions {
  /** Maximum states to expand before giving up (default 200k). */
  readonly maxNodes?: number;
  /** States failing this are pruned (e.g. "no damage taken"). */
  readonly allow?: (s: GameState) => boolean;
  /** A winning state must also satisfy this (e.g. "all treasure collected"). */
  readonly accept?: (s: GameState) => boolean;
  /** Extra value mixed into the state key when `accept` depends on something the key omits. */
  readonly keyExtra?: (s: GameState) => number;
  readonly algorithm?: 'bfs' | 'idastar';
}

export interface SolveResult {
  readonly status: 'solved' | 'unsolvable' | 'budget';
  readonly moves: number;
  readonly path: readonly Dir[];
  /** States expanded. */
  readonly nodes: number;
  /** Distinct states seen (search breadth). */
  readonly seen: number;
}

/**
 * Packs the parts of a state that affect the future into a short string.
 * Tiles are stored as a diff against the start (most never change), and all
 * ids are mapped to small integers once per solve.
 */
export class StateEncoder {
  private readonly tileIndex = new Map<string, number>();
  private readonly effectIndex = new Map<string, number>();
  private readonly base: readonly string[];

  constructor(rules: Rules, start: GameState) {
    rules.tiles.all().forEach((t, i) => this.tileIndex.set(t.id, i));
    rules.effects.all().forEach((e, i) => this.effectIndex.set(e.id, i));
    this.base = start.tiles;
  }

  key(s: GameState, extra = 0): string {
    const p = s.player;
    const out: number[] = [
      p.y * s.width + p.x,
      p.die.orient,
      p.hp,
      extra & 0xffff,
      s.rng & 0xffff,
      s.rng >>> 16,
    ];
    for (const e of s.enemies) {
      out.push(0xfffe, e.id, e.y * s.width + e.x, e.hp);
      for (const k in e.data) {
        const v = e.data[k];
        out.push(typeof v === 'boolean' ? Number(v) : (v as number) & 0xffff);
      }
      for (const f of e.effects) out.push(this.effectIndex.get(f.id) ?? 0, f.turns);
    }
    out.push(0xffff);
    const tiles = s.tiles;
    if (tiles !== this.base) {
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] !== this.base[i]) out.push(i, this.tileIndex.get(tiles[i]!) ?? 0);
      }
    }
    return String.fromCharCode(...out);
  }
}

/** Manhattan distance from the die to the nearest goal tile (admissible heuristic). */
export function goalDistance(rules: Rules, s: GameState): number {
  let best = Infinity;
  for (let i = 0; i < s.tiles.length; i++) {
    if (!rules.tiles.get(s.tiles[i]!).goal) continue;
    const x = i % s.width;
    const y = (i - x) / s.width;
    best = Math.min(best, Math.abs(x - s.player.x) + Math.abs(y - s.player.y));
  }
  return best === Infinity ? 0 : best;
}

/**
 * Admissible heuristic for levels where one action can carry the die several
 * tiles in a straight line (ice): the fewest straight-line segments from each
 * tile to a goal, over tiles the die could ever cross (doors and chests count
 * as open). Returns null when no tile carries, so plain Manhattan is used.
 */
export function segmentDistances(rules: Rules, s: GameState): Int16Array | null {
  const defs = s.tiles.map((t) => rules.tiles.get(t));
  if (!defs.some((d) => d.carries)) return null;
  const w = s.width;
  const h = s.height;
  const open = defs.map((d) => d.passable || d.onLeadInto !== undefined);
  const dist = new Int16Array(w * h).fill(-1);
  const queue: number[] = [];
  defs.forEach((d, i) => {
    if (d.goal) {
      dist[i] = 0;
      queue.push(i);
    }
  });
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
      for (let x = cx + dx, y = cy + dy; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) {
        const i = y * w + x;
        if (!open[i]) break;
        if (dist[i] === -1) {
          dist[i] = dist[cur]! + 1;
          queue.push(i);
        }
      }
    }
  }
  return dist;
}

export function solve(rules: Rules, start: GameState, opts: SolveOptions = {}): SolveResult {
  return opts.algorithm === 'idastar'
    ? solveIdaStar(rules, start, opts)
    : solveBfs(rules, start, opts);
}

function solveBfs(rules: Rules, start: GameState, opts: SolveOptions): SolveResult {
  const maxNodes = opts.maxNodes ?? 200_000;
  const allow = opts.allow ?? (() => true);
  const accept = opts.accept ?? (() => true);
  const extra = opts.keyExtra ?? (() => 0);
  const enc = new StateEncoder(rules, start);

  // Parent pointers in flat arrays: node i came from parent[i] via dir[i].
  const parent: number[] = [-1];
  const dirOf: Dir[] = ['N'];
  const seen = new Set<string>([enc.key(start, extra(start))]);
  let frontier: Array<[GameState, number]> = [[start, 0]];
  let nodes = 0;

  const pathTo = (node: number, last: Dir): Dir[] => {
    const path: Dir[] = [last];
    for (let n = node; n > 0; n = parent[n]!) path.push(dirOf[n]!);
    return path.reverse();
  };

  while (frontier.length) {
    const next: Array<[GameState, number]> = [];
    for (const [s, node] of frontier) {
      if (++nodes > maxNodes)
        return { status: 'budget', moves: -1, path: [], nodes, seen: seen.size };
      for (const dir of DIRS) {
        const r = step(rules, s, { type: 'move', dir });
        if (!r.consumed) continue;
        const ns = r.state;
        if (ns.status === 'won') {
          if (allow(ns) && accept(ns)) {
            const path = pathTo(node, dir);
            return { status: 'solved', moves: path.length, path, nodes, seen: seen.size };
          }
          continue;
        }
        if (ns.status === 'lost' || !allow(ns)) continue;
        const k = enc.key(ns, extra(ns));
        if (seen.has(k)) continue;
        seen.add(k);
        parent.push(node);
        dirOf.push(dir);
        next.push([ns, parent.length - 1]);
      }
    }
    frontier = next;
  }
  return { status: 'unsolvable', moves: -1, path: [], nodes, seen: seen.size };
}

function solveIdaStar(rules: Rules, start: GameState, opts: SolveOptions): SolveResult {
  const maxNodes = opts.maxNodes ?? 200_000;
  const allow = opts.allow ?? (() => true);
  const accept = opts.accept ?? (() => true);
  const extra = opts.keyExtra ?? (() => 0);
  const enc = new StateEncoder(rules, start);
  let nodes = 0;
  let budgetHit = false;
  const path: Dir[] = [];
  // Best depth at which each state was reached in the current iteration.
  let table = new Map<string, number>();
  let seenTotal = 0;
  // Ice can move the die several tiles per action: then count straight segments instead.
  const segments = segmentDistances(rules, start);
  const h = (s: GameState): number => {
    if (!segments) return goalDistance(rules, s);
    const d = segments[s.player.y * s.width + s.player.x]!;
    return d < 0 ? 0 : d;
  };

  const search = (s: GameState, g: number, bound: number): number | 'found' => {
    const f = g + h(s);
    if (f > bound) return f;
    if (++nodes > maxNodes) {
      budgetHit = true;
      return Infinity;
    }
    let min = Infinity;
    for (const dir of DIRS) {
      const r = step(rules, s, { type: 'move', dir });
      if (!r.consumed) continue;
      const ns = r.state;
      if (ns.status === 'won') {
        if (allow(ns) && accept(ns)) {
          path.push(dir);
          return 'found';
        }
        continue;
      }
      if (ns.status === 'lost' || !allow(ns)) continue;
      const k = enc.key(ns, extra(ns));
      const prev = table.get(k);
      if (prev !== undefined && prev <= g + 1) continue;
      table.set(k, g + 1);
      path.push(dir);
      const t = search(ns, g + 1, bound);
      if (t === 'found') return 'found';
      path.pop();
      if (budgetHit) return Infinity;
      if (t < min) min = t;
    }
    return min;
  };

  let bound = h(start);
  for (;;) {
    table = new Map([[enc.key(start, extra(start)), 0]]);
    const t = search(start, 0, bound);
    seenTotal = Math.max(seenTotal, table.size);
    if (t === 'found')
      return { status: 'solved', moves: path.length, path: [...path], nodes, seen: seenTotal };
    if (budgetHit) return { status: 'budget', moves: -1, path: [], nodes, seen: seenTotal };
    if (t === Infinity)
      return { status: 'unsolvable', moves: -1, path: [], nodes, seen: seenTotal };
    bound = t;
  }
}

export interface LevelAnalysis {
  /** Fewest moves to win at all. */
  readonly any: SolveResult;
  /** Fewest moves to win without taking damage. */
  readonly noDamage: SolveResult;
  /** Fewest moves to win with every treasure collected. */
  readonly allGold: SolveResult;
}

export function analyze(rules: Rules, start: GameState, maxNodes = 200_000): LevelAnalysis {
  return {
    any: solve(rules, start, { maxNodes }),
    noDamage: solve(rules, start, { maxNodes, allow: (s) => s.stats.damageTaken === 0 }),
    allGold: solve(rules, start, {
      maxNodes,
      accept: (s) => s.stats.treasuresCollected === s.stats.treasuresTotal,
      keyExtra: (s) => s.stats.treasuresCollected,
    }),
  };
}
