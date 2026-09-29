import { expect, test, type Page } from '@playwright/test';
import {
  KEY,
  campaign,
  playCurrentLevel,
  scene,
  solutionFor,
  tutorialFingerprints,
} from '../e2e/helpers';

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

async function withSdk(page: Page): Promise<void> {
  await page.route('**/poki-sdk.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: STUB }),
  );
}
const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __poki: string[] }).__poki);
const breaks = async (page: Page) => (await calls(page)).filter((c) => c === 'break').length;

/** A player who has finished the tutorial (levels 1-10). */
async function tutorialDone(page: Page): Promise<void> {
  await page.addInitScript(
    ({ ids, fps }) => {
      if (localStorage.getItem('ssk.save')) return;
      localStorage.setItem(
        'ssk.save',
        JSON.stringify({
          version: 3,
          createdAt: 1,
          campaign: 2,
          levels: Object.fromEntries(
            ids.map((id, i) => [
              id,
              { stars: 3, bestMoves: 9, completions: 1, bestTimeMs: 9000, fp: fps[i] },
            ]),
          ),
        }),
      );
    },
    { ids: campaign.slice(0, 10).map((l) => l.id), fps: tutorialFingerprints() },
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
  // A first-time player skips the title screen: the story, then level 1.
  await expect.poll(() => scene(page)).toBe('story');
  await expect.poll(() => calls(page)).toEqual(['init', 'loaded']);
  await page.getByTestId('story-skip').click();
  await expect.poll(() => scene(page)).toBe('play');
  expect(
    await page.evaluate(() =>
      (window as unknown as { __ssk: { levelIndex(): number } }).__ssk.levelIndex(),
    ),
  ).toBe(0);
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
  await expect.poll(() => scene(page)).toBe('story');
});

test('gameplay events follow the player: start on the first move, stop at the end', async ({
  page,
}) => {
  await withSdk(page);
  await tutorialDone(page);
  await page.goto('/?level=11');
  await expect.poll(() => scene(page)).toBe('play');
  expect(await calls(page)).not.toContain('start'); // not on load
  const path = solutionFor(10);
  await page.keyboard.press(KEY[path[0]!]);
  await expect.poll(async () => (await calls(page)).filter((c) => c === 'start').length).toBe(1);
  for (const d of path.slice(1)) await page.keyboard.press(KEY[d]);
  await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
  await page.getByTestId('next').click();
  await expect.poll(() => scene(page)).toBe('play');
  const c = await calls(page);
  // Never the same event twice in a row, and play stops before the ad.
  const events = c.filter((x) => x === 'start' || x === 'stop');
  for (let i = 1; i < events.length; i++) expect(events[i]).not.toBe(events[i - 1]);
  expect(c.lastIndexOf('stop')).toBeLessThan(c.indexOf('break'));
  expect(c.at(-1)).toBe('break'); // the next start comes with the next move
});

test('no ads in the tutorial', async ({ page }) => {
  await withSdk(page);
  await page.goto('/?level=1');
  await solve(page, 0);
  await page.getByTestId('next').click();
  await expect.poll(() => scene(page)).toBe('play');
  expect(await breaks(page)).toBe(0);
});

test('no spacing of our own: every natural moment asks Poki (Poki decides)', async ({ page }) => {
  test.slow();
  await withSdk(page);
  await tutorialDone(page);
  await page.goto('/?level=11');
  await solve(page, 10);
  await page.getByTestId('next').click();
  await solve(page, 11);
  await page.getByTestId('next').click();
  await expect.poll(() => scene(page)).toBe('play');
  expect(await breaks(page)).toBe(2);
});

test('rewarded ad: "Solve" asks first, then plays the solution; no ad, no reward', async ({
  page,
}) => {
  await withSdk(page);
  await tutorialDone(page);
  await page.goto('/?level=11');
  await expect.poll(() => scene(page)).toBe('play');
  await page.getByTestId('solution-ad').click();
  await expect(page.getByTestId('solution-ad-sheet')).toContainText('ad');
  // The plain choice is there too, and at least as big.
  const plain = await page.getByTestId('solution-ad-cancel').boundingBox();
  const reward = await page.getByTestId('solution-ad-watch').boundingBox();
  expect(plain!.width * plain!.height).toBeGreaterThanOrEqual(reward!.width * reward!.height - 1);
  await page.getByTestId('solution-ad-watch').click();
  await expect(page.getByTestId('notice')).toContainText('unlocked');
  await expect(page.getByTestId('watch-bar')).toBeVisible({ timeout: 10_000 });
  expect(await calls(page)).toContain('rewarded');
  await page.getByTestId('watch-stop').click();
  // No ad to show (or an ad blocker): no reward, and no message of our own.
  await page.evaluate(() => ((window as unknown as { __noReward: boolean }).__noReward = true));
  await page.getByTestId('solution-ad').click();
  await page.getByTestId('solution-ad-watch').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('watch-bar')).toHaveCount(0);
  await expect(page.getByTestId('notice')).toHaveCount(0);
});

test('no hidden tools: no secret combo, no debug mode', async ({ page }) => {
  await withSdk(page);
  await tutorialDone(page);
  await page.goto('/?level=11#debug');
  await expect.poll(() => scene(page)).toBe('play');
  await expect(page.getByTestId('secret')).toHaveCount(0);
  await expect(page.getByTestId('watch')).toHaveCount(0);
  await page.keyboard.press('Shift+P');
  await expect(page.getByTestId('watch-chooser')).toHaveCount(0);
});

test('no "Solve" in the tutorial', async ({ page }) => {
  await withSdk(page);
  await page.goto('/?level=2');
  await expect.poll(() => scene(page)).toBe('play');
  await expect(page.getByTestId('solution-ad')).toHaveCount(0);
});

test('Daily Roll: a break may come before the run, never between its floors', async ({ page }) => {
  test.slow();
  await withSdk(page);
  await tutorialDone(page);
  await page.goto('/');
  await expect.poll(() => scene(page)).toBe('menu'); // a returning player gets the title screen
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
