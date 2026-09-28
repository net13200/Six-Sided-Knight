import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_EDITION,
  LEGACY_SETTINGS_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  SaveStore,
  freshSave,
  loadSave,
  migrate,
  normalize,
} from '../../src/meta/save';
import { MemoryStorage } from '../../src/platform/memory';
import { SKINS, isSkinUnlocked, skinById } from '../../src/meta/skins';
import { totalStars } from '../../src/meta/progress';

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
      campaign: CAMPAIGN_EDITION,
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
        campaign: CAMPAIGN_EDITION,
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

  it('migrates a 0.3.0 (v1) save to the current version (the old campaign resets)', () => {
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
    // Every level is new since 0.9.0: old level progress starts fresh, its stars still count for skins.
    expect(store.data.levels).toEqual({});
    expect(store.data.starsBeforeReset).toBe(3);
    expect(store.data.settings).toMatchObject(v1.settings);
    expect(store.data.settings.reduceMotion).toBeNull(); // new settings get defaults
    expect(store.data.lastLevelId).toBeNull();
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

describe('campaign reset (0.9.0: every level rebuilt)', () => {
  const old = () => ({
    version: 3,
    createdAt: 1,
    wallet: { crowns: 250, earned: 400, spent: 150 },
    owned: ['Freeze'],
    die: ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Freeze'],
    skin: 'moss',
    levels: {
      'c1-01': { stars: 3, bestMoves: 5, completions: 2, bestTimeMs: 900 },
      'c1-02': { stars: 2, bestMoves: 6, completions: 1, bestTimeMs: 900 },
    },
    lastLevelId: 'c1-02',
    hints: { inspect: true, 'lesson:c1-01': true, 'story:intro': true },
    daily: { lastDate: '2026-09-20', streak: 4, bestStreak: 9, results: {}, inProgress: null },
    depths: { bestFloor: 7, runs: 3, inProgress: null },
  });

  it('clears level progress and read lessons, keeps everything else', () => {
    const s = normalize(old(), 0);
    expect(s.levels).toEqual({});
    expect(s.lastLevelId).toBeNull();
    expect(s.hints).toEqual({ inspect: true, 'story:intro': true });
    expect(s.wallet.crowns).toBe(250);
    expect(s.owned).toEqual(['Freeze']);
    expect(s.die).toEqual(['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Freeze']);
    expect(s.daily.bestStreak).toBe(9);
    expect(s.depths.bestFloor).toBe(7);
    expect(s.campaign).toBe(CAMPAIGN_EDITION);
    expect(s.starsBeforeReset).toBe(5);
    expect(s.campaignResetNotice).toBe(true);
  });

  it('happens once: new progress is kept on the next load', () => {
    const s = normalize(old(), 0);
    s.levels['c1-01'] = { stars: 1, bestMoves: 9, completions: 1, bestTimeMs: 1 };
    const again = normalize(JSON.parse(JSON.stringify(s)), 0);
    expect(again.levels['c1-01']!.stars).toBe(1);
  });

  it('new players see no notice', () => {
    expect(freshSave(0).campaignResetNotice).toBe(false);
    expect(normalize({ version: 3, createdAt: 1 }, 0).campaignResetNotice).toBe(false);
  });

  it('skins unlocked by the old stars stay unlocked', () => {
    const s = normalize({ ...old(), levels: bigLevels(12) }, 0); // 36 stars: Moss (30) was unlocked
    expect(totalStars(s)).toBe(0);
    expect(isSkinUnlocked(s, skinById('moss'))).toBe(true);
    expect(
      isSkinUnlocked(
        s,
        SKINS.find((k) => k.unlock.stars === 60)!,
      ),
    ).toBe(false);
  });
});

function bigLevels(n: number) {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < n; i++)
    out[`x-${i}`] = { stars: 3, bestMoves: 1, completions: 1, bestTimeMs: 1 };
  return out;
}
