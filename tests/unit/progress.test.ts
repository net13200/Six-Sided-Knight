import { describe, expect, it } from 'vitest';
import {
  continueIndex,
  isUnlocked,
  levelFingerprint,
  needsRedo,
  recordWin,
  refreshChangedLevels,
  totalStars,
} from '../../src/meta/progress';
import { FINGERPRINTS_0_9_0 } from '../../src/meta/legacy-fingerprints';
import { loadLevelFile, levelFiles } from '../../tools/lib/files';
import { freshSave } from '../../src/meta/save';
import { level } from './helpers';

const LEVELS = ['a', 'b', 'c', 'd'].map((id) => level(['#@..>###'], { id }));

describe('progression', () => {
  it('unlocks levels one after another', () => {
    const save = freshSave(0);
    expect(LEVELS.map((_, i) => isUnlocked(save, LEVELS, i))).toEqual([true, false, false, false]);
    recordWin(save, 'a', { stars: 1, moves: 5, timeMs: 1000 });
    expect(LEVELS.map((_, i) => isUnlocked(save, LEVELS, i))).toEqual([true, true, false, false]);
  });

  it('continue returns to an unfinished level, else the next unbeaten one', () => {
    const save = freshSave(0);
    expect(continueIndex(save, LEVELS)).toBe(0);
    recordWin(save, 'a', { stars: 3, moves: 5, timeMs: 1000 });
    expect(continueIndex(save, LEVELS)).toBe(1);
    save.lastLevelId = 'a'; // replaying a beaten level doesn't pull "continue" back
    expect(continueIndex(save, LEVELS)).toBe(1);
    recordWin(save, 'b', { stars: 1, moves: 5, timeMs: 1000 });
    save.lastLevelId = 'c';
    expect(continueIndex(save, LEVELS)).toBe(2);
    for (const id of ['c', 'd']) recordWin(save, id, { stars: 1, moves: 5, timeMs: 1000 });
    expect(continueIndex(save, LEVELS)).toBe(3); // all done: stay on the last level
  });

  it('keeps the best result of each measure', () => {
    const save = freshSave(0);
    expect(recordWin(save, 'a', { stars: 2, moves: 9, timeMs: 5000 })).toBe(true);
    expect(recordWin(save, 'a', { stars: 1, moves: 7, timeMs: 8000 })).toBe(false);
    expect(save.levels.a).toEqual({ stars: 2, bestMoves: 7, completions: 2, bestTimeMs: 5000 });
    expect(recordWin(save, 'a', { stars: 3, moves: 8, timeMs: 4000 })).toBe(true);
    expect(totalStars(save)).toBe(3);
  });

  it('a slower run never takes stars away', () => {
    const save = freshSave(0);
    recordWin(save, 'a', { stars: 3, moves: 5, timeMs: 1 });
    expect(recordWin(save, 'a', { stars: 1, moves: 20, timeMs: 1 })).toBe(false);
    expect(save.levels.a!.stars).toBe(3);
  });

  it('records from older versions keep their stars', () => {
    const save = freshSave(0);
    save.levels.a = { stars: 3, bestMoves: 5, completions: 1, bestTimeMs: 1 };
    recordWin(save, 'a', { stars: 1, moves: 9, timeMs: 1 });
    expect(save.levels.a!.stars).toBe(3);
  });
});

describe('levels changed in an update', () => {
  const win = { stars: 3, moves: 5, timeMs: 1000 };
  const NONE = new Map();
  const changedB = LEVELS.map((l) => (l.id === 'b' ? { ...l, grid: ['#@...>##'] } : l));

  function beatAll() {
    const save = freshSave(0);
    for (const l of LEVELS) recordWin(save, l.id, win, levelFingerprint(l));
    save.hints['lesson:b'] = true;
    return save;
  }

  it('a beaten level that changed loses its stars; the levels after it stay open', () => {
    const save = beatAll();
    expect(refreshChangedLevels(save, changedB, NONE, {})).toEqual(['b']);
    expect(save.levels.b).toMatchObject({ stars: 0, completions: 0, redo: true });
    expect(needsRedo(save, changedB[1]!)).toBe(true);
    expect(totalStars(save)).toBe(9);
    expect(save.starsBeforeReset).toBe(12); // skins stay unlocked
    expect(save.changedLevelsNotice).toBe(1);
    expect(save.hints['lesson:b']).toBeUndefined(); // its lesson shows again
    expect(changedB.map((_, i) => isUnlocked(save, changedB, i))).toEqual([true, true, true, true]);
    expect(continueIndex(save, changedB)).toBe(1);
    // Nothing else changed, and running it again changes nothing.
    expect(refreshChangedLevels(save, changedB, NONE, {})).toEqual([]);
    expect(save.levels.a!.stars).toBe(3);
  });

  it('solving it again earns the stars back and clears the mark', () => {
    const save = beatAll();
    refreshChangedLevels(save, changedB, NONE, {});
    expect(recordWin(save, 'b', { ...win, stars: 2 }, levelFingerprint(changedB[1]!))).toBe(true);
    expect(save.levels.b).toMatchObject({ stars: 2, completions: 1 });
    expect(save.levels.b!.redo).toBeUndefined();
    expect(refreshChangedLevels(save, changedB, NONE, {})).toEqual([]);
  });

  it('a changed gauntlet floor changes its level', () => {
    const floor = level(['#@..>###'], { id: 'd-2' });
    const moved = { ...floor, grid: ['#@.>####'] };
    expect(levelFingerprint(LEVELS[3]!, [floor])).not.toBe(levelFingerprint(LEVELS[3]!, [moved]));
    expect(levelFingerprint(LEVELS[3]!, [floor])).not.toBe(levelFingerprint(LEVELS[3]!));
    // A new name or hint doesn't count as a change.
    expect(levelFingerprint({ ...LEVELS[0]!, name: 'X', hint: 'Y' })).toBe(
      levelFingerprint(LEVELS[0]!),
    );
  });

  it('0.9.0 saves (no fingerprints): only the stages redesigned since then reset', () => {
    const campaign = levelFiles(['src/levels/data']).map(loadLevelFile);
    const floors = levelFiles(['src/levels/gauntlets']).map(loadLevelFile);
    const byLevel = new Map(
      campaign.map((l) => [l.id, floors.filter((f) => f.id.startsWith(`${l.id}-`))]),
    );
    const save = freshSave(0);
    for (const l of campaign) recordWin(save, l.id, win);
    const changed = refreshChangedLevels(save, campaign, byLevel, FINGERPRINTS_0_9_0);
    expect(changed).toEqual([
      'c4-04',
      'c5-01',
      'c5-02',
      'c5-03',
      'c5-04',
      'c5-05',
      'c5-06',
      'c5-07',
      'c5-08',
      'c5-09',
      'c5-10',
      'c6-08',
      'c6-10',
    ]);
    expect(totalStars(save)).toBe((campaign.length - changed.length) * 3);
    expect(campaign.every((_, i) => isUnlocked(save, campaign, i))).toBe(true);
  });
});
