import { expect, test } from '@playwright/test';
import {
  campaign,
  gameState,
  levelIndex,
  losingPathFor,
  scene,
  skipStory,
  solutionFor,
  swipe,
  tileClient,
  trackErrors,
  tutorialFingerprints,
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

  test('the first Play tells the story, then starts level 1; the story shows only once', async ({
    page,
  }) => {
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await page.getByTestId('play').click();
    await expect.poll(() => scene(page)).toBe('story');
    await expect(page.getByTestId('story-text')).toContainText('Oddmere');
    for (let i = 0; i < 4; i++) await page.getByTestId('story-next').click();
    await expect(page.getByTestId('story-text')).toContainText('Chapter 1');
    await expect(page.getByTestId('story-next')).toContainText('Begin');
    await page.getByTestId('story-next').click();
    await expect.poll(() => scene(page)).toBe('play');
    expect(await levelIndex(page)).toBe(0);
    // Once seen, Play goes straight to the level.
    await page.goto('/');
    await page.getByTestId('play').click();
    await expect.poll(() => scene(page)).toBe('play');
    // "Story" on the title screen replays it.
    await page.goto('/');
    await page.getByTestId('story').click();
    await expect(page.getByTestId('story-text')).toContainText('Oddmere');
    await page.getByTestId('story-skip').click();
    await expect.poll(() => scene(page)).toBe('menu');
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
    for (let i = 0; i < 10; i++) {
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

  test('the map: pick a level, play it, and the road to the next one opens', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('levels').click();
    await expect(page.getByTestId('level-2')).toBeDisabled();
    // The die starts on level 1: Play starts it.
    await expect(page.getByTestId('map-play')).toBeEnabled();
    await page.getByTestId('map-play').click();
    await skipStory(page);
    for (const dir of solutionFor(0)) await page.keyboard.press(KEY[dir]);
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('results');
    await page.getByTestId('results-levels').click();
    await expect(page.getByTestId('level-1')).toHaveAttribute('aria-label', /3 of 3 stars/);
    await expect(page.getByTestId('level-2')).toBeEnabled();
    // The road flips in and the die rolls on to level 2 by itself.
    await expect(page.getByTestId('map-announcer')).toContainText('Level 2', { timeout: 8000 });
    await page.getByTestId('map-play').click();
    await expect.poll(() => scene(page)).toBe('play');
    expect(await levelIndex(page)).toBe(1);
  });

  test('the World view, and tapping a landmark rolls the die there', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('levels').click();
    await expect(page.getByTestId('level-1')).toBeVisible();
    // The World view: every district and its stars; only open ones can be picked.
    await page.getByTestId('world').click();
    await expect(page.getByTestId('area-1')).toHaveAttribute(
      'aria-label',
      /First Steps, 0 of 30 stars/,
    );
    await expect(page.getByTestId('area-2')).toBeDisabled();
    await page.getByTestId('world').click();
    await expect(page.getByTestId('area-1')).toBeHidden();
    await expect(page.getByTestId('level-1')).toBeVisible();
    // No rolling tile by tile: a swipe or arrow key doesn't walk off the road.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await expect(page.getByTestId('map-announcer')).not.toContainText('Smith');
    // Tap the Smith: the die rolls there and it opens.
    await page.getByTestId('landmark-smith').click();
    await expect.poll(() => scene(page)).toBe('forge');
    // The Smith's Back returns to the map; tapping the notice board rolls there and opens it.
    await page.getByTestId('back').click();
    await expect.poll(() => scene(page)).toBe('levels');
    await page.getByTestId('landmark-daily').click();
    await expect.poll(() => scene(page), { timeout: 5000 }).toBe('daily');
  });

  test('picking a district in the World view tosses the die there', async ({ page }) => {
    await page.addInitScript((fps) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const levels: Record<string, unknown> = {};
      const hints: Record<string, boolean> = {
        'story:intro': true,
        'story:ch1': true,
        'story:ch2': true,
      };
      for (let i = 1; i <= 10; i++) {
        const id = `c1-${String(i).padStart(2, '0')}`;
        levels[id] = { stars: 3, bestMoves: 9, completions: 1, bestTimeMs: 9000, fp: fps[i - 1] };
        hints[`map:${i < 10 ? `c1-${String(i + 1).padStart(2, '0')}` : 'c2-01'}`] = true;
      }
      localStorage.setItem(
        'ssk.save',
        JSON.stringify({ version: 3, campaign: 2, createdAt: 1, levels, hints }),
      );
    }, tutorialFingerprints());
    await page.goto('/');
    await page.getByTestId('levels').click();
    // The die starts on level 11 (the next to play); toss it back to First Steps.
    await expect(page.getByTestId('map-play')).toBeEnabled();
    await page.getByTestId('world').click();
    await expect(page.getByTestId('area-1')).toHaveAttribute('aria-label', /30 of 30 stars/);
    await page.getByTestId('area-1').click();
    await expect(page.getByTestId('map-announcer')).toContainText('Level 1:', { timeout: 5000 });
    await page.getByTestId('world').click();
    await page.getByTestId('area-2').click();
    await expect(page.getByTestId('map-announcer')).toContainText('Level 11:', { timeout: 5000 });
    // The arrow keys hop level to level: down to level 10, up to 11 again.
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('map-announcer')).toContainText('Level 10:', { timeout: 5000 });
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('map-announcer')).toContainText('Level 11:', { timeout: 5000 });
    await page.getByTestId('map-play').click();
    await expect.poll(() => scene(page)).not.toBe('levels');
  });

  test('progress survives a reload and Play continues where you left off', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('play').click();
    await skipStory(page);
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
    await skipStory(page);
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
    const box = (await page.locator('canvas.stage-canvas').boundingBox())!;
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

  test('a 16:9 window is covered edge to edge: scenery and side panels, no empty bars', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 836, height: 470 });
    await page.goto('/?level=12');
    await expect.poll(() => scene(page)).toBe('play');
    const backdrop = (await page.locator('canvas.stage-backdrop').boundingBox())!;
    expect(backdrop).toMatchObject({ x: 0, y: 0, width: 836, height: 470 });
    // The left panel is painted (not the plain background colour).
    const painted = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas.stage-backdrop')!;
      const k = c.width / 836;
      const px = c
        .getContext('2d')!
        .getImageData(Math.round(120 * k), Math.round(235 * k), 1, 1).data;
      return [px[0], px[1], px[2]];
    });
    expect(painted).not.toEqual([20, 18, 28]);
  });

  test('canvas is crisp on high-DPI screens', async ({ page }) => {
    await page.goto('/?level=1');
    const { width, cssWidth, dpr } = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas.stage-canvas')!;
      return { width: c.width, cssWidth: c.getBoundingClientRect().width, dpr: devicePixelRatio };
    });
    // Backing store matches the screen up to 2x (the cap; see PERFORMANCE.md).
    expect(width).toBeGreaterThanOrEqual(Math.floor(cssWidth * Math.min(dpr, 2)) - 1);
  });
});
