import { describe, expect, it } from 'vitest';
import {
  STAR_BITS,
  continueIndex,
  isUnlocked,
  recordWin,
  totalStars,
} from '../../src/meta/progress';
import { freshSave } from '../../src/meta/save';
import { level } from './helpers';

const LEVELS = ['a', 'b', 'c', 'd'].map((id) => level(['#@..>###'], { id }));

describe('progression', () => {
  it('unlocks levels one after another', () => {
    const save = freshSave(0);
    expect(LEVELS.map((_, i) => isUnlocked(save, LEVELS, i))).toEqual([true, false, false, false]);
    recordWin(save, 'a', { starMask: 1, moves: 5, timeMs: 1000 });
    expect(LEVELS.map((_, i) => isUnlocked(save, LEVELS, i))).toEqual([true, true, false, false]);
  });

  it('continue returns to an unfinished level, else the next unbeaten one', () => {
    const save = freshSave(0);
    expect(continueIndex(save, LEVELS)).toBe(0);
    recordWin(save, 'a', { starMask: 7, moves: 5, timeMs: 1000 });
    expect(continueIndex(save, LEVELS)).toBe(1);
    save.lastLevelId = 'a'; // replaying a beaten level doesn't pull "continue" back
    expect(continueIndex(save, LEVELS)).toBe(1);
    recordWin(save, 'b', { starMask: 1, moves: 5, timeMs: 1000 });
    save.lastLevelId = 'c';
    expect(continueIndex(save, LEVELS)).toBe(2);
    for (const id of ['c', 'd']) recordWin(save, id, { starMask: 1, moves: 5, timeMs: 1000 });
    expect(continueIndex(save, LEVELS)).toBe(3); // all done: stay on the last level
  });

  it('keeps the best result of each measure', () => {
    const save = freshSave(0);
    expect(recordWin(save, 'a', { starMask: 0b011, moves: 9, timeMs: 5000 })).toBe(true);
    expect(recordWin(save, 'a', { starMask: 0b001, moves: 7, timeMs: 8000 })).toBe(false);
    expect(save.levels.a).toEqual({
      stars: 2,
      starMask: 0b011,
      bestMoves: 7,
      completions: 2,
      bestTimeMs: 5000,
    });
    expect(recordWin(save, 'a', { starMask: 0b111, moves: 8, timeMs: 4000 })).toBe(true);
    expect(totalStars(save)).toBe(3);
  });

  it('stars add up over attempts: each one is kept once earned', () => {
    const save = freshSave(0);
    recordWin(save, 'a', { starMask: STAR_BITS.par, moves: 5, timeMs: 1 });
    recordWin(save, 'a', { starMask: STAR_BITS.noDamage, moves: 9, timeMs: 1 });
    expect(save.levels.a).toMatchObject({ stars: 2, starMask: 0b011 });
    expect(recordWin(save, 'a', { starMask: STAR_BITS.allGold, moves: 9, timeMs: 1 })).toBe(true);
    expect(save.levels.a).toMatchObject({ stars: 3, starMask: 0b111 });
  });

  it('old records (count only) never lose stars', () => {
    const save = freshSave(0);
    save.levels.a = { stars: 2, bestMoves: 5, completions: 1, bestTimeMs: 1 };
    recordWin(save, 'a', { starMask: STAR_BITS.par, moves: 5, timeMs: 1 });
    expect(save.levels.a!.stars).toBe(2);
  });
});
