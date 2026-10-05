/**
 * Daily Roll: one 3-floor dungeon per UTC day, the same for everyone.
 * Pure functions; the date comes from the caller.
 */
import { CORE_CONFIG } from '../content/register';
import { seedFrom } from '../engine';
import type { GenParams } from '../gen/generate';
import type { Bar, Theme } from '../gen/themes';
import { DAILY_PICKS, DAILY_PICKS_FROM } from './daily-picks';
import type { SaveData } from './save';
import { t } from '../i18n';

export const DAILY_FLOORS = 3;
/** Difficulty band per floor (rater score). */
export const DAILY_BANDS: ReadonlyArray<readonly [number, number]> = [
  [15, 30],
  [25, 42],
  [35, 55],
];
/** HP a run (Daily Roll, Depths, gauntlet) starts with. */
export const START_HP = CORE_CONFIG.maxHp;
/**
 * Floors after the first are generated to be solvable when entered with this
 * much HP. HP carries over with no healing between floors, and a floor is
 * left with at least 1 HP, so every later floor must be winnable from 1 HP.
 * Losing is possible (mistakes cost the run) but never forced.
 */
export const MIN_ARRIVAL_HP = 1;

/** UTC calendar date, e.g. "2026-09-22". */
export function utcDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return utcDate(t);
}

/**
 * First date whose dungeon may use ice, archers and golems. Earlier dates keep
 * the original feature set so past dailies never change.
 */
export const DAILY_FEATURES_2_FROM = '2026-09-24';

/**
 * First date with themed rooms: each day of the week leans on one mechanic,
 * and every floor must need some thought (see src/gen/themes.ts).
 */
export const DAILY_THEMES_FROM = '2026-10-05';

/** The theme for each day of the week (UTC), Sunday first. */
const WEEK: readonly Theme[] = ['mixed', 'keys', 'ice', 'bombs', 'archers', 'spikes', 'treasure'];

/** What each floor must reach: harder each floor. */
export const DAILY_BARS: readonly Bar[] = [
  { band: [25, 45], detour: 2, novice: 0.5 },
  { band: [35, 55], detour: 3, novice: 0.3 },
  { band: [45, 65], detour: 5, novice: 0.15 },
];

/** The day's theme, or null for dates before themes. */
export function dailyTheme(date: string): Theme | null {
  if (date < DAILY_THEMES_FROM) return null;
  return WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

/** The day's theme name, for the screen and the share text. */
export function themeName(theme: Theme): string {
  const names: Record<Theme, string> = {
    keys: t('Lock and Key'),
    ice: t('Black Ice'),
    bombs: t('Bomb Day'),
    archers: t('Arrow Storm'),
    spikes: t('Spike Pit'),
    treasure: t('Treasure Hunt'),
    mixed: t('Wild Roll'),
  };
  return names[theme];
}

/**
 * The attempt that makes each floor of a date, found ahead of time by
 * tools/daily-bake.ts (so the floor is ready at once). Null past the table:
 * the floor is then searched for on the spot.
 */
export function dailyPick(date: string, floor: number): number | null {
  const days = Math.round((Date.parse(date) - Date.parse(DAILY_PICKS_FROM)) / 86_400_000);
  const day = days >= 0 ? DAILY_PICKS.split(',')[days] : undefined;
  const pick = day?.split('.')[floor - 1];
  return pick ? parseInt(pick, 36) : null;
}

export function dailyFloorParams(
  date: string,
  floor: number,
  loadout?: readonly string[],
): GenParams {
  const theme = dailyTheme(date);
  if (theme) {
    const bar = DAILY_BARS[floor - 1] ?? DAILY_BARS[DAILY_BARS.length - 1]!;
    const pick = dailyPick(date, floor);
    return {
      features: 2,
      shared: true,
      ...(loadout ? { loadout } : {}),
      seed: seedFrom(`ssk-daily:${date}:${floor}`),
      band: bar.band,
      theme,
      bar,
      ...(pick !== null ? { pick } : { maxAttempts: 80 }),
      id: `daily-${date}-${floor}`,
      name: `Daily Roll · floor ${floor}`,
      hp: floor === 1 ? START_HP : MIN_ARRIVAL_HP,
    };
  }
  return {
    features: date >= DAILY_FEATURES_2_FROM ? 2 : 1,
    shared: true,
    ...(loadout ? { loadout } : {}),
    seed: seedFrom(`ssk-daily:${date}:${floor}`),
    band: DAILY_BANDS[floor - 1] ?? DAILY_BANDS[DAILY_BANDS.length - 1]!,
    id: `daily-${date}-${floor}`,
    name: `Daily Roll · floor ${floor}`,
    hp: floor === 1 ? START_HP : MIN_ARRIVAL_HP,
  };
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

export function shareText(
  date: string,
  r: DailyResult,
  streak: number,
  url: string | null,
): string {
  const max = DAILY_FLOORS * 3;
  const stars = '★'.repeat(r.stars) + '☆'.repeat(Math.max(0, max - r.stars));
  const theme = dailyTheme(date);
  return [
    `Six Sided Knight · ${t('Daily Roll')} ${date}`,
    ...(theme ? [themeName(theme)] : []),
    `${stars} ${r.stars}/${max}`,
    t('{moves} moves · {hp}/{max} HP left', { moves: r.moves, hp: r.hp, max: START_HP }),
    ...(streak > 1 ? [t('{n}-day streak', { n: streak })] : []),
    ...(url ? [url] : []),
  ].join('\n');
}
