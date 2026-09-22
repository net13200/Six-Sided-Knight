/**
 * Breadth-first solver over full game states. Finds the minimum number of
 * moves to win, optionally under a constraint (no damage, all gold).
 * Milestone 4 replaces the string keys with packed hashes and adds IDA*.
 */
import { DIRS, step, type Dir, type GameState, type Rules } from '../engine';

export interface SolveOptions {
  /** Maximum states to expand before giving up. */
  readonly maxNodes?: number;
  /** States failing this are dropped (e.g. "no damage taken"). */
  readonly allow?: (s: GameState) => boolean;
  /** A winning state must also satisfy this (e.g. "all treasure collected"). */
  readonly accept?: (s: GameState) => boolean;
}

export interface SolveResult {
  readonly status: 'solved' | 'unsolvable' | 'budget';
  readonly moves: number;
  readonly path: readonly Dir[];
  readonly nodes: number;
}

/** Identifies a state for de-duplication (tiles encoded as a diff against the start). */
export function stateKey(s: GameState, baseTiles: readonly string[]): string {
  const p = s.player;
  let key = `${p.x},${p.y},${p.die.orient},${p.hp},${s.stats.damageTaken > 0 ? 1 : 0},${s.stats.treasuresCollected}|`;
  for (const e of s.enemies) {
    key += `${e.id}:${e.x},${e.y},${e.hp}`;
    for (const k in e.data) key += `,${String(e.data[k])}`;
    for (const f of e.effects) key += `,${f.id}${f.turns}`;
    key += ';';
  }
  key += '|';
  for (let i = 0; i < s.tiles.length; i++)
    if (s.tiles[i] !== baseTiles[i]) key += `${i}=${s.tiles[i]},`;
  return key;
}

export function solve(rules: Rules, start: GameState, opts: SolveOptions = {}): SolveResult {
  const maxNodes = opts.maxNodes ?? 200_000;
  const allow = opts.allow ?? (() => true);
  const accept = opts.accept ?? (() => true);
  const base = start.tiles;
  const parent = new Map<string, { prev: string | null; dir: Dir | null }>();
  const k0 = stateKey(start, base);
  parent.set(k0, { prev: null, dir: null });
  let frontier: Array<[GameState, string]> = [[start, k0]];
  let nodes = 0;

  const pathTo = (key: string, last: Dir): Dir[] => {
    const path: Dir[] = [last];
    for (let k: string | null = key; k;) {
      const node: { prev: string | null; dir: Dir | null } = parent.get(k)!;
      if (node.dir) path.push(node.dir);
      k = node.prev;
    }
    return path.reverse();
  };

  while (frontier.length) {
    const next: Array<[GameState, string]> = [];
    for (const [s, key] of frontier) {
      if (++nodes > maxNodes) return { status: 'budget', moves: -1, path: [], nodes };
      for (const dir of DIRS) {
        const r = step(rules, s, { type: 'move', dir });
        if (!r.consumed) continue;
        const ns = r.state;
        if (ns.status === 'won') {
          if (allow(ns) && accept(ns)) {
            const path = pathTo(key, dir);
            return { status: 'solved', moves: path.length, path, nodes };
          }
          continue;
        }
        if (ns.status === 'lost' || !allow(ns)) continue;
        const nk = stateKey(ns, base);
        if (parent.has(nk)) continue;
        parent.set(nk, { prev: key, dir });
        next.push([ns, nk]);
      }
    }
    frontier = next;
  }
  return { status: 'unsolvable', moves: -1, path: [], nodes };
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
    }),
  };
}
