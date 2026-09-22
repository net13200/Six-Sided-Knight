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
export const SAVE_VERSION = 1;
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

export type SaveData = SaveV1;

export function freshSave(now: number): SaveData {
  return {
    version: 1,
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
    const save = freshSave(now);
    if (legacy && legacy.muted === true) save.settings.muted = true;
    return save as unknown as Json;
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
  const d = data as Partial<SaveV1>;
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
  return {
    version: 1,
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : base.createdAt,
    settings: { ...base.settings, ...(d.settings ?? {}) },
    levels,
    lastLevelId: typeof d.lastLevelId === 'string' ? d.lastLevelId : null,
    stats: { ...base.stats, ...(d.stats ?? {}) },
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
