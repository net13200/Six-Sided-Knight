import { expect, test } from '@playwright/test';
import { gameState, scene, trackErrors } from './helpers';

test.describe('lessons and how to play', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = trackErrors(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('a lesson types itself out and the board waits for "Got it"', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('play').click();
    await page.getByTestId('story-skip').click();
    await expect.poll(() => scene(page)).toBe('play');
    const card = page.getByTestId('lesson');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Rolling');
    // Rolling does nothing while the lesson is up.
    await page.keyboard.press('ArrowRight');
    expect((await gameState(page)).stats.moves).toBe(0);
    // The first tap shows the rest of the text; the second closes the card.
    await page.getByTestId('lesson-ok').click();
    await expect(card).toBeVisible();
    await expect(card).toContainText('Roll onto the stairs to win.');
    await page.getByTestId('lesson-ok').click();
    await expect(card).toBeHidden();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await gameState(page)).stats.moves).toBe(1);
    // Read once: a retry or a later visit goes straight to the board.
    await page.goto('/');
    await page.getByTestId('play').click();
    await expect.poll(() => scene(page)).toBe('play');
    await expect(card).toHaveCount(0);
  });

  test('"How to play" appears on the title screen once the tutorial is done', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await expect(page.getByTestId('how-to')).toHaveCount(0);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('ssk.save')!);
      for (let i = 1; i <= 10; i++)
        s.levels[`c1-${String(i).padStart(2, '0')}`] = {
          stars: 1,
          bestMoves: 9,
          completions: 1,
          bestTimeMs: 9000,
        };
      localStorage.setItem('ssk.save', JSON.stringify(s));
    });
    await page.reload();
    await page.getByTestId('how-to').click();
    const sheet = page.getByTestId('how-to-sheet');
    await expect(sheet).toContainText('How to play');
    await expect(sheet).toContainText('Bomb: 2 damage');
    await expect(sheet).toContainText('Golem (4 HP)');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });
});
