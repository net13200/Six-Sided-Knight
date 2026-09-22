import { expect, test } from '@playwright/test';
import { gameState, playCurrentLevel, scene, trackErrors } from './helpers';

test.describe('Daily Roll and Depths', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = trackErrors(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('daily flow: three floors, HP carries over, streak, share', async ({ page, context }) => {
    test.slow();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByTestId('daily').click();
    await expect.poll(() => scene(page)).toBe('daily');
    await page.getByTestId('daily-start').click();

    for (let floor = 1; floor <= 3; floor++) {
      await playCurrentLevel(page);
      await expect.poll(() => scene(page), { timeout: 5000 }).toBe('floor');
      if (floor < 3) {
        await page.getByTestId('floor-next').click();
        await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
        const s = await gameState(page);
        expect(s.levelId).toMatch(new RegExp(`^daily-\\d{4}-\\d{2}-\\d{2}-${floor + 1}$`));
        expect(s.player.hp).toBeGreaterThanOrEqual(2);
      }
    }

    // Final screen: share copies a spoiler-free summary.
    await page.getByTestId('floor-share').click();
    await expect(page.getByTestId('floor-share')).toContainText(/Copied|Shared/);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toMatch(
      /^Six Sided Knight · Daily Roll \d{4}-\d{2}-\d{2}\n[★☆]{9} \d\/9\n\d+ moves · \d\/5 HP left\n/,
    );

    // Streak shows on the title screen; the hub offers share and practice.
    await page.getByTestId('floor-done').click();
    await expect(page.getByTestId('daily')).toContainText('done · 1-day streak');
    await page.getByTestId('daily').click();
    await expect(page.getByTestId('daily-share')).toBeVisible();
    await expect(page.getByTestId('daily-practice')).toBeVisible();
  });

  test('a daily run in progress resumes after a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('daily').click();
    await page.getByTestId('daily-start').click();
    await playCurrentLevel(page);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('floor');
    await page.goto('/');
    await page.getByTestId('daily').click();
    await expect(page.getByTestId('daily-start')).toContainText('Continue floor 2/3');
    await page.getByTestId('daily-start').click();
    await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
    expect((await gameState(page)).levelId).toMatch(/-2$/);
  });

  test('depths: clear a floor, record the best, continue or end the run', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('depths').click();
    await page.getByTestId('depths-start').click();
    await playCurrentLevel(page);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('floor');
    await page.getByTestId('floor-next').click();
    await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
    expect((await gameState(page)).levelId).toBe('depths-2');
    // Leave mid-floor: the run waits in the hub.
    await page.getByTestId('menu').click();
    await expect.poll(() => scene(page)).toBe('depths');
    await expect(page.getByTestId('depths-start')).toContainText('Continue floor 2');
    await page.getByTestId('back').click();
    await expect(page.getByTestId('depths')).toContainText('on floor 2');
    await page.getByTestId('depths').click();
    await page.getByTestId('depths-surface').click();
    await page.getByTestId('depths-surface').click();
    await expect(page.getByTestId('depths-start')).toContainText('Descend');
    await page.getByTestId('back').click();
    await expect(page.getByTestId('depths')).toContainText('best floor 1');
  });
});
