import { expect, test } from '@playwright/test';
import { gameState, playCurrentLevel, scene, trackErrors } from './helpers';

test.describe('story', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = trackErrors(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('beating the last level for the first time leads to the ending', async ({ page }) => {
    test.slow();
    await page.goto('/?level=60');
    await expect.poll(() => scene(page)).toBe('play');
    const floors = 3;
    for (let floor = 1; floor <= floors; floor++) {
      await playCurrentLevel(page);
      if (floor < floors) {
        await expect.poll(() => scene(page), { timeout: 5000 }).toBe('floor');
        await page.getByTestId('floor-next').click();
        expect((await gameState(page)).levelId).toBe(`c6-10-${floor + 1}`);
      }
    }
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
    await expect(page.getByTestId('next')).toContainText('Epilogue');
    await page.getByTestId('next').click();
    await expect.poll(() => scene(page)).toBe('story');
    await expect(page.getByTestId('story-text')).toContainText('bottom of the Well');
    for (let i = 0; i < 3; i++) await page.getByTestId('story-next').click();
    await expect(page.getByTestId('story-next')).toContainText('The end');
    await page.getByTestId('story-next').click();
    await expect.poll(() => scene(page)).toBe('menu');
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!));
    expect(save.hints['story:ending']).toBe(true);
  });

  test('a chapter card shows before the first level of a new chapter', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const levels: Record<string, unknown> = {};
      for (let i = 1; i <= 10; i++)
        levels[`c1-${String(i).padStart(2, '0')}`] = {
          stars: 1,
          bestMoves: 9,
          completions: 1,
          bestTimeMs: 9000,
        };
      localStorage.setItem('ssk.save', JSON.stringify({ version: 3, createdAt: 1, levels }));
    });
    await page.goto('/');
    await expect(page.getByTestId('play')).toContainText('level 11');
    await page.getByTestId('play').click();
    await expect.poll(() => scene(page)).toBe('story');
    await expect(page.getByTestId('story-text')).toContainText('Chapter 2: Deep Halls');
    await page.getByTestId('story-next').click();
    await expect.poll(() => scene(page)).toBe('play');
    // Only once.
    await page.goto('/');
    await page.getByTestId('play').click();
    await expect.poll(() => scene(page)).toBe('play');
  });
});
