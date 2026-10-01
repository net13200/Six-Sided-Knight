/**
 * Ads and portal events. The web build has none, and neither does the
 * CrazyGames Basic Launch build. A portal SDK wrapper implements this
 * interface; without the SDK (blocked, or running locally) every call must be
 * a no-op, so the game never waits on it.
 */
export interface Ads {
  /** The game has loaded (the title screen is up). */
  loaded(): void;
  /** The player is playing (a level is on screen) / stopped playing. */
  gameplayStart(): void;
  gameplayStop(): void;
  /** A natural break. Resolves when the game may go on (after an ad, or at once). */
  commercialBreak(onAdStart?: () => void): Promise<void>;
  /** An ad the player chose to watch: why it did or didn't earn the reward. */
  rewardedBreak(onAdStart?: () => void): Promise<RewardResult>;
  /** Whether an ad blocker is on (so no rewarded ad can play). */
  adblocked(): Promise<boolean>;
}

/**
 * How a rewarded ad went: watched (reward it), none to show right now
 * (unfilled, too soon after another), blocked by an ad blocker, or failed.
 */
export type RewardResult = 'rewarded' | 'unavailable' | 'adblock' | 'error';

export const NO_ADS: Ads = {
  loaded() {},
  gameplayStart() {},
  gameplayStop() {},
  commercialBreak: () => Promise.resolve(),
  rewardedBreak: () => Promise.resolve('error'),
  adblocked: () => Promise.resolve(false),
};
