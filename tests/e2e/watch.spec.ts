import { expect, test } from '@playwright/test';
import { campaign, gameState, scene, trackErrors } from './helpers';

test.describe('watching the par solution (developer mode)', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = trackErrors(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('plays the par solution to the stairs, and it never counts', async ({ page }) => {
    await page.goto('/?level=3&debug');
    await page.getByTestId('debug-close').click();
    await page.getByTestId('watch').click();
    const par = campaign[2]!.par!;
    await expect(page.getByTestId('watch-any')).toContainText(`${par} moves`);
    await page.getByTestId('watch-any').click();
    await expect(page.getByTestId('watch-bar')).toBeVisible();
    // Faster, then let it finish.
    await page.getByTestId('watch-speed').click();
    await page.getByTestId('watch-speed').click();
    await expect(page.getByTestId('watch-label')).toContainText('✓', { timeout: 15_000 });
    const s = await gameState(page);
    expect(s.status).toBe('won');
    expect(s.stats.moves).toBe(par);
    // No results screen, no stars, no crowns, no stats.
    await page.waitForTimeout(1200);
    expect(await scene(page)).toBe('play');
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save') ?? '{}'));
    expect(save.levels?.['c1-03']).toBeUndefined();
    expect(save.wallet?.crowns ?? 0).toBe(0);
    expect(save.stats?.levelsCompleted ?? 0).toBe(0);
    // Stop: back to the start, ready to play for real.
    await page.getByTestId('watch-stop').click();
    await expect(page.getByTestId('watch-bar')).toHaveCount(0);
    expect((await gameState(page)).stats.moves).toBe(0);
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await gameState(page)).stats.moves).toBe(1);
  });

  test('pause and step', async ({ page }) => {
    await page.goto('/?level=5&debug');
    await page.getByTestId('debug-close').click();
    await page.keyboard.press('p');
    await page.getByTestId('watch-any').click();
    await page.getByTestId('watch-pause').click();
    const at = (await gameState(page)).stats.moves;
    await page.waitForTimeout(1200);
    expect((await gameState(page)).stats.moves).toBe(at);
    await page.getByTestId('watch-step').click();
    await expect.poll(async () => (await gameState(page)).stats.moves).toBe(at + 1);
    // While watching, the player's own moves are ignored.
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    expect((await gameState(page)).stats.moves).toBe(at + 1);
  });

  test('hidden without developer mode', async ({ page }) => {
    await page.goto('/?level=3');
    await expect.poll(() => scene(page)).toBe('play');
    await expect(page.getByTestId('watch')).toHaveCount(0);
    await page.keyboard.press('p');
    await expect(page.getByTestId('watch-chooser')).toHaveCount(0);
  });

  test('the secret combo works in the regular game: 5 taps on the title, or Shift+P', async ({
    page,
  }) => {
    await page.goto('/?level=3');
    await expect.poll(() => scene(page)).toBe('play');
    const secret = page.getByTestId('secret');
    // Four taps: nothing.
    for (let i = 0; i < 4; i++) await secret.click();
    await expect(page.getByTestId('watch-chooser')).toHaveCount(0);
    // The fifth opens the solution.
    await secret.click();
    await expect(page.getByTestId('watch-any')).toContainText(`${campaign[2]!.par} moves`);
    await page.getByTestId('watch-cancel').click();
    await expect(page.getByTestId('watch-chooser')).toHaveCount(0);
    // Shift+P too (plain P stays developer-only).
    await page.keyboard.press('Shift+P');
    await expect(page.getByTestId('watch-any')).toBeVisible();
    await page.getByTestId('watch-any').click();
    await page.getByTestId('watch-speed').click();
    await page.getByTestId('watch-speed').click();
    await expect(page.getByTestId('watch-label')).toContainText('✓', { timeout: 15_000 });
    // Still never counts.
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save') ?? '{}'));
    expect(save.levels?.['c1-03']).toBeUndefined();
  });
});
