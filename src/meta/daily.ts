/**
 * Daily Roll: one 3-floor dungeon per UTC day, the same for everyone.
 * Pure functions; the date comes from the caller.
 */
import { seedFrom } from '../engine';
import type { GenParams } from '../gen/generate';
import type { SaveData } from './save';

export const DAILY_FLOORS = 3;
/** Difficulty band per floor (rater score). */
export const DAILY_BANDS: ReadonlyArray<readonly [number, number]> = [
  [15, 30],
  [25, 42],
  [35, 55],
];
/**
 * Floors are generated to be solvable when entered with this much HP. A run
 * can't arrive lower: a floor is left with at least 1 HP, then heals 1.
 */
export const MIN_ARRIVAL_HP = 2;

/** UTC calendar date, e.g. "2026-09-22". */
export function utcDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return utcDate(t);
}

export function dailyFloorParams(date: string, floor: number): GenParams {
  return {
    seed: seedFrom(`ssk-daily:${date}:${floor}`),
    band: DAILY_BANDS[floor - 1] ?? DAILY_BANDS[DAILY_BANDS.length - 1]!,
    id: `daily-${date}-${floor}`,
    name: `Daily Roll · floor ${floor}`,
    hp: floor === 1 ? 5 : MIN_ARRIVAL_HP,
  };
}

/** HP after clearing a floor: +1, capped. */
export function healBetweenFloors(hp: number, maxHp = 5): number {
  return Math.min(maxHp, hp + 1);
}

export interface DailyResult {
  moves: number;
  hp: number;
  stars: number;
}

/**
 * Streak shown today: counts through yesterday's completion, and is 0 once a
 * day has been missed.
 */
export function currentStreak(save: SaveData, today: string): number {
  const last = save.daily.lastDate;
  if (!last) return 0;
  if (last === today || last === addDays(today, -1)) return save.daily.streak;
  return 0;
}

/**
 * Records the first completion of a day. Later completions the same day are
 * practice and change nothing. Returns true if this counted.
 */
export function recordDaily(save: SaveData, date: string, result: DailyResult): boolean {
  if (save.daily.results[date]) return false;
  const d = save.daily;
  d.streak = d.lastDate === addDays(date, -1) ? d.streak + 1 : 1;
  d.bestStreak = Math.max(d.bestStreak, d.streak);
  d.lastDate = date;
  d.results[date] = { ...result };
  // Keep the history bounded.
  const dates = Object.keys(d.results).sort();
  for (const old of dates.slice(0, Math.max(0, dates.length - 90))) delete d.results[old];
  return true;
}

export function shareText(date: string, r: DailyResult, streak: number, url: string): string {
  const max = DAILY_FLOORS * 3;
  const stars = '★'.repeat(r.stars) + '☆'.repeat(Math.max(0, max - r.stars));
  return [
    `Six Sided Knight · Daily Roll ${date}`,
    `${stars} ${r.stars}/${max}`,
    `${r.moves} moves · ${r.hp}/5 HP left`,
    ...(streak > 1 ? [`${streak}-day streak`] : []),
    url,
  ].join('\n');
}
