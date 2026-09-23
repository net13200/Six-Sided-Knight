import { expect, test } from '@playwright/test';
import {
  campaign,
  gameState,
  levelIndex,
  losingPathFor,
  scene,
  solutionFor,
  swipe,
  tileClient,
  trackErrors,
  waitForMoves,
} from './helpers';

const KEY = { N: 'ArrowUp', E: 'ArrowRight', S: 'ArrowDown', W: 'ArrowLeft' } as const;

test.describe('Six Sided Knight', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = trackErrors(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('menu starts level 1 in one tap', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await page.getByTestId('play').click();
    await expect.poll(() => scene(page)).toBe('play');
    expect(await levelIndex(page)).toBe(0);
  });

  test('shows the version number on the title screen and in the KPI panel', async ({ page }) => {
    await page.goto('/');
    const version = await page.evaluate(() => (window.__ssk as { version: string }).version);
    expect(version).toMatch(/^v\d+\.\d+\.\d+/);
    await page.getByTestId('settings').click();
    await expect(page.getByTestId('settings-sheet')).toContainText(version);
    await page.goto('/#debug');
    await expect(page.getByTestId('debug-version')).toContainText(version);
  });

  test('swipe rolls the die', async ({ page }) => {
    await page.goto('/?level=1');
    const before = await gameState(page);
    await swipe(page, 'E');
    await waitForMoves(page, 1);
    const after = await gameState(page);
    expect(after.player.x).toBe(before.player.x + 1);
    expect(after.player.die.orient).not.toBe(before.player.die.orient);
  });

  test('tap rolls toward the tapped tile along the dominant axis', async ({ page }) => {
    await page.goto('/?level=1');
    const s = await gameState(page);
    // Two tiles south and one east: dominant axis is south.
    const target = await tileClient(page, s.player.x + 1, s.player.y + 2);
    await page.touchscreen.tap(target.x, target.y);
    await waitForMoves(page, 1);
    const after = await gameState(page);
    expect([after.player.x, after.player.y]).toEqual([s.player.x, s.player.y + 1]);
  });

  test('tapping the die opens the inspect view, and previews never move', async ({ page }) => {
    await page.goto('/?level=1');
    const s = await gameState(page);
    const self = await tileClient(page, s.player.x, s.player.y);
    await page.touchscreen.tap(self.x, self.y);
    await expect(page.getByTestId('inspect')).toBeVisible();
    await page.getByTestId('inspect-E').click();
    await expect(page.getByTestId('inspect')).toHaveAttribute('data-preview', 'E');
    await page.getByTestId('inspect-close').click();
    await expect(page.getByTestId('inspect')).toBeHidden();
    expect(await gameState(page)).toEqual(s);
  });

  test('the compass and the I key open the inspect view; arrows preview, Escape closes', async ({
    page,
  }) => {
    await page.goto('/?level=2');
    await page.getByTestId('compass').click();
    await expect(page.getByTestId('inspect')).toBeVisible();
    await page.getByTestId('inspect-close').click();
    await page.keyboard.press('i');
    await expect(page.getByTestId('inspect')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('inspect')).toHaveAttribute('data-preview', 'W');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('inspect')).toBeHidden();
    expect((await gameState(page)).stats.moves).toBe(0);
    // Opening it once retires the one-time hint.
    const hints = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!).hints);
    expect(hints).toEqual({ inspect: true });
  });

  test('undo steps back one move', async ({ page }) => {
    await page.goto('/?level=1');
    const initial = await gameState(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await waitForMoves(page, 2);
    await page.getByTestId('undo').click();
    await waitForMoves(page, 1);
    await page.getByTestId('undo').click();
    await waitForMoves(page, 0);
    expect(await gameState(page)).toEqual(initial);
  });

  test('retry restarts the level', async ({ page }) => {
    await page.goto('/?level=1');
    const initial = await gameState(page);
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(k);
    await waitForMoves(page, 3);
    await page.getByTestId('retry').click();
    await waitForMoves(page, 0);
    expect(await gameState(page)).toEqual(initial);
  });

  test('bumping a wall does not use a turn', async ({ page }) => {
    await page.goto('/?level=2'); // a corridor: north is a wall
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    expect((await gameState(page)).stats.moves).toBe(0);
  });

  test('completing level 1 shows results with Next level as the main action', async ({ page }) => {
    await page.goto('/?level=1');
    const path = solutionFor(0);
    for (const dir of path) await page.keyboard.press(KEY[dir]);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
    await expect(page.getByTestId('next')).toBeVisible();
    await expect(page.getByTestId('next')).toContainText('Next level');
    await page.getByTestId('next').click();
    await expect.poll(() => scene(page)).toBe('play');
    expect(await levelIndex(page)).toBe(1);
  });

  test('every tutorial level can be finished in the browser', async ({ page }) => {
    test.slow();
    for (let i = 0; i < campaign.length; i++) {
      await page.goto(`/?level=${i + 1}`);
      for (const dir of solutionFor(i)) await page.keyboard.press(KEY[dir]);
      await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
    }
  });

  test('losing shows undo and retry, and undo recovers', async ({ page }) => {
    const index = campaign.findIndex((l) => l.id === 'c1-08'); // spikes
    await page.goto(`/?level=${index + 1}`);
    const path = losingPathFor(index);
    for (const dir of path) await page.keyboard.press(KEY[dir]);
    await expect(page.getByTestId('fail-overlay')).toBeVisible();
    expect((await gameState(page)).status).toBe('lost');
    await page.getByTestId('overlay-undo').click();
    await expect(page.getByTestId('fail-overlay')).toBeHidden();
    expect((await gameState(page)).status).toBe('playing');
    // Retry from the overlay too.
    for (const dir of path.slice(-1)) await page.keyboard.press(KEY[dir]);
    await page.getByTestId('overlay-retry').click();
    await waitForMoves(page, 0);
  });

  test('the map opens a level and shows stars after completion', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('levels').click();
    await expect(page.getByTestId('level-2')).toBeDisabled();
    await page.getByTestId('level-1').click();
    for (const dir of solutionFor(0)) await page.keyboard.press(KEY[dir]);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
    await page.getByTestId('results-levels').click();
    await expect(page.getByTestId('level-1')).toHaveAttribute('aria-label', /3 of 3 stars/);
    await expect(page.getByTestId('level-2')).toBeEnabled();
  });

  test('progress survives a reload and Play continues where you left off', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('play').click();
    for (const dir of solutionFor(0)) await page.keyboard.press(KEY[dir]);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
    await page.goto('/');
    await expect(page.getByTestId('play')).toContainText('Continue: level 2');
    await page.getByTestId('play').click();
    expect(await levelIndex(page)).toBe(1);
    // Leaving mid-level and coming back resumes the same level.
    await page.keyboard.press('ArrowRight');
    await page.goto('/');
    await expect(page.getByTestId('play')).toContainText('Continue: level 2');
  });

  test('a corrupt save does not break the game', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('ssk.save', '{definitely not json');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await page.getByTestId('play').click();
    await expect.poll(() => scene(page)).toBe('play');
    const backup = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith('ssk.save.corrupt.')),
    );
    expect(backup).toBe(true);
  });

  test('the KPI panel opens with #debug and reflects play', async ({ page }) => {
    await page.goto('/?level=1');
    for (const dir of solutionFor(0)) await page.keyboard.press(KEY[dir]);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
    await page.goto('/#debug');
    const panel = page.getByTestId('debug-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('debug-hypotheses')).toContainText('Tutorial completion');
    await expect(page.getByTestId('debug-levels')).toContainText('c1-01');
    await expect(page.getByTestId('debug-tutorial')).toContainText('✓');
    await expect(panel).toContainText('level_complete v1');
    await page.getByTestId('debug-close').click();
    await expect(panel).toBeHidden();
  });

  test('turning off play statistics stops recording', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('settings').click();
    const toggle = page.getByTestId('setting-analytics');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.getByTestId('settings-close').click();
    const stored = await page.evaluate(() => localStorage.getItem('ssk.analytics'));
    expect(stored).toBeNull();
    await page.getByTestId('play').click();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => localStorage.getItem('ssk.analytics'))).toBeNull();
    await page.goto('/#debug');
    await expect(page.getByTestId('debug-panel')).toContainText('recording is OFF');
  });

  test('mute toggles and persists across reloads', async ({ page }) => {
    await page.goto('/?level=1');
    const mute = page.getByTestId('mute');
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the stage fits the viewport with no scrolling', async ({ page }) => {
    await page.goto('/?level=1');
    const vp = page.viewportSize()!;
    const box = (await page.locator('canvas').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.y).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
    // Letterboxed at the 340:480 aspect ratio, filling one dimension.
    expect(box.width / box.height).toBeCloseTo(340 / 480, 2);
    expect(Math.max(box.width / vp.width, box.height / vp.height)).toBeGreaterThan(0.99);
    // Buttons are large enough for thumbs (>= 44 CSS px).
    const undo = (await page.getByTestId('undo').boundingBox())!;
    expect(Math.min(undo.width, undo.height)).toBeGreaterThanOrEqual(44);
  });

  test('canvas is crisp on high-DPI screens', async ({ page }) => {
    await page.goto('/?level=1');
    const { width, cssWidth, dpr } = await page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      return { width: c.width, cssWidth: c.getBoundingClientRect().width, dpr: devicePixelRatio };
    });
    expect(width).toBeGreaterThanOrEqual(Math.floor(cssWidth * Math.min(dpr, 3)) - 1);
  });
});
