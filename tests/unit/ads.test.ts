/** The Poki build's ads: pacing rules, and the SDK wrapper never breaking the game. */
import { describe, expect, it } from 'vitest';
import { FIRST_AD_LEVEL, breakAllowed } from '../../src/meta/ad-policy';
import { createPokiAds } from '../../src/platform/ads';

describe('where ad breaks may come', () => {
  it('only after the tutorial, never heading into a tutorial level; how often is up to Poki', () => {
    expect(breakAllowed('daily-start', undefined, false)).toBe(false);
    expect(breakAllowed('next-level', 9, true)).toBe(false);
    expect(breakAllowed('map-level', 3, true)).toBe(false);
    expect(breakAllowed('next-level', FIRST_AD_LEVEL, true)).toBe(true);
    expect(breakAllowed('daily-start', undefined, true)).toBe(true);
    // No spacing of our own: back-to-back moments are all allowed.
    expect(breakAllowed('next-level', 20, true)).toBe(true);
    expect(breakAllowed('next-level', 21, true)).toBe(true);
  });
});

type Calls = string[];
function fakeWindow(calls: Calls, opts: { initFails?: boolean } = {}) {
  return {
    PokiSDK: {
      init: async () => {
        calls.push('init');
        if (opts.initFails) throw new Error('adblock');
      },
      gameLoadingFinished: () => calls.push('loaded'),
      gameplayStart: () => calls.push('start'),
      gameplayStop: () => calls.push('stop'),
      commercialBreak: async (cb?: () => void) => {
        calls.push('break');
        cb?.();
      },
      rewardedBreak: async () => {
        calls.push('rewarded');
        return true;
      },
    },
  } as unknown as Window;
}

describe('Poki SDK wrapper', () => {
  it('initialises once and forwards events; start/stop only on changes', async () => {
    const calls: Calls = [];
    const ads = createPokiAds(fakeWindow(calls));
    ads.loaded();
    ads.gameplayStart();
    ads.gameplayStart();
    ads.gameplayStop();
    await ads.commercialBreak();
    expect(await ads.rewardedBreak()).toBe(true);
    expect(calls).toEqual(['init', 'loaded', 'start', 'stop', 'break', 'rewarded']);
  });

  it('without the SDK, or when init fails (ad blocker), everything is a quiet no-op', async () => {
    const none = createPokiAds({} as Window);
    await expect(none.commercialBreak()).resolves.toBeUndefined();
    expect(await none.rewardedBreak()).toBe(false);
    const calls: Calls = [];
    const blocked = createPokiAds(fakeWindow(calls, { initFails: true }));
    blocked.loaded();
    await blocked.commercialBreak();
    expect(calls).toEqual(['init']);
  });
});
