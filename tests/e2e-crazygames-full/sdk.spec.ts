import { expect, test, type Page } from '@playwright/test';
import {
  campaign,
  dismissLesson,
  gameState,
  KEY,
  scene,
  solutionFor,
  tutorialFingerprints,
  waitForMoves,
} from '../e2e/helpers';

interface Preset {
  ad?: 'finish' | 'unfilled' | 'adblock';
  adblock?: boolean;
  mute?: boolean;
  locale?: string;
  data?: Record<string, string>;
}

/** A stand-in CrazyGames SDK that records every call; each ad "plays" for 100 ms. */
const STUB = `
  (() => {
    const p = window.__cgPreset || {};
    const cg = (window.__cg = { calls: [], data: { ...(p.data || {}) }, listeners: [] });
    window.CrazyGames = { SDK: {
      environment: 'crazygames',
      init: () => { cg.calls.push('init'); return Promise.resolve(); },
      game: {
        loadingStart: () => cg.calls.push('loadingStart'),
        loadingStop: () => cg.calls.push('loadingStop'),
        gameplayStart: () => cg.calls.push('start'),
        gameplayStop: () => cg.calls.push('stop'),
        happytime: () => cg.calls.push('happy'),
        reportGameCompletedPercentage: (n) => cg.calls.push('progress:' + n),
        setGameContext: (c) => cg.calls.push('context:' + c.level),
        clearGameContext: () => cg.calls.push('context:none'),
        get settings() { return { muteAudio: !!p.mute }; },
        addSettingsChangeListener: (f) => cg.listeners.push(f),
      },
      ad: {
        requestAd: (type, cb) => {
          cg.calls.push('ad:' + type);
          setTimeout(() => {
            if ((p.ad || 'finish') === 'finish') {
              cb.adStarted && cb.adStarted();
              setTimeout(() => cb.adFinished && cb.adFinished(), 100);
            } else cb.adError && cb.adError({ code: p.ad });
          }, 50);
        },
        hasAdblock: () => Promise.resolve(!!p.adblock),
      },
      data: {
        getItem: (k) => (k in cg.data ? cg.data[k] : null),
        setItem: (k, v) => { cg.data[k] = String(v); },
        removeItem: (k) => { delete cg.data[k]; },
      },
      user: { systemInfo: { locale: p.locale || 'en-US' } },
    } };
  })();`;

async function withSdk(page: Page, preset: Preset = {}): Promise<void> {
  await page.addInitScript(
    (p) => ((window as unknown as { __cgPreset: Preset }).__cgPreset = p),
    preset,
  );
  await page.route('**/crazygames-sdk-v3.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: STUB }),
  );
}
const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cg: { calls: string[] } }).__cg.calls);
const cgData = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cg: { data: Record<string, string> } }).__cg.data);

/** Saved progress (as the Data module holds it): the tutorial done, some crowns. */
function veteranSave(crowns = 0): string {
  const fps = tutorialFingerprints();
  return JSON.stringify({
    version: 3,
    createdAt: 1,
    campaign: 2,
    levels: Object.fromEntries(
      campaign
        .slice(0, 10)
        .map((l, i) => [
          l.id,
          { stars: 3, bestMoves: 9, completions: 1, bestTimeMs: 9000, fp: fps[i] },
        ]),
    ),
    wallet: { crowns, earned: crowns, spent: 0 },
    hints: { inspect: true, 'story:intro': true, 'story:ch1': true, 'story:ch2': true },
    settings: { muted: true },
  });
}

/** Retries level `index` three times, so "Stuck?" comes up. */
async function struggle(page: Page, index: number): Promise<void> {
  const first = KEY[solutionFor(index)[0]!];
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press(first);
    await expect.poll(async () => (await gameState(page)).stats.moves).toBe(1);
    await page.keyboard.press('r');
    await waitForMoves(page, 0);
  }
  await expect(page.getByTestId('solve-sheet')).toBeVisible();
}

test('starts with the SDK: loading reported, straight into level 1, progress in the Data module', async ({
  page,
}) => {
  await withSdk(page);
  await page.goto('/');
  await expect.poll(() => scene(page)).toBe('play');
  await expect.poll(() => calls(page)).toContain('loadingStop');
  const c = await calls(page);
  expect(c.slice(0, 2)).toEqual(['init', 'loadingStart']);
  expect(c).toContain('progress:0');
  expect(c).toContain('context:1. First Roll');
  // The first real move: gameplay starts.
  await dismissLesson(page);
  await page.keyboard.press(KEY[solutionFor(0)[0]!]);
  await expect.poll(() => calls(page)).toContain('start');
  // Progress is saved through the Data module, not local storage.
  await expect.poll(async () => (await cgData(page))['ssk.save'] ?? '').toContain('"version"');
  expect(await page.evaluate(() => localStorage.getItem('ssk.save'))).toBeNull();
});

test('progress saved before the SDK (local storage) is copied into the Data module', async ({
  page,
}) => {
  await withSdk(page);
  await page.addInitScript((s) => localStorage.setItem('ssk.save', s), veteranSave(77));
  await page.goto('/');
  await expect.poll(() => scene(page)).toBe('menu');
  const saved = JSON.parse((await cgData(page))['ssk.save']!);
  expect(saved.wallet.crowns).toBe(77);
  expect(await calls(page)).toContain('progress:17'); // 10 of 60 levels
});

test('a midgame ad between levels; the game waits for it, then goes on', async ({ page }) => {
  await withSdk(page, { data: { 'ssk.save': veteranSave() } });
  await page.goto('/?level=11');
  await expect.poll(() => scene(page)).toBe('play');
  for (const d of solutionFor(10)) await page.keyboard.press(KEY[d]);
  await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
  await page.getByTestId('next').click();
  await expect.poll(() => calls(page)).toContain('ad:midgame');
  // While the ad is on: no button responds.
  await expect(page.locator('.stage.ad-playing')).toHaveCount(1);
  await expect.poll(() => scene(page)).toBe('play');
  await expect(page.locator('.stage.ad-playing')).toHaveCount(0);
  const c = await calls(page);
  expect(c.indexOf('stop')).toBeLessThan(c.indexOf('ad:midgame'));
});

test('stuck: watch an ad, then the solution plays', async ({ page }) => {
  await withSdk(page, { data: { 'ssk.save': veteranSave(0) } });
  await page.goto('/?level=12');
  await expect.poll(() => scene(page)).toBe('play');
  await struggle(page, 11);
  await expect(page.getByTestId('solve-crowns')).toBeDisabled(); // no crowns
  await page.getByTestId('solve-ad').click();
  await expect.poll(() => calls(page)).toContain('ad:rewarded');
  await expect(page.getByTestId('watch-bar')).toBeVisible();
});

test('stuck, but no ad right now: no reward, and a note to try later', async ({ page }) => {
  await withSdk(page, { ad: 'unfilled', data: { 'ssk.save': veteranSave(0) } });
  await page.goto('/?level=12');
  await expect.poll(() => scene(page)).toBe('play');
  await struggle(page, 11);
  await page.getByTestId('solve-ad').click();
  await expect(page.getByTestId('notice')).toBeVisible();
  await expect(page.getByTestId('watch-bar')).toHaveCount(0);
});

test('stuck with an ad blocker: the ad button is off (with a note), crowns still work', async ({
  page,
}) => {
  await withSdk(page, { adblock: true, data: { 'ssk.save': veteranSave(120) } });
  await page.goto('/?level=12');
  await expect.poll(() => scene(page)).toBe('play');
  await struggle(page, 11);
  await expect(page.getByTestId('solve-ad')).toBeDisabled();
  await expect(page.getByTestId('solve-sheet')).toContainText('blocked');
  await page.getByTestId('solve-crowns').click();
  await expect(page.getByTestId('watch-bar')).toBeVisible();
});

test("their mute setting wins over the game's Sound button", async ({ page }) => {
  await withSdk(page, { mute: true, data: { 'ssk.save': veteranSave() } });
  await page.goto('/');
  await expect.poll(() => scene(page)).toBe('menu');
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true');
});

test('the language follows their locale', async ({ page }) => {
  await withSdk(page, { locale: 'de-DE' });
  await page.goto('/');
  await expect.poll(() => scene(page)).toBe('play');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

test('still runs when the SDK is blocked: no ads, saves on the device', async ({ page }) => {
  await page.route('**/crazygames-sdk-v3.js', (r) => r.abort());
  await page.goto('/');
  await expect.poll(() => scene(page)).toBe('play');
  await page.keyboard.press(KEY[solutionFor(0)[0]!]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ssk.save'))).not.toBeNull();
});

test('a celebration when a whole district reaches ★★★ (not for every level)', async ({ page }) => {
  const save = JSON.parse(veteranSave());
  save.levels['c1-10'].stars = 2; // one short of a gold district
  await withSdk(page, { data: { 'ssk.save': JSON.stringify(save) } });
  await page.goto('/?level=9');
  await expect.poll(() => scene(page)).toBe('play');
  for (const d of solutionFor(8)) await page.keyboard.press(KEY[d]);
  await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
  expect(await calls(page)).not.toContain('happy');
  await page.goto('/?level=10');
  await expect.poll(() => scene(page)).toBe('play');
  for (const d of solutionFor(9)) await page.keyboard.press(KEY[d]);
  await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
  await expect.poll(() => calls(page)).toContain('happy');
});
