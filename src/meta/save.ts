/**
 * Versioned save data. Every format change bumps SAVE_VERSION and adds a
 * migration from the previous version, so an update never wipes progress.
 *
 * Safety rules:
 * - Unreadable data is backed up under a separate key before starting fresh.
 * - Data from a *newer* version (e.g. after a rollback) is never overwritten:
 *   the game runs on an in-memory copy and doesn't save.
 */
import type { KeyValueStorage } from '../platform/platform';

export const SAVE_KEY = 'ssk.save';
export const SAVE_VERSION = 3;
/** Pre-save-system settings (milestone 2). Migrated into save v1. */
export const LEGACY_SETTINGS_KEY = 'ssk.settings.v1';

export interface LevelRecord {
  /** Best star count (0-3). */
  stars: number;
  /** Fewest moves in a win. */
  bestMoves: number;
  completions: number;
  /** Fastest win, in milliseconds of active play. */
  bestTimeMs: number;
}

export interface Settings {
  muted: boolean;
  /** Local analytics recording. True = the player opted out. */
  analyticsOptOut: boolean;
}

export interface LifetimeStats {
  levelsStarted: number;
  levelsCompleted: number;
  moves: number;
  kills: number;
  gold: number;
  undos: number;
  retries: number;
  deaths: number;
  playTimeMs: number;
  /** Turn-using moves per leading face (added in save v3). */
  faceMoves: Record<string, number>;
}

export interface SaveV1 {
  version: 1;
  createdAt: number;
  settings: Settings;
  levels: Record<string, LevelRecord>;
  /** Level the player was last in, for "continue where you left off". */
  lastLevelId: string | null;
  stats: LifetimeStats;
}

/** A Daily Roll or Depths run in progress, so leaving and coming back resumes it. */
export interface RunProgress {
  /** Daily: the UTC date. Depths: the run seed. */
  key: string;
  floor: number;
  hp: number;
  moves: number;
  stars: number;
  /** The die this run is played with (fixed for the whole run). Missing = default. */
  die?: string[];
}

export interface DailyState {
  /** Last UTC date with a counted completion. */
  lastDate: string | null;
  streak: number;
  bestStreak: number;
  /** First completion per date (bounded history). */
  results: Record<string, { moves: number; hp: number; stars: number }>;
  inProgress: RunProgress | null;
}

export interface DepthsState {
  /** Deepest floor cleared. */
  bestFloor: number;
  runs: number;
  inProgress: RunProgress | null;
}

export interface SaveV2 extends Omit<SaveV1, 'version'> {
  version: 2;
  daily: DailyState;
  depths: DepthsState;
  /** One-time hints already shown (added in 0.4.1; missing = none shown). */
  hints: Record<string, boolean>;
}

/** Crowns: the currency earned from stars and spent in the store. */
export interface Wallet {
  crowns: number;
  /** Lifetime totals, for the stats screen. */
  earned: number;
  spent: number;
}

export interface SaveV3 extends Omit<SaveV2, 'version'> {
  version: 3;
  wallet: Wallet;
  /** Faces bought in the store (the six starting faces are always owned). */
  owned: string[];
  /** The player's custom die for Daily Roll and Depths: faces by home slot. Null = default. */
  die: string[] | null;
  /** Equipped cosmetic die skin. */
  skin: string;
}

export type SaveData = SaveV3;

export const CROWNS_PER_STAR = 10;

function freshDaily(): DailyState {
  return { lastDate: null, streak: 0, bestStreak: 0, results: {}, inProgress: null };
}

function freshDepths(): DepthsState {
  return { bestFloor: 0, runs: 0, inProgress: null };
}

export function freshSave(now: number): SaveData {
  return {
    version: 3,
    wallet: { crowns: 0, earned: 0, spent: 0 },
    owned: [],
    die: null,
    skin: 'classic',
    daily: freshDaily(),
    depths: freshDepths(),
    hints: {},
    createdAt: now,
    settings: { muted: false, analyticsOptOut: false },
    levels: {},
    lastLevelId: null,
    stats: {
      levelsStarted: 0,
      levelsCompleted: 0,
      moves: 0,
      kills: 0,
      gold: 0,
      undos: 0,
      retries: 0,
      deaths: 0,
      playTimeMs: 0,
      faceMoves: {},
    },
  };
}

type Json = Record<string, unknown>;

/**
 * migrations[n] upgrades a version-n object to version n+1. Version 0 means
 * "no save yet", which may still carry legacy settings.
 */
const migrations: Record<number, (old: Json, ctx: { now: number; legacy: Json | null }) => Json> = {
  0: (_old, { now, legacy }) => {
    const save = freshSave(now) as unknown as Json;
    if (legacy && legacy.muted === true) (save.settings as Settings).muted = true;
    // Produce a v1 object; later steps add the rest.
    const {
      daily: _d,
      depths: _p,
      hints: _h,
      wallet: _w,
      owned: _o,
      die: _die,
      skin: _s,
      ...v1
    } = save;
    return { ...v1, version: 1 };
  },
  // 0.4.0: Daily Roll and Depths.
  1: (old) => ({ ...old, version: 2, daily: freshDaily(), depths: freshDepths() }),
  // 0.5.0: crowns, the store and custom dice. Stars already earned pay out once.
  2: (old) => {
    const levels = (old.levels ?? {}) as Record<string, { stars?: unknown }>;
    const daily = (old.daily ?? {}) as { results?: Record<string, { stars?: unknown }> };
    let stars = 0;
    for (const r of Object.values(levels)) stars += clampInt(r?.stars, 0, 3);
    for (const r of Object.values(daily.results ?? {})) stars += clampInt(r?.stars, 0, 9);
    const crowns = stars * CROWNS_PER_STAR;
    return {
      ...old,
      version: 3,
      wallet: { crowns, earned: crowns, spent: 0 },
      owned: [],
      die: null,
      skin: 'classic',
    };
  },
};

export interface LoadResult {
  save: SaveData;
  /** False when the stored data is from a newer version: don't write over it. */
  writable: boolean;
  /** What happened, for logging and tests. */
  outcome: 'fresh' | 'loaded' | 'migrated' | 'recovered' | 'newer-version';
}

export function migrate(raw: Json, now: number, legacy: Json | null = null): Json {
  let data = raw;
  let version = typeof data.version === 'number' ? data.version : 0;
  while (version < SAVE_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration from save version ${version}`);
    data = step(data, { now, legacy });
    version = data.version as number;
  }
  return data;
}

/** Fills in any missing fields with defaults and clamps obviously bad values. */
export function normalize(data: Json, now: number): SaveData {
  const base = freshSave(now);
  const d = data as Partial<SaveV3>;
  const levels: Record<string, LevelRecord> = {};
  for (const [id, rec] of Object.entries(d.levels ?? {})) {
    if (!rec || typeof rec !== 'object') continue;
    levels[id] = {
      stars: clampInt(rec.stars, 0, 3),
      bestMoves: clampInt(rec.bestMoves, 0, 1e6),
      completions: clampInt(rec.completions, 0, 1e9),
      bestTimeMs: clampInt(rec.bestTimeMs, 0, 1e12),
    };
  }
  const daily = { ...base.daily, ...(d.daily ?? {}) };
  const depths = { ...base.depths, ...(d.depths ?? {}) };
  const hints: Record<string, boolean> = {};
  if (d.hints && typeof d.hints === 'object') {
    for (const [k, v] of Object.entries(d.hints)) if (v === true) hints[k] = true;
  }
  const wallet = { ...base.wallet, ...(d.wallet ?? {}) };
  const owned = Array.isArray(d.owned)
    ? [...new Set(d.owned.filter((f): f is string => typeof f === 'string'))]
    : [];
  const die = Array.isArray(d.die) && d.die.every((f) => typeof f === 'string') ? [...d.die] : null;
  const stats = { ...base.stats, ...(d.stats ?? {}) };
  const faceMoves: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats.faceMoves ?? {})) faceMoves[k] = clampInt(v, 0, 1e9);
  return {
    version: 3,
    wallet: {
      crowns: clampInt(wallet.crowns, 0, 1e9),
      earned: clampInt(wallet.earned, 0, 1e9),
      spent: clampInt(wallet.spent, 0, 1e9),
    },
    owned,
    die,
    skin: typeof d.skin === 'string' ? d.skin : 'classic',
    hints,
    daily: {
      ...daily,
      streak: clampInt(daily.streak, 0, 1e6),
      bestStreak: clampInt(daily.bestStreak, 0, 1e6),
      results: typeof daily.results === 'object' && daily.results ? daily.results : {},
      inProgress: normalizeRun(daily.inProgress),
    },
    depths: {
      ...depths,
      bestFloor: clampInt(depths.bestFloor, 0, 1e6),
      runs: clampInt(depths.runs, 0, 1e9),
      inProgress: normalizeRun(depths.inProgress),
    },
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : base.createdAt,
    settings: { ...base.settings, ...(d.settings ?? {}) },
    levels,
    lastLevelId: typeof d.lastLevelId === 'string' ? d.lastLevelId : null,
    stats: { ...stats, faceMoves },
  };
}

function normalizeRun(r: unknown): RunProgress | null {
  if (!r || typeof r !== 'object') return null;
  const x = r as Partial<RunProgress>;
  if (typeof x.key !== 'string') return null;
  return {
    key: x.key,
    floor: clampInt(x.floor, 1, 1e6),
    hp: clampInt(x.hp, 1, 99),
    moves: clampInt(x.moves, 0, 1e9),
    stars: clampInt(x.stars, 0, 1e9),
    ...(Array.isArray(x.die) && x.die.every((f) => typeof f === 'string')
      ? { die: [...x.die] }
      : {}),
  };
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : min;
  return Math.max(min, Math.min(max, n));
}

function parse(text: string | null): Json | null {
  if (text === null) return null;
  const v: unknown = JSON.parse(text);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('save is not an object');
  return v as Json;
}

export function loadSave(storage: KeyValueStorage, now: number): LoadResult {
  let legacy: Json | null;
  try {
    legacy = parse(storage.get(LEGACY_SETTINGS_KEY));
  } catch {
    legacy = null;
  }

  let raw: Json | null;
  try {
    raw = parse(storage.get(SAVE_KEY));
  } catch {
    // Corrupt: keep a copy for recovery, then start over.
    const text = storage.get(SAVE_KEY);
    if (text !== null) storage.set(`${SAVE_KEY}.corrupt.${now}`, text);
    return { save: normalize(migrate({}, now, legacy), now), writable: true, outcome: 'recovered' };
  }

  if (raw === null) {
    return { save: normalize(migrate({}, now, legacy), now), writable: true, outcome: 'fresh' };
  }
  const version = typeof raw.version === 'number' ? raw.version : 0;
  if (version > SAVE_VERSION) {
    // From a newer build: play on a copy, never overwrite it.
    return { save: normalize(raw, now), writable: false, outcome: 'newer-version' };
  }
  try {
    const migrated = migrate(raw, now, legacy);
    return {
      save: normalize(migrated, now),
      writable: true,
      outcome: version === SAVE_VERSION ? 'loaded' : 'migrated',
    };
  } catch {
    storage.set(`${SAVE_KEY}.corrupt.${now}`, JSON.stringify(raw));
    return { save: normalize(migrate({}, now, legacy), now), writable: true, outcome: 'recovered' };
  }
}

/** Owns the live save and writes it back after changes. */
export class SaveStore {
  readonly data: SaveData;
  readonly outcome: LoadResult['outcome'];
  private readonly writable: boolean;

  constructor(
    private readonly storage: KeyValueStorage,
    now: number,
  ) {
    const r = loadSave(storage, now);
    this.data = r.save;
    this.writable = r.writable;
    this.outcome = r.outcome;
    if (r.outcome === 'migrated' || r.outcome === 'fresh' || r.outcome === 'recovered')
      this.flush();
  }

  /** Applies a change and saves. Returns false if saving failed or is disabled. */
  update(fn: (d: SaveData) => void): boolean {
    fn(this.data);
    return this.flush();
  }

  flush(): boolean {
    if (!this.writable) return false;
    return this.storage.set(SAVE_KEY, JSON.stringify(this.data));
  }
}
