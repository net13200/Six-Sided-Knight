import { describe, expect, it } from 'vitest';
import { freshSave } from '../../src/meta/save';
import {
  SKINS,
  activeSkin,
  isSkinUnlocked,
  newlyUnlocked,
  unlockedSkins,
} from '../../src/meta/skins';

describe('die skins', () => {
  it('Classic is always unlocked; others unlock with stars or streaks', () => {
    const s = freshSave(0);
    expect(unlockedSkins(s)).toEqual(['classic']);
    for (let i = 1; i <= 4; i++)
      s.levels[`x${i}`] = { stars: 3, bestMoves: 1, completions: 1, bestTimeMs: 1 };
    expect(unlockedSkins(s)).toEqual(['classic', 'bone']); // 12 stars
    s.daily.bestStreak = 7;
    expect(unlockedSkins(s)).toContain('night');
    expect(unlockedSkins(s)).not.toContain('royal');
  });

  it('an equipped skin that is no longer unlocked falls back to Classic', () => {
    const s = freshSave(0);
    s.skin = 'gilded';
    expect(activeSkin(s).id).toBe('classic');
    s.skin = 'nonsense';
    expect(activeSkin(s).id).toBe('classic');
  });

  it('reports newly unlocked skins', () => {
    expect(newlyUnlocked(['classic'], ['classic', 'bone']).map((k) => k.id)).toEqual(['bone']);
  });

  it('every skin has a unique id and a reachable unlock', () => {
    expect(new Set(SKINS.map((k) => k.id)).size).toBe(SKINS.length);
    const s = freshSave(0);
    for (let i = 0; i < 60; i++)
      s.levels[`x${i}`] = { stars: 3, bestMoves: 1, completions: 1, bestTimeMs: 1 };
    s.daily.bestStreak = 30;
    for (const k of SKINS) expect(isSkinUnlocked(s, k), k.id).toBe(true);
  });
});
