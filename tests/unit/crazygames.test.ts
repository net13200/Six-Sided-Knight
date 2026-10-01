/** The CrazyGames SDK wrapper: events, ads, Data-module saves, and never breaking the game. */
import { describe, expect, it } from 'vitest';
import {
  connectCrazyGames,
  createCrazyAds,
  createCrazyStorage,
  type CrazySdk,
} from '../../src/platform/crazygames';
import type { KeyValueStorage } from '../../src/platform/platform';

function memory(
  init: Record<string, string> = {},
): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    get: (k) => (k in data ? data[k]! : null),
    set: (k, v) => ((data[k] = v), true),
    remove: (k) => void delete data[k],
  };
}

function fakeSdk(
  opts: { ad?: 'finish' | 'unfilled' | 'adblock'; env?: CrazySdk['environment'] } = {},
) {
  const calls: string[] = [];
  const data: Record<string, string> = {};
  const sdk: CrazySdk = {
    environment: opts.env ?? 'crazygames',
    init: async () => void calls.push('init'),
    game: {
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      gameplayStart: () => calls.push('start'),
      gameplayStop: () => calls.push('stop'),
      happytime: () => calls.push('happy'),
      settings: { muteAudio: false },
      addSettingsChangeListener: () => undefined,
    },
    ad: {
      requestAd: (type, cb) => {
        calls.push(type);
        if ((opts.ad ?? 'finish') === 'finish') {
          cb.adStarted?.();
          cb.adFinished?.();
        } else cb.adError?.({ code: opts.ad });
      },
      hasAdblock: async () => opts.ad === 'adblock',
    },
    data: {
      getItem: (k) => (k in data ? data[k]! : null),
      setItem: (k, v) => void (data[k] = v),
      removeItem: (k) => void delete data[k],
    },
  };
  return { sdk, calls, data };
}

describe('CrazyGames SDK', () => {
  it('connects once initialised; not when missing, disabled or failing', async () => {
    const { sdk, calls } = fakeSdk();
    expect(await connectCrazyGames({ CrazyGames: { SDK: sdk } } as unknown as Window)).toBe(sdk);
    expect(calls).toEqual(['init']);
    expect(await connectCrazyGames({} as Window)).toBeNull();
    const off = fakeSdk({ env: 'disabled' }).sdk;
    expect(await connectCrazyGames({ CrazyGames: { SDK: off } } as unknown as Window)).toBeNull();
    const broken = { ...fakeSdk().sdk, init: () => Promise.reject(new Error('blocked')) };
    expect(
      await connectCrazyGames({ CrazyGames: { SDK: broken } } as unknown as Window),
    ).toBeNull();
    const slow = { ...fakeSdk().sdk, init: () => new Promise<void>(() => undefined) };
    expect(
      await connectCrazyGames({ CrazyGames: { SDK: slow } } as unknown as Window, 10),
    ).toBeNull();
  });

  it('gameplay events only on changes; loading done once', () => {
    const { sdk, calls } = fakeSdk();
    const ads = createCrazyAds(sdk);
    ads.loaded();
    ads.loaded();
    ads.gameplayStart();
    ads.gameplayStart();
    ads.gameplayStop();
    ads.gameplayStop();
    expect(calls).toEqual(['loadingStop', 'start', 'stop']);
  });

  it('ads: the reward only when watched; sound goes only when an ad starts', async () => {
    let started = 0;
    const ok = createCrazyAds(fakeSdk().sdk);
    expect(await ok.rewardedBreak(() => started++)).toBe('rewarded');
    await ok.commercialBreak(() => started++);
    expect(started).toBe(2);
    expect(
      await createCrazyAds(fakeSdk({ ad: 'unfilled' }).sdk).rewardedBreak(() => started++),
    ).toBe('unavailable');
    const blocked = createCrazyAds(fakeSdk({ ad: 'adblock' }).sdk);
    expect(await blocked.rewardedBreak()).toBe('adblock');
    expect(await blocked.adblocked()).toBe(true);
    await expect(blocked.commercialBreak()).resolves.toBeUndefined();
    expect(started).toBe(2);
  });

  it('progress lives in the Data module; local progress is copied over once', () => {
    const { sdk, data } = fakeSdk();
    const local = memory({ 'ssk.save': '{"old":1}', 'ssk.analytics': 'a' });
    const store = createCrazyStorage(sdk, local, ['ssk.save']);
    expect(data['ssk.save']).toBe('{"old":1}');
    store.set('ssk.save', '{"new":2}');
    expect(store.get('ssk.save')).toBe('{"new":2}');
    expect(local.data['ssk.save']).toBe('{"old":1}'); // the local copy is left alone
    // Other keys stay local.
    store.set('ssk.analytics', 'b');
    expect(local.data['ssk.analytics']).toBe('b');
    expect(data['ssk.analytics']).toBeUndefined();
    // Already in the Data module (another device, a logged-in player): not overwritten.
    const again = createCrazyStorage(sdk, memory({ 'ssk.save': '{"stale":0}' }), ['ssk.save']);
    expect(again.get('ssk.save')).toBe('{"new":2}');
  });
});
