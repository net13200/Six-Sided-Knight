/**
 * When the Poki build may ask for an ad break. Poki's SDK paces ads too; this
 * keeps them friendly on top: none until the tutorial is done, never in the
 * middle of a run (Daily Roll, Depths, a Gauntlet's floors), and at most one
 * per 3 minutes or 2 finished levels, whichever comes first. Breaks are only
 * asked for when the player is heading back into play. Pure; the clock comes
 * from the caller.
 */

/** Moments that may carry a break (all lead back into play). */
export type BreakMoment =
  | 'next-level' // "Next level" / "Retry" on the results screen
  | 'map-level' // starting a level from the map or the title screen
  | 'daily-start' // starting a new Daily Roll (not continuing one)
  | 'depths-start' // starting a new Depths run (not continuing one)
  | 'bonus-next'; // the next bonus stage

export interface AdPacing {
  /** A break may come this long after the last one (or the session start)... */
  readonly minGapMs: number;
  /** ...or once this many levels have been finished since, whichever comes first. */
  readonly minLevels: number;
  /** Campaign levels before this index never lead to a break (the tutorial). */
  readonly fromLevel: number;
}

export const DEFAULT_PACING: AdPacing = {
  minGapMs: 3 * 60_000,
  minLevels: 2,
  fromLevel: 10,
};

export class AdPolicy {
  private lastBreak: number;
  private levelsSince = 0;

  constructor(
    sessionStart: number,
    private readonly pacing: AdPacing = DEFAULT_PACING,
  ) {
    this.lastBreak = sessionStart;
  }

  /**
   * Whether this moment may carry a break. `level` is the campaign level the
   * player is heading into (0-based), for the moments that have one;
   * `tutorialDone` is whether the player has finished the tutorial.
   */
  allows(
    now: number,
    moment: BreakMoment,
    level: number | undefined,
    tutorialDone: boolean,
  ): boolean {
    if (!tutorialDone) return false;
    if ((moment === 'next-level' || moment === 'map-level') && (level ?? 0) < this.pacing.fromLevel)
      return false;
    return (
      now - this.lastBreak >= this.pacing.minGapMs || this.levelsSince >= this.pacing.minLevels
    );
  }

  /** A level (or floor, or bonus stage) was finished. */
  levelDone(): void {
    this.levelsSince++;
  }

  /** An ad break (or a rewarded ad) was shown: start counting again. */
  took(now: number): void {
    this.lastBreak = now;
    this.levelsSince = 0;
  }
}
