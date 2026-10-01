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
  /** An ad the player chose to watch; resolves true if they earned the reward. */
  rewardedBreak(onAdStart?: () => void): Promise<boolean>;
}

export const NO_ADS: Ads = {
  loaded() {},
  gameplayStart() {},
  gameplayStop() {},
  commercialBreak: () => Promise.resolve(),
  rewardedBreak: () => Promise.resolve(false),
};
