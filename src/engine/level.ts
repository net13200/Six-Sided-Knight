/**
 * Level data. Levels are authored as a text grid (one character per tile,
 * glyphs come from the registries) wrapped in versioned JSON, and validated
 * at load time.
 *
 * JSON (schema 1):
 * {
 *   "schema": 1,
 *   "id": "c1-01",
 *   "name": "First Roll",
 *   "grid": ["########", "#@...>.#", ...],   // 9 rows of 8 chars
 *   "par": 6,                                   // optional
 *   "start": { "top": "<face>", "east": "<face>" }, // optional orientation constraints
 *   "enemies": [{ "x": 3, "y": 2, "data": { "wait": 0 } }] // optional per-enemy overrides
 * }
 *
 * Plain-text form (.txt), converted by parseTextLevel():
 *   id: c1-01
 *   name: First Roll
 *   par: 6
 *   ---
 *   ########
 *   #@...>.#
 */
import { findOrientation } from './dice';
import type { Rules } from './registry';
import type { EnemyState, FaceId, GameState, TileId } from './types';

export const LEVEL_SCHEMA_VERSION = 1;
export const GRID_WIDTH = 8;
export const GRID_HEIGHT = 9;

/** The glyph for the player start. The tile under it is `rules.config.floorTile`. */
export const PLAYER_GLYPH = '@';

export interface LevelEnemyOverride {
  readonly x: number;
  readonly y: number;
  readonly data?: Readonly<Record<string, number | boolean>>;
}

export interface LevelData {
  readonly schema: number;
  readonly id: string;
  readonly name: string;
  readonly grid: readonly string[];
  readonly par?: number;
  /** Optional one-line hint shown during play (no text walls). */
  readonly hint?: string;
  readonly start?: Readonly<Record<string, FaceId>>;
  readonly enemies?: readonly LevelEnemyOverride[];
}

export class LevelError extends Error {
  constructor(
    readonly levelId: string,
    readonly problems: readonly string[],
  ) {
    super(`Level '${levelId}' is invalid:\n  - ${problems.join('\n  - ')}`);
  }
}

/** Parses the plain-text authoring format into LevelData (not yet validated). */
export function parseTextLevel(text: string): LevelData {
  const [head, body] = splitOnce(text.replace(/\r\n/g, '\n'), /^---\s*$/m);
  const meta: Record<string, string> = {};
  for (const line of head.split('\n')) {
    const m = /^\s*([a-zA-Z]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (m) meta[m[1]!] = m[2]!;
  }
  const grid = body
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  const data: {
    schema: number;
    id: string;
    name: string;
    grid: string[];
    par?: number;
    hint?: string;
    start?: Record<string, string>;
  } = {
    schema: LEVEL_SCHEMA_VERSION,
    id: meta.id ?? '',
    name: meta.name ?? meta.id ?? '',
    grid,
  };
  if (meta.par !== undefined) data.par = Number(meta.par);
  if (meta.hint !== undefined) data.hint = meta.hint;
  if (meta.start !== undefined) {
    // start: top=Shield east=Sword
    data.start = Object.fromEntries(
      meta.start
        .split(/\s+/)
        .filter(Boolean)
        .map((kv) => kv.split('=') as [string, string]),
    );
  }
  return data;
}

function splitOnce(text: string, sep: RegExp): [string, string] {
  const m = sep.exec(text);
  if (!m) return ['', text];
  return [text.slice(0, m.index), text.slice(m.index + m[0].length)];
}

/** Returns a list of problems; empty means valid. */
export function validateLevel(rules: Rules, raw: unknown): string[] {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null) return ['level is not an object'];
  const lvl = raw as Partial<LevelData>;
  if (lvl.schema !== LEVEL_SCHEMA_VERSION) {
    problems.push(`schema must be ${LEVEL_SCHEMA_VERSION} (got ${String(lvl.schema)})`);
  }
  if (typeof lvl.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(lvl.id)) {
    problems.push('id must be a lowercase slug');
  }
  if (typeof lvl.name !== 'string' || lvl.name.length === 0) problems.push('name is required');
  if (lvl.par !== undefined && (!Number.isInteger(lvl.par) || lvl.par < 1)) {
    problems.push('par must be a positive integer');
  }
  if (lvl.hint !== undefined && (typeof lvl.hint !== 'string' || lvl.hint.length > 40)) {
    problems.push('hint must be a string of at most 40 characters');
  }
  if (!Array.isArray(lvl.grid)) return [...problems, 'grid must be an array of strings'];
  if (lvl.grid.length !== GRID_HEIGHT) {
    problems.push(`grid must have ${GRID_HEIGHT} rows (got ${lvl.grid.length})`);
  }

  const glyphs = glyphTable(rules);
  let players = 0;
  let goals = 0;
  const enemyCells = new Set<string>();
  lvl.grid.forEach((row, y) => {
    if (typeof row !== 'string' || row.length !== GRID_WIDTH) {
      problems.push(`row ${y} must be ${GRID_WIDTH} characters`);
      return;
    }
    [...row].forEach((ch, x) => {
      const g = glyphs.get(ch);
      if (!g) problems.push(`unknown glyph '${ch}' at (${x},${y})`);
      else if (g.kind === 'player') players++;
      else if (g.kind === 'enemy') enemyCells.add(`${x},${y}`);
      else if (rules.tiles.get(g.id).goal) goals++;
    });
  });
  if (players !== 1) problems.push(`exactly one '${PLAYER_GLYPH}' required (got ${players})`);
  if (goals < 1) problems.push('at least one goal tile (exit) required');

  for (const o of lvl.enemies ?? []) {
    if (!enemyCells.has(`${o.x},${o.y}`))
      problems.push(`enemy override at (${o.x},${o.y}) has no enemy`);
  }
  if (lvl.start !== undefined) {
    try {
      const { dieShape, defaultLoadout } = rules.config;
      if (findOrientation(dieShape, defaultLoadout, lvl.start) < 0) {
        problems.push('start orientation is impossible');
      }
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  return problems;
}

type Glyph = { kind: 'tile'; id: TileId } | { kind: 'enemy'; id: string } | { kind: 'player' };

export function glyphTable(rules: Rules): Map<string, Glyph> {
  const map = new Map<string, Glyph>([[PLAYER_GLYPH, { kind: 'player' }]]);
  const add = (glyph: string, g: Glyph) => {
    if (map.has(glyph)) throw new Error(`Glyph '${glyph}' is used twice`);
    map.set(glyph, g);
  };
  for (const t of rules.tiles.all()) add(t.glyph, { kind: 'tile', id: t.id });
  for (const e of rules.enemies.all()) add(e.glyph, { kind: 'enemy', id: e.kind });
  return map;
}

export interface CreateOptions {
  readonly hp?: number;
  readonly maxHp?: number;
  readonly seed?: number;
  readonly loadout?: readonly FaceId[];
  readonly gold?: number;
}

/** Validates the level and builds its initial GameState. Throws LevelError if invalid. */
export function createState(rules: Rules, level: LevelData, opts: CreateOptions = {}): GameState {
  const problems = validateLevel(rules, level);
  if (problems.length) throw new LevelError(String(level.id), problems);

  const glyphs = glyphTable(rules);
  const tiles: TileId[] = [];
  const enemies: EnemyState[] = [];
  let px = 0;
  let py = 0;
  let treasures = 0;
  level.grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const g = glyphs.get(ch)!;
      if (g.kind === 'tile') {
        tiles.push(g.id);
        if (rules.tiles.get(g.id).treasure) treasures++;
        return;
      }
      tiles.push(rules.config.floorTile);
      if (g.kind === 'player') {
        px = x;
        py = y;
        return;
      }
      const def = rules.enemies.get(g.id);
      const override = level.enemies?.find((o) => o.x === x && o.y === y)?.data ?? {};
      enemies.push({
        id: enemies.length + 1,
        kind: def.kind,
        x,
        y,
        hp: def.hp,
        data: def.initData ? def.initData(override) : { ...override },
        effects: [],
      });
    }),
  );

  const shape = rules.config.dieShape;
  const loadout = opts.loadout ?? rules.config.defaultLoadout;
  const orient = level.start ? findOrientation(shape, loadout, level.start) : 0;
  if (orient < 0)
    throw new LevelError(level.id, ['start orientation is impossible for this loadout']);
  const maxHp = opts.maxHp ?? 5;
  return {
    levelId: level.id,
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    tiles,
    player: {
      x: px,
      y: py,
      hp: Math.min(opts.hp ?? maxHp, maxHp),
      maxHp,
      die: { shape, loadout, orient },
    },
    enemies,
    gold: opts.gold ?? 0,
    turn: 0,
    status: 'playing',
    stats: {
      moves: 0,
      damageTaken: 0,
      kills: 0,
      treasuresCollected: 0,
      treasuresTotal: treasures,
    },
    rng: (opts.seed ?? 1) >>> 0,
    nextEnemyId: enemies.length + 1,
  };
}
