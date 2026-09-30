import { expect, test } from '@playwright/test';
import { KEY, scene, solutionFor, trackErrors } from '../e2e/helpers';

test('a portal-ready build: straight into the story and level 1, no install bits, no SDK', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4175')) outside.push(r.url());
  });
  await page.goto('/');
  // A first-time player skips the title screen: the story, then level 1.
  await expect.poll(() => scene(page)).toBe('story');
  await page.getByTestId('story-skip').click();
  await expect.poll(() => scene(page)).toBe('play');
  // Everything is in the zip: nothing loads from anywhere else.
  expect(outside).toEqual([]);
  const html = await (await page.request.get('/')).text();
  expect(html).not.toContain('poki-sdk');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test('level 1 plays through to the results, and progress is saved', async ({ page }) => {
  await page.goto('/?level=1');
  await expect.poll(() => scene(page)).toBe('play');
  for (const d of solutionFor(0)) await page.keyboard.press(KEY[d]);
  await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!));
  expect(save.levels['c1-01'].completions).toBe(1);
});

test('no hidden tools and no ads: no secret combo, no debug mode, no "Solve" ad', async ({
  page,
}) => {
  await page.goto('/?level=11#debug');
  await expect.poll(() => scene(page)).toBe('play');
  await expect(page.getByTestId('secret')).toHaveCount(0);
  await expect(page.getByTestId('watch')).toHaveCount(0);
  await expect(page.getByTestId('solution-ad')).toHaveCount(0);
  await page.keyboard.press('Shift+P');
  await expect(page.getByTestId('watch-chooser')).toHaveCount(0);
});

test.describe('in the fullscreen app, on a phone on its side', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test('the game keeps clear of the notch and the home bar (safe-area insets)', async ({
    page,
  }) => {
    await page.goto('/?level=1');
    await expect.poll(() => scene(page)).toBe('play');
    // The browser reports a notch on the left and a home bar at the bottom.
    await page.addStyleTag({
      content: '.safe-area-probe { padding: 0 0 21px 47px !important; }',
    });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    const box = (await page.locator('.stage-canvas').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(47);
    expect(box.y + box.height).toBeLessThanOrEqual(390 - 21 + 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(844);
    // Taps still land where they're aimed.
    const menu = page.getByTestId('menu');
    await menu.click();
    await expect.poll(() => scene(page)).not.toBe('play');
  });
});
