/**
 * Eight-Sided Ranger (bonus chapter): the rules. A d8 (an octahedron) rolls
 * on a grid of triangles. Pure and deterministic, like the Knight's engine,
 * but its own small module: the board isn't made of squares.
 *
 * The board: `width` triangles per row, `height` rows. Cell (x, y) points up
 * when (x + y) is even. Every cell has three edges, so three moves: left (W)
 * and right (E) stay in the row; the flat edge leads down (S) from an up
 * triangle and up (N) from a down triangle.
 *
 * Rows are straight lines: the Bow shoots along the row, Boots leap along it
 * and the Rope swings along it.
 */
import { getShape, registerShape, type DieShapeDef } from '../engine/dice';
import type { Dir } from '../engine/types';

// ---------- the die ----------

/** Slots: top, bottom, the three lower faces at the cell's edges, and the three upper faces. */
const T = 0,
  B = 1,
  L = 2,
  R = 3,
  V = 4,
  OL = 5,
  OR = 6,
  OV = 7;

/** `table[newSlot] = oldSlot`. */
function table(assign: Readonly<Record<number, number>>): number[] {
  return Array.from({ length: 8 }, (_, slot) => assign[slot]!);
}

/**
 * The octahedron. The lower faces (neighbours of the bottom) sit at the
 * cell's left, right and flat edges and are the ones that lead a roll; each
 * upper face `oX` is the one opposite lower face X. Rolling across an edge
 * tips that edge's face down; the upper face at each end of the edge becomes
 * the new face on the edge that shares that corner.
 */
export const D8: DieShapeDef = {
  id: 'd8',
  slots: ['top', 'bottom', 'left', 'right', 'flat', 'upperLeft', 'upperRight', 'upperFlat'],
  top: T,
  bottom: B,
  leading: { W: L, E: R, N: V, S: V },
  roll: {
    W: table({ [B]: L, [R]: B, [L]: OR, [V]: OV, [T]: OL, [OL]: R, [OR]: T, [OV]: V }),
    E: table({ [B]: R, [L]: B, [R]: OL, [V]: OV, [T]: OR, [OR]: L, [OL]: T, [OV]: V }),
    N: table({ [B]: V, [V]: B, [L]: OR, [R]: OL, [T]: OV, [OL]: R, [OR]: L, [OV]: T }),
    S: table({ [B]: V, [V]: B, [L]: OR, [R]: OL, [T]: OV, [OL]: R, [OR]: L, [OV]: T }),
  },
};
registerShape(D8);

const DIR_INDEX: Readonly<Record<Dir, number>> = { N: 0, E: 1, S: 2, W: 3 };

export function roll(orient: number, dir: Dir): number {
  return getShape('d8').next[orient * 4 + DIR_INDEX[dir]]!;
}

/** The face in a slot for this orientation. */
export function faceAt(loadout: readonly string[], orient: number, slot: number): string {
  return loadout[getShape('d8').perms[orient]![slot]!]!;
}

export const SLOT = { top: T, bottom: B, left: L, right: R, flat: V } as const;

export function leading(loadout: readonly string[], orient: number, dir: Dir): string {
  return faceAt(loadout, orient, D8.leading[dir]);
}

// ---------- the board ----------

export type Tile = 'grass' | 'tree' | 'water' | 'exit' | 'post' | 'spring' | 'snare';

export const TILE_GLYPH: Readonly<Record<string, Tile>> = {
  '.': 'grass',
  '#': 'tree',
  '~': 'water',
  '>': 'exit',
  P: 'post',
  '+': 'spring',
  x: 'snare',
};

/** Tiles the die and the wolves can stand on. */
export function walkable(t: Tile): boolean {
  return t === 'grass' || t === 'exit' || t === 'spring' || t === 'snare';
}

/** Tiles an arrow (or a line of sight) passes over. */
export function seeThrough(t: Tile): boolean {
  return walkable(t) || t === 'water';
}

export const isUp = (x: number, y: number): boolean => (x + y) % 2 === 0;

/** The neighbour across an edge, or null when that edge isn't there (N from an up cell, S from a down cell). */
export function neighbor(x: number, y: number, dir: Dir): { x: number; y: number } | null {
  if (dir === 'E') return { x: x + 1, y };
  if (dir === 'W') return { x: x - 1, y };
  if (dir === 'S') return isUp(x, y) ? { x, y: y + 1 } : null;
  return isUp(x, y) ? null : { x, y: y - 1 };
}

/** The three moves possible from a cell. */
export function movesFrom(x: number, y: number): Dir[] {
  return isUp(x, y) ? ['W', 'E', 'S'] : ['W', 'E', 'N'];
}

// ---------- state ----------

export type EnemyKind = 'wolf' | 'stag';

export interface REnemy {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  /** Turns left caught in a snare. */
  readonly snared: number;
}

export interface RLevel {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly Tile[];
  readonly start: { readonly x: number; readonly y: number };
  readonly enemies: readonly Omit<REnemy, 'id' | 'snared'>[];
  readonly loadout: readonly string[];
  readonly par?: number;
  readonly hint?: string;
  readonly teaches?: readonly string[];
}

export interface RState {
  readonly level: RLevel;
  readonly tiles: readonly Tile[];
  readonly x: number;
  readonly y: number;
  readonly orient: number;
  readonly hp: number;
  readonly enemies: readonly REnemy[];
  readonly moves: number;
  readonly status: 'playing' | 'won' | 'lost';
}

export const MAX_HP = 3;
export const ENEMY_HP: Readonly<Record<EnemyKind, number>> = { wolf: 2, stag: 3 };
export const SNARE_TURNS = 3;

export function startState(level: RLevel): RState {
  return {
    level,
    tiles: level.tiles,
    x: level.start.x,
    y: level.start.y,
    orient: 0,
    hp: MAX_HP,
    enemies: level.enemies.map((e, i) => ({ ...e, id: i + 1, snared: 0 })),
    moves: 0,
    status: 'playing',
  };
}

export function tileAt(s: Pick<RState, 'tiles' | 'level'>, x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= s.level.width || y >= s.level.height) return null;
  return s.tiles[y * s.level.width + x]!;
}

const enemyAt = (s: RState, x: number, y: number) => s.enemies.find((e) => e.x === x && e.y === y);

/** The top face is the Cloak: nobody can see you. */
export function hidden(s: RState): boolean {
  return faceAt(s.level.loadout, s.orient, T) === 'Cloak';
}

// ---------- events (for animation and sound) ----------

export type REvent =
  | { type: 'moved'; from: Pos; to: Pos; dir: Dir; leap?: boolean; swing?: boolean }
  | { type: 'bumped'; dir: Dir }
  | { type: 'shot'; from: Pos; to: Pos; target: number }
  | { type: 'stabbed'; at: Pos; target: number }
  | { type: 'killed'; id: number; kind: EnemyKind; at: Pos }
  | { type: 'snareLaid'; at: Pos }
  | { type: 'snared'; id: number; at: Pos }
  | { type: 'enemyMoved'; id: number; from: Pos; to: Pos }
  | { type: 'bitten'; id: number; from: Pos }
  | { type: 'charged'; id: number; from: Pos }
  | { type: 'healed'; hp: number }
  | { type: 'won' }
  | { type: 'lost' };

interface Pos {
  readonly x: number;
  readonly y: number;
}

export interface RStep {
  readonly state: RState;
  readonly events: readonly REvent[];
  /** False for a bump: nothing happened and no turn passed. */
  readonly consumed: boolean;
}

// ---------- the turn ----------

/** Cells along the row from (x, y) in `dir` (E or W), up to `max` of them. */
function* along(s: RState, x: number, y: number, dir: 'E' | 'W', max = 99) {
  const dx = dir === 'E' ? 1 : -1;
  for (let i = 1; i <= max; i++) {
    const t = tileAt(s, x + dx * i, y);
    if (t === null) return;
    yield { x: x + dx * i, y, t, i };
  }
}

function hurt(
  enemies: REnemy[],
  id: number,
  dmg: number,
  events: REvent[],
  kind: EnemyKind,
  at: Pos,
): void {
  const i = enemies.findIndex((e) => e.id === id);
  const e = enemies[i]!;
  if (e.hp - dmg <= 0) {
    enemies.splice(i, 1);
    events.push({ type: 'killed', id, kind, at });
  } else enemies[i] = { ...e, hp: e.hp - dmg };
}

export function step(s: RState, dir: Dir): RStep {
  const bump: RStep = { state: s, events: [{ type: 'bumped', dir }], consumed: false };
  if (s.status !== 'playing') return bump;
  const n = neighbor(s.x, s.y, dir);
  if (!n) return bump;
  const t = tileAt(s, n.x, n.y);
  if (t === null) return bump;
  const face = leading(s.level.loadout, s.orient, dir);
  const events: REvent[] = [];
  const enemies = [...s.enemies];
  let tiles = s.tiles;
  let { x, y, orient, hp } = s;
  const row = dir === 'E' || dir === 'W' ? dir : null;
  const target = enemyAt(s, n.x, n.y);
  let acted = false;

  if (target) {
    // Into an enemy: the Knife stabs, the Bow shoots point-blank, Boots leap over it.
    if (face === 'Knife' || face === 'Bow') {
      const dmg = face === 'Knife' ? 2 : 1;
      events.push(
        face === 'Knife'
          ? { type: 'stabbed', at: n, target: target.id }
          : { type: 'shot', from: { x, y }, to: n, target: target.id },
      );
      hurt(enemies, target.id, dmg, events, target.kind, n);
      acted = true;
    }
  } else if (face === 'Bow' && row) {
    // An arrow along the row, over grass and water, to the first thing in the way.
    for (const c of along(s, x, y, row)) {
      const e = enemyAt(s, c.x, c.y);
      if (e) {
        events.push({ type: 'shot', from: { x, y }, to: c, target: e.id });
        hurt(enemies, e.id, 1, events, e.kind, c);
        acted = true;
        break;
      }
      if (!seeThrough(c.t)) break;
    }
  } else if (face === 'Rope' && row) {
    // Swing to a post along the row (2-5 cells away), over water: the die doesn't roll.
    let prev: Pos | null = null;
    for (const c of along(s, x, y, row, 5)) {
      if (c.t === 'post') {
        if (
          c.i >= 2 &&
          prev &&
          walkable(tileAt(s, prev.x, prev.y)!) &&
          !enemyAt(s, prev.x, prev.y)
        ) {
          events.push({ type: 'moved', from: { x, y }, to: prev, dir, swing: true });
          x = prev.x;
          y = prev.y;
          acted = true;
        }
        break;
      }
      if (!seeThrough(c.t) || enemyAt(s, c.x, c.y)) break;
      prev = c;
    }
  }

  if (!acted && face === 'Boots' && row && t !== 'tree' && t !== 'post') {
    // Leap over the next cell (grass, water, an enemy, a snare) and roll twice.
    const far = { x: n.x + (row === 'E' ? 1 : -1), y };
    const ft = tileAt(s, far.x, far.y);
    if (ft && walkable(ft) && !enemyAt(s, far.x, far.y)) {
      events.push({ type: 'moved', from: { x, y }, to: far, dir, leap: true });
      orient = roll(roll(orient, dir), dir);
      x = far.x;
      y = far.y;
      acted = true;
    }
  }

  if (!acted) {
    if (target || !walkable(t)) return bump;
    events.push({ type: 'moved', from: { x, y }, to: n, dir });
    orient = roll(orient, dir);
    x = n.x;
    y = n.y;
  }

  // Landing (only if the die moved).
  const moved = x !== s.x || y !== s.y;
  if (moved) {
    const under = tileAt(s, x, y)!;
    const bottom = faceAt(s.level.loadout, orient, B);
    if (bottom === 'Trap' && under === 'grass') {
      tiles = tiles.map((tt, i) => (i === y * s.level.width + x ? 'snare' : tt));
      events.push({ type: 'snareLaid', at: { x, y } });
    }
    if (bottom === 'Herb' && under === 'spring' && hp < MAX_HP) {
      hp += 1;
      events.push({ type: 'healed', hp });
    }
  }

  let next: RState = { ...s, tiles, x, y, orient, hp, enemies, moves: s.moves + 1 };
  if (tileAt(next, x, y) === 'exit') {
    events.push({ type: 'won' });
    return { state: { ...next, status: 'won' }, events, consumed: true };
  }
  next = enemyPhase(next, events);
  return { state: next, events, consumed: true };
}

// ---------- enemies ----------

function enemyPhase(s: RState, events: REvent[]): RState {
  let { tiles, hp } = s;
  const enemies = [...s.enemies];
  const unseen = hidden(s);
  for (let k = 0; k < enemies.length; k++) {
    const e = enemies[k]!;
    if (e.snared > 0) {
      enemies[k] = { ...e, snared: e.snared - 1 };
      continue;
    }
    if (unseen) continue;
    const cur: RState = { ...s, tiles, enemies, hp };
    if (e.kind === 'stag') {
      if (e.y === s.y && clearRow(cur, e, s.x)) {
        hp -= 1;
        events.push({ type: 'charged', id: e.id, from: { x: e.x, y: e.y } });
      }
    } else if (adjacent(e.x, e.y, s.x, s.y)) {
      hp -= 1;
      events.push({ type: 'bitten', id: e.id, from: { x: e.x, y: e.y } });
    } else {
      const to = chase(cur, e);
      if (to) {
        events.push({ type: 'enemyMoved', id: e.id, from: { x: e.x, y: e.y }, to });
        const onSnare = tileAt(cur, to.x, to.y) === 'snare';
        enemies[k] = { ...e, x: to.x, y: to.y, snared: onSnare ? SNARE_TURNS : 0 };
        if (onSnare) {
          tiles = tiles.map((tt, i) => (i === to.y * s.level.width + to.x ? 'grass' : tt));
          events.push({ type: 'snared', id: e.id, at: to });
        }
      }
    }
    if (hp <= 0) {
      events.push({ type: 'lost' });
      return { ...s, tiles, enemies, hp: 0, status: 'lost' };
    }
  }
  return { ...s, tiles, enemies, hp };
}

export function adjacent(ax: number, ay: number, bx: number, by: number): boolean {
  if (ay === by) return Math.abs(ax - bx) === 1;
  if (ax !== bx || Math.abs(ay - by) !== 1) return false;
  // Vertical neighbours share the flat edge: the upper one points up.
  const top = ay < by ? { x: ax, y: ay } : { x: bx, y: by };
  return isUp(top.x, top.y);
}

/** Nothing solid (or another enemy) between an enemy and column `px` in its row. */
function clearRow(s: RState, e: REnemy, px: number): boolean {
  const dir = px > e.x ? 1 : -1;
  for (let x = e.x + dir; x !== px; x += dir) {
    const t = tileAt(s, x, e.y)!;
    if (!seeThrough(t) || enemyAt(s, x, e.y)) return false;
  }
  return true;
}

/** A wolf's step: the neighbour closest to the die (breadth-first), ties in N, E, S, W order. */
function chase(s: RState, e: REnemy): Pos | null {
  const w = s.level.width;
  const dist = new Int16Array(w * s.level.height).fill(-1);
  const queue = [s.y * w + s.x];
  dist[queue[0]!] = 0;
  for (let q = 0; q < queue.length; q++) {
    const cx = queue[q]! % w;
    const cy = Math.floor(queue[q]! / w);
    for (const d of movesFrom(cx, cy)) {
      const nb = neighbor(cx, cy, d)!;
      const t = tileAt(s, nb.x, nb.y);
      if (!t || !walkable(t) || dist[nb.y * w + nb.x]! >= 0) continue;
      dist[nb.y * w + nb.x] = dist[queue[q]!]! + 1;
      queue.push(nb.y * w + nb.x);
    }
  }
  let best: Pos | null = null;
  let bestD = dist[e.y * w + e.x]! >= 0 ? dist[e.y * w + e.x]! : 9999;
  for (const d of ['N', 'E', 'S', 'W'] as const) {
    const nb = neighbor(e.x, e.y, d);
    if (!nb) continue;
    const t = tileAt(s, nb.x, nb.y);
    if (!t || !walkable(t) || enemyAt(s, nb.x, nb.y) || (nb.x === s.x && nb.y === s.y)) continue;
    const nd = dist[nb.y * w + nb.x]!;
    if (nd >= 0 && nd < bestD) {
      bestD = nd;
      best = nb;
    }
  }
  return best;
}

// ---------- level files ----------

/**
 * Level text format, like the Knight's: `key: value` lines, `---`, then the
 * grid, one character per triangle (see TILE_GLYPH; `@` the die on an up
 * triangle, `w` a wolf, `s` a stag, both on grass).
 */
export function parseRangerLevel(text: string): RLevel {
  const [head, body] = text.split(/^---\s*$/m) as [string, string];
  const meta: Record<string, string> = {};
  for (const line of head.split('\n')) {
    const m = /^\s*([a-zA-Z-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (m) meta[m[1]!.toLowerCase()] = m[2]!;
  }
  const rows = body
    .split('\n')
    .map((r) => r.trimEnd())
    .filter((r) => r.length);
  const width = Math.max(...rows.map((r) => r.length));
  const tiles: Tile[] = [];
  const enemies: Array<Omit<REnemy, 'id' | 'snared'>> = [];
  let start: Pos | null = null;
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '#';
      if (ch === '@') start = { x, y };
      if (ch === 'w' || ch === 's') {
        const kind = ch === 'w' ? 'wolf' : 'stag';
        enemies.push({ kind, x, y, hp: ENEMY_HP[kind] });
      }
      const tile = TILE_GLYPH[ch] ?? 'grass';
      if (!(ch in TILE_GLYPH) && !'@ws'.includes(ch)) throw new Error(`Unknown glyph '${ch}'`);
      tiles.push(tile);
    }
  });
  if (!start) throw new Error(`Level ${meta.id}: no @`);
  const s: Pos = start;
  if (!isUp(s.x, s.y)) throw new Error(`Level ${meta.id}: @ must be on an up triangle`);
  const loadout = (meta.loadout ?? '').split(/[\s,]+/).filter(Boolean);
  if (loadout.length !== 8) throw new Error(`Level ${meta.id}: loadout needs 8 faces`);
  return {
    id: meta.id ?? '?',
    name: meta.name ?? '?',
    width,
    height: rows.length,
    tiles,
    start: s,
    enemies,
    loadout,
    ...(meta.par ? { par: Number(meta.par) } : {}),
    ...(meta.hint ? { hint: meta.hint } : {}),
    ...(meta.teaches ? { teaches: meta.teaches.split(/[\s,]+/).filter(Boolean) } : {}),
  };
}
