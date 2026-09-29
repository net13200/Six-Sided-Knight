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

/**
 * Level 1 is always open; every other level opens when the one before it is
 * completed. A level beaten before it changed in an update still counts for
 * opening the next one: the player isn't locked out of levels they reached.
 */
export function isUnlocked(save: SaveData, levels: readonly LevelData[], index: number): boolean {
  if (index <= 0) return true;
  const prev = levels[index - 1];
  return prev !== undefined && (isCompleted(save, prev) || save.levels[prev.id]?.redo === true);
}

/** Beaten before, but changed since: to be solved again for stars. */
export function needsRedo(save: SaveData, level: LevelData): boolean {
  return save.levels[level.id]?.redo === true;
}

/**
 * A short fingerprint of everything that makes a level's puzzle and its stars:
 * the map, die, start, enemies, par and gauntlet floors (not its name or hint).
 * When it changes, stars earned on the old version no longer count.
 */
export function levelFingerprint(level: LevelData, floors: readonly LevelData[] = []): string {
  const part = (l: LevelData) => ({
    grid: l.grid,
    par: l.par ?? null,
    runPar: l.runPar ?? null,
    start: l.start ?? null,
    enemies: l.enemies ?? null,
    loadout: l.loadout ?? null,
  });
  const text = JSON.stringify([part(level), ...floors.map(part)]);
  // FNV-1a, 32 bits.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Levels changed in an update: a level the player had beaten, whose
 * fingerprint no longer matches, loses its stars and is marked to solve again
 * (the levels after it stay open). Records from before fingerprints (0.9.0)
 * are compared with that version's fingerprints (`legacy`). Stars lost here
 * still count for skins they unlocked. Returns the ids of the changed levels
 * the player had beaten.
 */
export function refreshChangedLevels(
  save: SaveData,
  levels: readonly LevelData[],
  floors: ReadonlyMap<string, readonly LevelData[]>,
  legacy: Readonly<Record<string, string>>,
): string[] {
  const changed: string[] = [];
  const starsBefore = totalStars(save);
  for (const level of levels) {
    const rec = save.levels[level.id];
    if (!rec) continue;
    const fp = levelFingerprint(level, floors.get(level.id));
    const was = rec.fp ?? legacy[level.id];
    if (was === undefined || was === fp) {
      rec.fp = fp;
      continue;
    }
    if (rec.completions > 0 || rec.redo) {
      save.levels[level.id] = {
        stars: 0,
        bestMoves: 0,
        completions: 0,
        bestTimeMs: 0,
        fp,
        redo: true,
      };
      if (rec.completions > 0) changed.push(level.id);
    } else delete save.levels[level.id];
    // Its lesson may have changed too: show it again.
    delete save.hints[`lesson:${level.id}`];
  }
  if (changed.length) {
    save.starsBeforeReset = Math.max(save.starsBeforeReset, starsBefore);
    save.changedLevelsNotice += changed.length;
  }
  return changed;
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
  /** Stars this attempt earned (0-3, from moves). */
  readonly stars: number;
  readonly moves: number;
  readonly timeMs: number;
}

/**
 * Stores a win. The best star count is kept (a later, slower run never takes
 * stars away). Returns true if the level's star count went up.
 */
export function recordWin(save: SaveData, levelId: string, win: WinRecord, fp?: string): boolean {
  const prev = save.levels[levelId];
  const stars = Math.max(prev?.stars ?? 0, Math.max(0, Math.min(3, win.stars)));
  const improved = !prev || stars > prev.stars;
  save.levels[levelId] = {
    stars,
    bestMoves: prev && prev.bestMoves > 0 ? Math.min(prev.bestMoves, win.moves) : win.moves,
    completions: (prev?.completions ?? 0) + 1,
    bestTimeMs: prev && prev.bestTimeMs > 0 ? Math.min(prev.bestTimeMs, win.timeMs) : win.timeMs,
    ...((fp ?? prev?.fp) ? { fp: fp ?? prev?.fp } : {}),
  };
  return improved;
}
