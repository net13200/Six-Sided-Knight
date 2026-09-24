import { describe, expect, it } from 'vitest';
import {
  LEGACY_SETTINGS_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  SaveStore,
  freshSave,
  loadSave,
  migrate,
} from '../../src/meta/save';
import { MemoryStorage } from '../../src/platform/memory';

const NOW = 1_700_000_000_000;

describe('save loading', () => {
  it('starts fresh with no data', () => {
    const r = loadSave(new MemoryStorage(), NOW);
    expect(r.outcome).toBe('fresh');
    expect(r.save).toEqual(freshSave(NOW));
    expect(r.writable).toBe(true);
  });

  it('migrates the milestone-2 settings key into save v1', () => {
    const storage = new MemoryStorage();
    storage.set(LEGACY_SETTINGS_KEY, JSON.stringify({ muted: true }));
    const store = new SaveStore(storage, NOW);
    expect(store.data.settings.muted).toBe(true);
    expect(JSON.parse(storage.get(SAVE_KEY)!).version).toBe(SAVE_VERSION);
  });

  it('round-trips through storage', () => {
    const storage = new MemoryStorage();
    const a = new SaveStore(storage, NOW);
    a.update((d) => {
      d.levels['c1-01'] = { stars: 2, bestMoves: 7, completions: 1, bestTimeMs: 9000 };
      d.lastLevelId = 'c1-02';
    });
    const b = new SaveStore(storage, NOW + 1000);
    expect(b.outcome).toBe('loaded');
    expect(b.data).toEqual(a.data);
  });

  it('backs up corrupt data before starting over', () => {
    const storage = new MemoryStorage();
    storage.set(SAVE_KEY, '{not json');
    const r = loadSave(storage, NOW);
    expect(r.outcome).toBe('recovered');
    expect(storage.get(`${SAVE_KEY}.corrupt.${NOW}`)).toBe('{not json');
  });

  it('never overwrites data from a newer version', () => {
    const storage = new MemoryStorage();
    const future = JSON.stringify({
      version: SAVE_VERSION + 1,
      levels: { x: { stars: 3 } },
      fancy: true,
    });
    storage.set(SAVE_KEY, future);
    const store = new SaveStore(storage, NOW);
    expect(store.outcome).toBe('newer-version');
    expect(store.update((d) => (d.settings.muted = true))).toBe(false);
    expect(storage.get(SAVE_KEY)).toBe(future);
    expect(store.data.levels.x!.stars).toBe(3); // still readable
  });

  it('repairs missing and out-of-range fields', () => {
    const storage = new MemoryStorage();
    storage.set(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        levels: { a: { stars: 9, bestMoves: -4 }, b: null },
        settings: {},
      }),
    );
    const { save } = loadSave(storage, NOW);
    expect(save.levels.a).toEqual({ stars: 3, bestMoves: 0, completions: 0, bestTimeMs: 0 });
    expect(save.levels.b).toBeUndefined();
    expect(save.settings).toEqual({
      muted: false,
      analyticsOptOut: false,
      highContrast: false,
      largeLabels: false,
      reduceMotion: null,
      musicVolume: 0.5,
    });
    expect(save.stats.levelsCompleted).toBe(0);
  });

  it('every version from 0 up migrates to the current one', () => {
    for (let v = 0; v <= SAVE_VERSION; v++) {
      const out = migrate(v === 0 ? {} : { ...freshSave(NOW), version: v }, NOW);
      expect(out.version).toBe(SAVE_VERSION);
    }
  });

  it('migrates a 0.3.0 (v1) save to the current version without losing progress', () => {
    const storage = new MemoryStorage();
    const v1 = {
      version: 1,
      createdAt: 123,
      settings: { muted: true, analyticsOptOut: true },
      levels: { 'c1-01': { stars: 3, bestMoves: 5, completions: 2, bestTimeMs: 4000 } },
      lastLevelId: 'c1-02',
      stats: { ...freshSave(0).stats, levelsCompleted: 2 },
    };
    storage.set(SAVE_KEY, JSON.stringify(v1));
    const store = new SaveStore(storage, NOW);
    expect(store.outcome).toBe('migrated');
    expect(store.data.version).toBe(SAVE_VERSION);
    expect(store.data.levels).toEqual(v1.levels);
    expect(store.data.settings).toMatchObject(v1.settings);
    expect(store.data.settings.reduceMotion).toBeNull(); // new settings get defaults
    expect(store.data.lastLevelId).toBe('c1-02');
    expect(store.data.createdAt).toBe(123);
    expect(store.data.daily).toEqual({
      lastDate: null,
      streak: 0,
      bestStreak: 0,
      results: {},
      inProgress: null,
    });
    expect(store.data.depths).toEqual({ bestFloor: 0, runs: 0, inProgress: null });
    expect(JSON.parse(storage.get(SAVE_KEY)!).version).toBe(SAVE_VERSION);
    // The 3 stars already earned pay out once.
    expect(store.data.wallet).toEqual({ crowns: 30, earned: 30, spent: 0 });
  });

  it('migrates a 0.4.x (v2) save to v3: crowns for stars already earned, default die', () => {
    const storage = new MemoryStorage();
    const base = freshSave(0);
    const v2 = {
      ...base,
      version: 2,
      levels: {
        'c1-01': { stars: 3, bestMoves: 5, completions: 1, bestTimeMs: 1 },
        'c1-02': { stars: 2, bestMoves: 5, completions: 1, bestTimeMs: 1 },
      },
      daily: {
        ...base.daily,
        results: { '2026-09-20': { moves: 30, hp: 3, stars: 7 } },
      },
      stats: { ...base.stats, faceMoves: undefined },
    } as Record<string, unknown>;
    for (const k of ['wallet', 'owned', 'die', 'skin']) delete v2[k];
    storage.set(SAVE_KEY, JSON.stringify(v2));
    const store = new SaveStore(storage, NOW);
    expect(store.outcome).toBe('migrated');
    expect(store.data.wallet).toEqual({ crowns: 120, earned: 120, spent: 0 });
    expect(store.data.owned).toEqual([]);
    expect(store.data.die).toBeNull();
    expect(store.data.skin).toBe('classic');
    expect(store.data.stats.faceMoves).toEqual({});
  });

  it('drops malformed runs in progress', () => {
    const storage = new MemoryStorage();
    storage.set(
      SAVE_KEY,
      JSON.stringify({
        ...freshSave(0),
        depths: { bestFloor: 4, runs: 2, inProgress: { floor: 3 } },
      }),
    );
    const { save } = loadSave(storage, NOW);
    expect(save.depths).toEqual({ bestFloor: 4, runs: 2, inProgress: null });
  });

  it('keeps one-time hint flags and drops junk', () => {
    const storage = new MemoryStorage();
    storage.set(
      SAVE_KEY,
      JSON.stringify({ ...freshSave(0), hints: { inspect: true, bad: 'yes' } }),
    );
    expect(loadSave(storage, NOW).save.hints).toEqual({ inspect: true });
    storage.set(SAVE_KEY, JSON.stringify({ ...freshSave(0), hints: undefined }));
    expect(loadSave(storage, NOW).save.hints).toEqual({});
  });

  it('reports failed writes instead of throwing', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage, NOW);
    storage.failWrites = true;
    expect(store.update((d) => (d.settings.muted = true))).toBe(false);
    expect(store.data.settings.muted).toBe(true); // kept in memory
  });
});
