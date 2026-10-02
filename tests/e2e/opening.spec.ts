import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { scene, trackErrors } from './helpers';

/**
 * The animated 3D opening. Test browsers get the classic story pages unless
 * they ask for the film (?opening=1), so these tests ask.
 */
// WebGL through the software renderer, for these tests only (it slows the
// rest of the game's drawing down).
const localChromium = '/opt/pw-browsers/chromium';
test.use({
  launchOptions: {
    ...(existsSync(localChromium) ? { executablePath: localChromium } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
});

test.describe('opening', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = trackErrors(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  async function startOpening(page: Page): Promise<void> {
    await page.goto('/?opening=1');
    await expect.poll(() => scene(page)).toBe('menu');
    await page.getByTestId('play').click();
    await expect.poll(() => scene(page)).toBe('story');
    await expect(page.getByTestId('opening')).toBeVisible();
    // The film loads, then its first caption appears.
    await expect(page.getByTestId('opening-caption')).toContainText('Oddmere', { timeout: 30_000 });
  }

  test('a new player sees the 3D opening, tapping through it leads to chapter 1', async ({
    page,
  }) => {
    test.slow();
    await startOpening(page);
    // Tap through the scenes: Well, morning, you; then the title; then on.
    await page.getByTestId('opening').click();
    await expect(page.getByTestId('opening-caption')).toContainText('Well', { timeout: 30_000 });
    await page.getByTestId('opening').click();
    await expect(page.getByTestId('opening-caption')).toContainText('die', { timeout: 30_000 });
    await page.getByTestId('opening').click();
    await expect(page.getByTestId('opening-caption')).toContainText('halfway', { timeout: 30_000 });
    await page.getByTestId('opening').click(); // the closing title
    await page.getByTestId('opening').click(); // on
    await expect(page.getByTestId('story-text')).toContainText('Chapter 1', { timeout: 15_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await page.getByTestId('story-next').click();
    await expect.poll(() => scene(page)).toBe('play');
  });

  test('Skip leaves the whole story and starts level 1', async ({ page }) => {
    await startOpening(page);
    await page.getByTestId('opening-skip').click();
    await expect.poll(() => scene(page)).toBe('play');
    await expect(page.getByTestId('opening')).toHaveCount(0);
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!));
    expect(save.hints['story:intro']).toBe(true);
  });

  test('without motion (reduced motion) the classic pages play instead', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?opening=1');
    await expect.poll(() => scene(page)).toBe('menu');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('story-text')).toContainText('Oddmere');
    await expect(page.getByTestId('opening')).toHaveCount(0);
  });
});
