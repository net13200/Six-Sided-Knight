import { expect, test } from '@playwright/test';
import { gameState, scene, trackErrors, tutorialFingerprints } from './helpers';

test.describe('lessons and how to play', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = trackErrors(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('a lesson shows as a clip, with no text; the first move closes it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('play').click();
    await page.getByTestId('story-skip').click();
    await expect.poll(() => scene(page)).toBe('play');
    const card = page.getByTestId('lesson');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('lesson-clip')).toBeVisible();
    await expect(card).toHaveText('');
    // The first roll only closes the clip; the board waited for it.
    await page.keyboard.press('ArrowRight');
    await expect(card).toBeHidden();
    expect((await gameState(page)).stats.moves).toBe(0);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await gameState(page)).stats.moves).toBe(1);
    // Read once: a retry or a later visit goes straight to the board.
    await page.goto('/');
    await page.getByTestId('play').click();
    await expect.poll(() => scene(page)).toBe('play');
    await expect(card).toHaveCount(0);
  });

  test('later lessons are clips too, and "Got it" closes them', async ({ page }) => {
    // levels 1 and 2 beaten: Play opens level 3
    await page.addInitScript((fps) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const levels: Record<string, unknown> = {};
      for (let i = 1; i <= 2; i++)
        levels[`c1-0${i}`] = {
          stars: 3,
          bestMoves: 5,
          completions: 1,
          bestTimeMs: 9000,
          fp: fps[i - 1],
        };
      localStorage.setItem(
        'ssk.save',
        JSON.stringify({ version: 3, campaign: 2, createdAt: 1, levels }),
      );
    }, tutorialFingerprints());
    await page.goto('/');
    await page.getByTestId('play').click();
    await expect.poll(() => scene(page)).toBe('play');
    const card = page.getByTestId('lesson');
    await expect(page.getByTestId('lesson-clip')).toBeVisible();
    await expect(card).toHaveText('');
    await page.getByTestId('lesson-ok').click();
    await expect(card).toBeHidden();
    expect((await gameState(page)).stats.moves).toBe(0);
  });

  test('"How to play" appears on the title screen once the tutorial is done', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await expect(page.getByTestId('how-to')).toHaveCount(0);
    await page.evaluate((fps) => {
      const s = JSON.parse(localStorage.getItem('ssk.save')!);
      for (let i = 1; i <= 10; i++)
        s.levels[`c1-${String(i).padStart(2, '0')}`] = {
          stars: 1,
          bestMoves: 9,
          completions: 1,
          bestTimeMs: 9000,
          fp: fps[i - 1],
        };
      localStorage.setItem('ssk.save', JSON.stringify(s));
    }, tutorialFingerprints());
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

test.describe('the rebuilt campaign', () => {
  test('an older save starts the campaign fresh, keeps crowns, and says so once', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'ssk.save',
        JSON.stringify({
          version: 3,
          createdAt: 1,
          wallet: { crowns: 120, earned: 120, spent: 0 },
          levels: { 'c1-01': { stars: 3, bestMoves: 5, completions: 1, bestTimeMs: 1 } },
          lastLevelId: 'c1-02',
        }),
      );
    });
    await page.goto('/');
    await expect(page.getByTestId('campaign-notice')).toContainText('A new campaign');
    await page.getByTestId('campaign-notice-ok').click();
    await expect(page.getByTestId('campaign-notice')).toHaveCount(0);
    await expect(page.getByTestId('play')).toContainText('Play');
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!));
    expect(save.levels).toEqual({});
    expect(save.wallet.crowns).toBe(120);
    await page.reload();
    await expect.poll(() => scene(page)).toBe('menu');
    await expect(page.getByTestId('campaign-notice')).toHaveCount(0);
  });

  test('a new player never sees the notice', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await expect(page.getByTestId('campaign-notice')).toHaveCount(0);
  });
});
