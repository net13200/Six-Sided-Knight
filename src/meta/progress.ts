/** Campaign progression rules. Pure functions over the save data. */
import type { LevelData } from '../engine';
import type { SaveData } from './save';

export const CHAPTER_SIZE = 10;
export const CHAPTER_NAMES = [
  'First Steps',
  'Deep Halls',
  'The Vaults',
  'Ember Keep',
  'Frost Crypt',
  'The Throne',
];

export function chapterOf(index: number): number {
  return Math.floor(index / CHAPTER_SIZE);
}

export function chapterCount(levels: readonly LevelData[]): number {
  return Math.ceil(levels.length / CHAPTER_SIZE);
}

export function isCompleted(save: SaveData, level: LevelData): boolean {
  return (save.levels[level.id]?.completions ?? 0) > 0;
}

/** Level 1 is always open; every other level opens when the one before it is completed. */
export function isUnlocked(save: SaveData, levels: readonly LevelData[], index: number): boolean {
  if (index <= 0) return true;
  const prev = levels[index - 1];
  return prev !== undefined && isCompleted(save, prev);
}

/**
 * The level "Play" should open in one tap: the level the player was in if
 * they haven't beaten it yet, otherwise the first unbeaten unlocked level.
 */
export function continueIndex(save: SaveData, levels: readonly LevelData[]): number {
  const last = levels.findIndex((l) => l.id === save.lastLevelId);
  if (last >= 0 && !isCompleted(save, levels[last]!)) return last;
  const next = levels.findIndex((l, i) => !isCompleted(save, l) && isUnlocked(save, levels, i));
  return next >= 0 ? next : Math.max(0, levels.length - 1);
}

export function totalStars(save: SaveData): number {
  return Object.values(save.levels).reduce((sum, r) => sum + r.stars, 0);
}

export interface WinRecord {
  readonly stars: number;
  readonly moves: number;
  readonly timeMs: number;
}

/** Stores a win, keeping the best of each measure. Returns true if stars improved. */
export function recordWin(save: SaveData, levelId: string, win: WinRecord): boolean {
  const prev = save.levels[levelId];
  const improved = !prev || win.stars > prev.stars;
  save.levels[levelId] = {
    stars: Math.max(prev?.stars ?? 0, win.stars),
    bestMoves: prev && prev.bestMoves > 0 ? Math.min(prev.bestMoves, win.moves) : win.moves,
    completions: (prev?.completions ?? 0) + 1,
    bestTimeMs: prev && prev.bestTimeMs > 0 ? Math.min(prev.bestTimeMs, win.timeMs) : win.timeMs,
  };
  return improved;
}
