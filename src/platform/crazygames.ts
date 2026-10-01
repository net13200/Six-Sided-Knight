/**
 * CrazyGames' SDK (v3) for the Full Launch build (`npm run build:crazygames:full`):
 * gameplay and loading events, midgame and rewarded video ads, ad-blocker
 * detection, saves through their Data module (synced to the player's account),
 * their mute setting and locale, celebrations, completion percentage and the
 * game context sent with player feedback.
 *
 * Their rules this follows: everything works with an ad blocker or without the
 * SDK at all (every call here is then a quiet no-op); the game is paused and
 * silent while an ad plays (muted only once it starts); their `muteAudio`
 * setting wins over our own Sound button; progress lives only in the Data
 * module, with existing local progress copied over once.
 */
import type { Ads, RewardResult } from './ads';
import { NO_ADS } from './ads';
import { createBrowserPlatform } from './browser';
import type { KeyValueStorage, Platform, PortalHooks } from './platform';

/** The parts of `window.CrazyGames.SDK` the game uses. */
export interface CrazySdk {
  init(): Promise<void>;
  /** 'local' (localhost: demo ads), 'crazygames', or 'disabled' (anywhere else: every call throws). */
  readonly environment: 'local' | 'crazygames' | 'disabled';
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    reportGameCompletedPercentage?(pct: number): void;
    setGameContext?(ctx: Record<string, string | number>): void;
    clearGameContext?(): void;
    readonly settings: { readonly muteAudio?: boolean };
    addSettingsChangeListener(fn: (s: { muteAudio?: boolean }) => void): void;
  };
  ad: {
    requestAd(
      type: 'midgame' | 'rewarded',
      callbacks: {
        adStarted?: () => void;
        adFinished?: () => void;
        adError?: (e: { code?: string; message?: string }) => void;
      },
    ): void;
    hasAdblock(): Promise<boolean>;
  };
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  user?: { readonly systemInfo?: { readonly locale?: string } };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazySdk };
  }
}

/** Never let the SDK break the game. */
function quietly(fn: () => void): void {
  try {
    fn();
  } catch {
    // ignored: the SDK is optional to the game
  }
}

/**
 * Waits for the SDK (loaded by index.html) to initialise. Null if it's missing
 * (blocked), fails, takes too long, or is disabled on this domain.
 */
export async function connectCrazyGames(
  win: Window = window,
  timeoutMs = 5000,
): Promise<CrazySdk | null> {
  const sdk = win.CrazyGames?.SDK;
  if (!sdk) return null;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>(
      (r) => (timer = setTimeout(() => r('timeout'), timeoutMs)),
    );
    const result = await Promise.race([sdk.init().then(() => 'ok' as const), timeout]);
    clearTimeout(timer);
    if (result !== 'ok') return null;
  } catch {
    return null;
  }
  return sdk.environment === 'disabled' ? null : sdk;
}

/** Video ads and gameplay events through the SDK. */
export function createCrazyAds(sdk: CrazySdk): Ads {
  let playing = false;
  let loaded = false;
  const request = (type: 'midgame' | 'rewarded', onAdStart?: () => void): Promise<RewardResult> =>
    new Promise((resolve) => {
      try {
        sdk.ad.requestAd(type, {
          adStarted: () => onAdStart?.(),
          adFinished: () => resolve('rewarded'),
          adError: (e) => resolve(e?.code === 'adblock' ? 'adblock' : 'unavailable'),
        });
      } catch {
        resolve('error');
      }
    });
  return {
    loaded() {
      if (loaded) return;
      loaded = true;
      quietly(() => sdk.game.loadingStop());
    },
    gameplayStart() {
      if (playing) return;
      playing = true;
      quietly(() => sdk.game.gameplayStart());
    },
    gameplayStop() {
      if (!playing) return;
      playing = false;
      quietly(() => sdk.game.gameplayStop());
    },
    // Their SDK spaces midgame ads itself (one every 3 minutes at most): a
    // request that comes too soon is simply ignored, so we ask at every
    // natural break.
    async commercialBreak(onAdStart) {
      await request('midgame', onAdStart);
    },
    rewardedBreak(onAdStart) {
      return request('rewarded', onAdStart);
    },
    async adblocked() {
      try {
        return await sdk.ad.hasAdblock();
      } catch {
        return false;
      }
    },
  };
}

/** Keys that hold the player's progress: these live in the Data module. */
const PROGRESS_KEY = /^ssk\.save/;

/**
 * Storage through the Data module for progress (synced to the player's
 * CrazyGames account; guests' data stays on the device and moves to their
 * account when they log in), local storage for everything else. Progress
 * already saved locally (a player from before the SDK) is copied over once.
 */
export function createCrazyStorage(
  sdk: CrazySdk,
  local: KeyValueStorage,
  keys: readonly string[],
): KeyValueStorage {
  for (const key of keys) {
    quietly(() => {
      if (sdk.data.getItem(key) !== null) return;
      const old = local.get(key);
      if (old !== null) sdk.data.setItem(key, old);
    });
  }
  return {
    get(key) {
      if (!PROGRESS_KEY.test(key)) return local.get(key);
      try {
        return sdk.data.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      if (!PROGRESS_KEY.test(key)) return local.set(key, value);
      try {
        sdk.data.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      if (!PROGRESS_KEY.test(key)) return local.remove(key);
      quietly(() => sdk.data.removeItem(key));
    },
  };
}

/** The platform's portal hooks, through the SDK. */
function crazyHooks(sdk: CrazySdk): PortalHooks {
  return {
    happytime: () => quietly(() => sdk.game.happytime()),
    progress: (pct) =>
      quietly(() =>
        sdk.game.reportGameCompletedPercentage?.(Math.max(0, Math.min(100, Math.round(pct)))),
      ),
    context: (ctx) =>
      quietly(() => (ctx ? sdk.game.setGameContext?.(ctx) : sdk.game.clearGameContext?.())),
    forcedMute: () => sdk.game.settings?.muteAudio === true,
    onForcedMuteChange: (fn) =>
      quietly(() => sdk.game.addSettingsChangeListener((s) => fn(s?.muteAudio === true))),
  };
}

/**
 * The CrazyGames Full Launch platform: the browser platform with no outside
 * links, plus the SDK when it's there. Without it (blocked, failed, another
 * domain) it's the plain portal platform: no ads, local saves.
 */
export function createCrazyGamesPlatform(
  sdk: CrazySdk | null,
  progressKeys: readonly string[],
): Platform {
  const base = createBrowserPlatform();
  if (!sdk) return { ...base, ads: NO_ADS, shareUrl: null };
  const locale = sdk.user?.systemInfo?.locale;
  return {
    ...base,
    shareUrl: null,
    storage: createCrazyStorage(sdk, base.storage, progressKeys),
    ads: createCrazyAds(sdk),
    portal: crazyHooks(sdk),
    locale: () => locale || base.locale(),
  };
}
