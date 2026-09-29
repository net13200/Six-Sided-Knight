import { expect, test, type Page } from '@playwright/test';
import { KEY, campaign, playCurrentLevel, scene, solutionFor } from '../e2e/helpers';

/** A stand-in Poki SDK that records every call; each ad "plays" for 100 ms. */
const STUB = `
  window.__poki = [];
  window.PokiSDK = {
    init: () => { __poki.push('init'); return Promise.resolve(); },
    gameLoadingFinished: () => __poki.push('loaded'),
    gameplayStart: () => __poki.push('start'),
    gameplayStop: () => __poki.push('stop'),
    commercialBreak: (cb) => { __poki.push('break'); cb && cb(); return new Promise((r) => setTimeout(r, 100)); },
    rewardedBreak: () => { __poki.push('rewarded'); return Promise.resolve(!window.__noReward); },
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
const NO_WAIT = { minGapMs: 0, minLevels: 0, fromLevel: 0 };
const breaks = async (page: Page) => (await calls(page)).filter((c) => c === 'break').length;

/** A player who has finished the tutorial (levels 1-10). */
async function tutorialDone(page: Page): Promise<void> {
  await page.addInitScript(
    (ids) => {
      if (localStorage.getItem('ssk.save')) return;
      localStorage.setItem(
        'ssk.save',
        JSON.stringify({
          version: 3,
          createdAt: 1,
          campaign: 2,
          levels: Object.fromEntries(
            ids.map((id) => [id, { stars: 3, bestMoves: 9, completions: 1, bestTimeMs: 9000 }]),
          ),
        }),
      );
    },
    campaign.slice(0, 10).map((l) => l.id),
  );
}

/** Solves campaign level `index` (0-based) on screen, then waits for the results. */
async function solve(page: Page, index: number): Promise<void> {
  await expect.poll(() => scene(page)).toBe('play');
  const card = page.getByTestId('lesson');
  while (await card.isVisible()) await page.getByTestId('lesson-ok').click();
  for (const d of solutionFor(index)) await page.keyboard.press(KEY[d]);
  await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
}

test('a portal-ready build: SDK up, loading reported, splash kept, no install bits', async ({
  page,
}) => {
  await withSdk(page);
  await page.goto('/');
  await expect.poll(() => scene(page)).toBe('menu');
  await expect.poll(() => calls(page)).toEqual(['init', 'loaded']);
  // The SugiGames splash is kept (it hides itself for automated browsers).
  expect(await (await page.request.get('/')).text()).toContain('id="splash"');
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
  await tutorialDone(page);
  await page.goto('/?level=11');
  await solve(page, 10);
  await page.getByTestId('next').click();
  await expect.poll(() => scene(page)).toBe('play');
  const c = await calls(page);
  expect(c).toContain('break');
  // Play stops before the ad and starts again after it.
  const i = c.indexOf('break');
  expect(c.slice(0, i)).toContain('stop');
  expect(c.slice(i)).toContain('start');
});

test('no ads in the tutorial, even when the pacing would allow one', async ({ page }) => {
  await withSdk(page, NO_WAIT);
  await page.goto('/?level=1');
  await solve(page, 0);
  await page.getByTestId('next').click();
  await expect.poll(() => scene(page)).toBe('play');
  expect(await breaks(page)).toBe(0);
});

test('default pacing: a break after 2 finished levels (before 3 minutes are up)', async ({
  page,
}) => {
  test.slow();
  await withSdk(page);
  await tutorialDone(page);
  await page.goto('/?level=11');
  await solve(page, 10);
  await page.getByTestId('next').click(); // 1 level finished: no break yet
  await solve(page, 11);
  expect(await breaks(page)).toBe(0);
  await page.getByTestId('next').click(); // 2 levels: a break
  await expect.poll(() => scene(page)).toBe('play');
  expect(await breaks(page)).toBe(1);
});

test('rewarded ad: "Solve" asks first, then shows the solution', async ({ page }) => {
  await withSdk(page);
  await tutorialDone(page);
  await page.goto('/?level=11');
  await expect.poll(() => scene(page)).toBe('play');
  await page.getByTestId('solution-ad').click();
  await expect(page.getByTestId('solution-ad-sheet')).toContainText('ad');
  await page.getByTestId('solution-ad-watch').click();
  await expect(page.getByTestId('watch-any')).toBeVisible({ timeout: 10_000 });
  expect(await calls(page)).toContain('rewarded');
  // No ad to show: the game says so, and play goes on.
  await page.getByTestId('watch-cancel').click();
  await page.evaluate(() => ((window as unknown as { __noReward: boolean }).__noReward = true));
  await page.getByTestId('solution-ad').click();
  await page.getByTestId('solution-ad-watch').click();
  await expect(page.getByTestId('notice')).toContainText('No ad');
  await expect(page.getByTestId('watch-any')).toHaveCount(0);
});

test('no "Solve" in the tutorial', async ({ page }) => {
  await withSdk(page);
  await page.goto('/?level=2');
  await expect.poll(() => scene(page)).toBe('play');
  await expect(page.getByTestId('solution-ad')).toHaveCount(0);
});

test('Daily Roll: a break may come before the run, never between its floors', async ({ page }) => {
  test.slow();
  await withSdk(page, NO_WAIT);
  await tutorialDone(page);
  await page.goto('/');
  await page.getByTestId('daily').click();
  await page.getByTestId('daily-start').click();
  await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
  expect(await breaks(page)).toBe(1);
  await expect(page.getByTestId('solution-ad')).toHaveCount(0); // no solutions in the Daily
  for (let floor = 1; floor <= 3; floor++) {
    await playCurrentLevel(page);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('floor');
    if (floor < 3) {
      await page.getByTestId('floor-next').click();
      await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
    }
  }
  expect(await breaks(page)).toBe(1);
});
