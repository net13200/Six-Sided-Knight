/**
 * Where a portal build may ask for an ad break. How often ads actually show is
 * up to the portal (its SDK enforces its own spacing), so this only decides
 * the places: never before the tutorial is done, never when heading into a
 * tutorial level, never in the middle of a run (Daily Roll, Depths, a
 * Gauntlet's floors: those moments simply aren't break moments), and only
 * when the player is heading back into play.
 */

/** Moments that may carry a break (all lead back into play). */
export type BreakMoment =
  | 'next-level' // "Next level" / "Retry" on the results screen
  | 'map-level' // starting a level from the map or the title screen
  | 'daily-start' // starting a new Daily Roll (not continuing one)
  | 'depths-start' // starting a new Depths run (not continuing one)
  | 'bonus-next'; // the next bonus stage

/** Campaign levels before this index (the tutorial) never lead to a break. */
export const FIRST_AD_LEVEL = 10;

/**
 * Whether this moment may carry a break. `level` is the campaign level the
 * player is heading into (0-based), for the moments that have one.
 */
export function breakAllowed(
  moment: BreakMoment,
  level: number | undefined,
  tutorialDone: boolean,
): boolean {
  if (!tutorialDone) return false;
  if ((moment === 'next-level' || moment === 'map-level') && (level ?? 0) < FIRST_AD_LEVEL)
    return false;
  return true;
}
