import { expect, test, type Page } from '@playwright/test';
import { KEY, playCurrentLevel, scene, solutionFor } from '../e2e/helpers';

/** A stand-in Poki SDK that records every call; each ad "plays" for 100 ms. */
const STUB = `
  window.__poki = [];
  window.PokiSDK = {
    init: () => { __poki.push('init'); return Promise.resolve(); },
    gameLoadingFinished: () => __poki.push('loaded'),
    gameplayStart: () => __poki.push('start'),
    gameplayStop: () => __poki.push('stop'),
    commercialBreak: (cb) => { __poki.push('break'); cb && cb(); return new Promise((r) => setTimeout(r, 100)); },
    rewardedBreak: () => { __poki.push('rewarded'); return Promise.resolve(true); },
  };`;

async function withSdk(page: Page, pacing?: object): Promise<void> {
  await page.route('**/poki-sdk.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: STUB }),
  );
  if (pacing)
    await page.addInitScript(
      (p) => localStorage.setItem('ssk.adpacing', JSON.stringify(p)),
      pacing,
    );
}
const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __poki: string[] }).__poki);
const NO_WAIT = { firstAfterMs: 0, minGapMs: 0, fromLevel: 0 };

test('a portal-ready build: SDK up, loading reported, no splash, no install bits', async ({
  page,
}) => {
  await withSdk(page);
  await page.goto('/');
  await expect.poll(() => scene(page)).toBe('menu');
  await expect.poll(() => calls(page)).toEqual(['init', 'loaded']);
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)),
  ).toBe(0);
});

test('still runs when the SDK is blocked (ad blocker)', async ({ page }) => {
  await page.route('**/poki-sdk.js', (r) => r.abort());
  await page.goto('/');
  await expect.poll(() => scene(page)).toBe('menu');
});

test('gameplay events, and a break before the next level (then play goes on)', async ({ page }) => {
  await withSdk(page, NO_WAIT);
  await page.goto('/?level=1');
  await expect.poll(() => scene(page)).toBe('play');
  for (const d of solutionFor(0)) await page.keyboard.press(KEY[d]);
  await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
  await page.getByTestId('next').click();
  await expect.poll(() => scene(page)).toBe('play');
  const c = await calls(page);
  expect(c).toContain('break');
  // Play stops before the ad and starts again after it.
  const i = c.indexOf('break');
  expect(c.slice(0, i)).toContain('stop');
  expect(c.slice(i)).toContain('start');
});

test('default pacing: no ads in the first minutes or the tutorial', async ({ page }) => {
  await withSdk(page);
  await page.goto('/?level=1');
  await expect.poll(() => scene(page)).toBe('play');
  for (const d of solutionFor(0)) await page.keyboard.press(KEY[d]);
  await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
  await page.getByTestId('next').click();
  await expect.poll(() => scene(page)).toBe('play');
  expect(await calls(page)).not.toContain('break');
});

test('Daily Roll: a break may come before the run, never between its floors', async ({ page }) => {
  test.slow();
  await withSdk(page, NO_WAIT);
  await page.goto('/');
  await page.getByTestId('daily').click();
  await page.getByTestId('daily-start').click();
  await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
  expect((await calls(page)).filter((c) => c === 'break')).toHaveLength(1);
  for (let floor = 1; floor <= 3; floor++) {
    await playCurrentLevel(page);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('floor');
    if (floor < 3) {
      await page.getByTestId('floor-next').click();
      await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
    }
  }
  expect((await calls(page)).filter((c) => c === 'break')).toHaveLength(1);
});
