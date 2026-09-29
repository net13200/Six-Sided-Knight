/** The Poki build's ads: pacing rules, and the SDK wrapper never breaking the game. */
import { describe, expect, it } from 'vitest';
import { AdPolicy, DEFAULT_PACING } from '../../src/meta/ad-policy';
import { createPokiAds } from '../../src/platform/ads';

const MIN = 60_000;

describe('ad pacing', () => {
  it('no break in the first minutes of a session', () => {
    const p = new AdPolicy(0);
    expect(p.allows(2 * MIN, 'daily-start')).toBe(false);
    expect(p.allows(DEFAULT_PACING.firstAfterMs, 'daily-start')).toBe(true);
  });

  it('breaks are minutes apart', () => {
    const p = new AdPolicy(0);
    const t = 10 * MIN;
    expect(p.allows(t, 'next-level', 20)).toBe(true);
    p.took(t);
    expect(p.allows(t + 2 * MIN, 'next-level', 21)).toBe(false);
    expect(p.allows(t + 3 * MIN, 'next-level', 21)).toBe(true);
  });

  it('never in the tutorial', () => {
    const p = new AdPolicy(0);
    expect(p.allows(30 * MIN, 'next-level', 9)).toBe(false);
    expect(p.allows(30 * MIN, 'map-level', 3)).toBe(false);
    expect(p.allows(30 * MIN, 'next-level', 10)).toBe(true);
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
