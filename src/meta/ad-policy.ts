/**
 * When the Poki build may ask for an ad break. Poki's SDK paces ads too; this
 * keeps them friendly on top: never in the tutorial, never in the middle of a
 * run (Daily Roll, Depths, a Gauntlet's floors), not in the first minutes of a
 * session, and a few minutes apart. Breaks are only asked for when the player
 * is heading back into play. Pure; the clock comes from the caller.
 */

/** Moments that may carry a break (all lead back into play). */
export type BreakMoment =
  | 'next-level' // "Next level" / "Retry" / "Epilogue" on the results screen
  | 'map-level' // starting a level from the map
  | 'daily-start' // starting a new Daily Roll (not continuing one)
  | 'depths-start' // starting a new Depths run (not continuing one)
  | 'bonus-next'; // the next bonus stage

export interface AdPacing {
  /** No break until this long into the session. */
  readonly firstAfterMs: number;
  /** At least this long between breaks. */
  readonly minGapMs: number;
  /** Campaign levels before this index never lead to a break (the tutorial). */
  readonly fromLevel: number;
}

export const DEFAULT_PACING: AdPacing = {
  firstAfterMs: 3 * 60_000,
  minGapMs: 3 * 60_000,
  fromLevel: 10,
};

export class AdPolicy {
  private lastBreak = -Infinity;

  constructor(
    private readonly sessionStart: number,
    private readonly pacing: AdPacing = DEFAULT_PACING,
  ) {}

  /**
   * Whether this moment may carry a break. `level` is the campaign level the
   * player is heading into (0-based), for the moments that have one.
   */
  allows(now: number, moment: BreakMoment, level?: number): boolean {
    if (now - this.sessionStart < this.pacing.firstAfterMs) return false;
    if (now - this.lastBreak < this.pacing.minGapMs) return false;
    if ((moment === 'next-level' || moment === 'map-level') && (level ?? 0) < this.pacing.fromLevel)
      return false;
    return true;
  }

  /** A break was asked for (whether or not the SDK showed an ad). */
  took(now: number): void {
    this.lastBreak = now;
  }
}
