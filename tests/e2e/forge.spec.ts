import { expect, test, type Page } from '@playwright/test';
import { gameState, playCurrentLevel, scene, solutionFor, trackErrors } from './helpers';

/** A 0.4.x (save v2) player with 26 stars, so the migration pays 260 crowns. */
async function seedVeteran(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    const levels: Record<string, unknown> = {};
    for (let i = 1; i <= 10; i++)
      levels[`c1-${String(i).padStart(2, '0')}`] = {
        stars: (i % 3) + 1,
        bestMoves: 9,
        completions: 1,
        bestTimeMs: 9000,
      };
    localStorage.setItem(
      'ssk.save',
      JSON.stringify({
        version: 2,
        createdAt: 1,
        settings: { muted: true, analyticsOptOut: false },
        levels,
        lastLevelId: 'c1-10',
        stats: {
          levelsStarted: 10,
          levelsCompleted: 10,
          moves: 100,
          kills: 3,
          gold: 100,
          undos: 0,
          retries: 0,
          deaths: 0,
          playTimeMs: 60000,
        },
        daily: {
          lastDate: null,
          streak: 0,
          bestStreak: 1,
          results: { '2026-09-20': { moves: 40, hp: 3, stars: 6 } },
          inProgress: null,
        },
        depths: { bestFloor: 0, runs: 0, inProgress: null },
        hints: { inspect: true },
      }),
    );
  });
  await page.reload();
}

test.describe('Forge, crowns and custom dice', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = trackErrors(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('a new star pays crowns', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('play').click();
    for (const dir of solutionFor(0))
      await page.keyboard.press(`Arrow${{ N: 'Up', E: 'Right', S: 'Down', W: 'Left' }[dir]}`);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!));
    expect(save.wallet.crowns).toBeGreaterThanOrEqual(10);
    expect(save.wallet.crowns % 10).toBe(0);
  });

  test('buy a face, put it on the die, and take it into the Daily Roll', async ({ page }) => {
    test.slow();
    await seedVeteran(page);
    await page.getByTestId('forge').click();
    await expect.poll(() => scene(page)).toBe('forge');

    // Hook costs 300: not enough yet.
    await page.getByTestId('face-Hook').click();
    await expect(page.getByTestId('buy-confirm')).toBeDisabled();
    await page.getByTestId('buy-cancel').click();

    // Freeze costs 200: bought and placed on the selected (top) side.
    await page.getByTestId('face-Freeze').click();
    await page.getByTestId('buy-confirm').click();
    await expect(page.getByTestId('buy-sheet')).toHaveCount(0);
    // Then move it west: tap West, then Freeze (swaps with what was there).
    await page.getByTestId('slot-west').click();
    await page.getByTestId('face-Freeze').click();
    await expect(page.getByTestId('slot-west')).toHaveAttribute('aria-label', 'West: Freeze');

    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!));
    expect(save.wallet).toEqual({ crowns: 60, earned: 260, spent: 200 });
    expect(save.owned).toEqual(['Freeze']);
    expect(save.die[5]).toBe('Freeze');

    // The daily run uses the custom die.
    await page.getByTestId('back').click();
    await page.getByTestId('daily').click();
    await page.getByTestId('daily-start').click();
    await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
    const s = await gameState(page);
    expect(s.player.die.loadout).toEqual(save.die);
    await playCurrentLevel(page);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('floor');
  });

  test('stats screen shows lifetime numbers', async ({ page }) => {
    await seedVeteran(page);
    await page.getByTestId('stats').click();
    await expect.poll(() => scene(page)).toBe('stats');
    await page.getByTestId('back').click();
    await expect.poll(() => scene(page)).toBe('menu');
  });
});
