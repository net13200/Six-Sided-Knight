/**
 * Ads and portal events. The web build has none; the Poki build (vite
 * --mode poki) talks to the Poki SDK, which Poki's page loads for us.
 * Without the SDK (blocked, or running locally) every call is a no-op, so the
 * game never waits on it.
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

interface PokiSDKApi {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  rewardedBreak(onStart?: () => void): Promise<boolean>;
}

declare global {
  interface Window {
    PokiSDK?: PokiSDKApi;
  }
}

/** Poki's SDK, if its script loaded. Initialised once; failures fall back to no ads. */
export function createPokiAds(win: Window = window): Ads {
  const sdk = (): PokiSDKApi | null => win.PokiSDK ?? null;
  const ready: Promise<boolean> = (async () => {
    const s = sdk();
    if (!s) return false;
    try {
      await s.init();
      return true;
    } catch {
      // Poki's docs: an ad blocker makes init fail; the game still runs.
      return false;
    }
  })();
  let playing = false;
  const safe = (fn: (s: PokiSDKApi) => void) => {
    void ready.then((ok) => {
      const s = sdk();
      if (ok && s) {
        try {
          fn(s);
        } catch {
          // never let the SDK break the game
        }
      }
    });
  };
  return {
    loaded: () => safe((s) => s.gameLoadingFinished()),
    gameplayStart() {
      if (playing) return;
      playing = true;
      safe((s) => s.gameplayStart());
    },
    gameplayStop() {
      if (!playing) return;
      playing = false;
      safe((s) => s.gameplayStop());
    },
    async commercialBreak(onAdStart) {
      const s = sdk();
      if (!(await ready) || !s) return;
      try {
        await s.commercialBreak(onAdStart);
      } catch {
        // go on without the ad
      }
    },
    async rewardedBreak(onAdStart) {
      const s = sdk();
      if (!(await ready) || !s) return false;
      try {
        return await s.rewardedBreak(onAdStart);
      } catch {
        return false;
      }
    },
  };
}
