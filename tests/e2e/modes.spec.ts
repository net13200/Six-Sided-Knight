import { expect, test } from '@playwright/test';
import { createState } from '../../src/engine';
import { generateLevel } from '../../src/gen/generate';
import { depthsFloorParams } from '../../src/meta/depths';
import { STARTING_FACES } from '../../src/meta/store';
import {
  KEY,
  gameState,
  losingPathFrom,
  playCurrentLevel,
  rules,
  scene,
  solveCurrent,
  trackErrors,
  waitForMoves,
} from './helpers';

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
      /^Six Sided Knight · Daily Roll \d{4}-\d{2}-\d{2}\n[★☆]{9} \d\/9\n\d+ moves · \d\/3 HP left\n/,
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
    // One life: no Undo or Retry, and the keys do nothing.
    await expect(page.getByTestId('undo')).toHaveCount(0);
    await expect(page.getByTestId('retry')).toHaveCount(0);
    const [first] = await solveCurrent(page);
    await page.keyboard.press(KEY[first!]);
    await waitForMoves(page, 1);
    await page.keyboard.press('z');
    await page.keyboard.press('r');
    await waitForMoves(page, 1);
    // Leave mid-floor: the run waits in the hub, and the floor resumes where it was.
    await page.getByTestId('menu').click();
    await expect.poll(() => scene(page)).toBe('depths');
    await expect(page.getByTestId('depths-start')).toContainText('Continue floor 2');
    await page.reload();
    await page.getByTestId('depths').click();
    await page.getByTestId('depths-start').click();
    await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
    await waitForMoves(page, 1);
    await page.getByTestId('menu').click();
    await page.getByTestId('back').click();
    await expect(page.getByTestId('depths')).toContainText('on floor 2');
    await page.getByTestId('depths').click();
    await page.getByTestId('depths-surface').click();
    await page.getByTestId('depths-surface').click();
    await expect(page.getByTestId('depths-start')).toContainText('Descend');
    await page.getByTestId('back').click();
    await expect(page.getByTestId('depths')).toContainText('best 1 floors');
  });

  test('depths: knocked out ends the run and keeps the record', async ({ page }) => {
    // A run on floor 2 with 1 HP left, on a seed whose floor 2 can be lost
    // (found here, so the test never depends on a random dungeon).
    const seed = seedWithLosableFloor2();
    await page.goto('/');
    await page.evaluate((key) => {
      const save = JSON.parse(localStorage.getItem('ssk.save')!);
      save.depths.bestFloor = 1;
      save.depths.inProgress = { key, floor: 2, hp: 1, moves: 9, stars: 3 };
      localStorage.setItem('ssk.save', JSON.stringify(save));
    }, String(seed));
    await page.reload();
    await page.getByTestId('depths').click();
    await page.getByTestId('depths-start').click();
    await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
    expect((await gameState(page)).player.hp).toBe(1);
    // Walk into trouble until the die falls.
    for (const dir of losingPathFrom(await gameState(page), 20))
      await page.keyboard.press(KEY[dir]);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('floor');
    await expect(page.getByTestId('floor-over')).toBeVisible();
    const depths = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!).depths);
    expect(depths).toMatchObject({ bestFloor: 1, lastFloor: 1, inProgress: null });
    await page.getByTestId('floor-over').click();
    await expect.poll(() => scene(page)).toBe('depths');
    await expect(page.getByTestId('depths-start')).toContainText('Descend');
  });
});

/** The first run seed whose Depths floor 2, entered with 1 HP, can be lost. */
function seedWithLosableFloor2(): number {
  for (let seed = 1; ; seed++) {
    const { level } = generateLevel(rules, depthsFloorParams(seed, 2, STARTING_FACES));
    try {
      losingPathFrom(createState(rules, level, { hp: 1 }), 20);
      return seed;
    } catch {
      // No way to lose this one: try the next seed.
    }
  }
}
