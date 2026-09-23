import { expect, test } from '@playwright/test';
import { scene, trackErrors } from './helpers';

test.describe('accessibility', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = trackErrors(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('moves and the board are announced for screen readers', async ({ page }) => {
    await page.goto('/?level=2');
    const announcer = page.getByTestId('announcer');
    await expect(announcer).toHaveAttribute('aria-live', 'polite');
    await page.keyboard.press('h');
    await expect(announcer).toContainText('HP 5 of 5');
    await expect(announcer).toContainText('Right: Sword leads');
    await page.keyboard.press('ArrowRight'); // Sword into the skeleton
    await expect(announcer).toContainText('Knocks out the Skeleton');
    await expect(page.locator('canvas').first()).toHaveAttribute('aria-label', /Game board\. HP/);
  });

  test('the title screen works with the keyboard alone', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.testid);
      if (id === 'play') break;
    }
    await expect(page.getByTestId('play')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => scene(page)).toBe('play');
  });

  test('display settings apply and persist', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('settings').click();
    await page.getByTestId('setting-contrast').check();
    await page.getByTestId('setting-labels').check();
    await page.getByTestId('setting-motion').check();
    await page.getByTestId('settings-close').click();
    await page.reload();
    await expect(page.locator('.stage')).toHaveClass(/high-contrast/);
    await expect(page.locator('.stage')).toHaveClass(/large-labels/);
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('ssk.save')!).settings);
    expect(s).toMatchObject({ highContrast: true, largeLabels: true, reduceMotion: true });
  });

  test('every button is at least 44 px (touch target) on this screen size', async ({ page }) => {
    const screens: Array<[string, string | null]> = [
      ['/', null],
      ['/?level=2', null],
      ['/', 'daily'],
      ['/', 'depths'],
      ['/', 'forge'],
      ['/', 'stats'],
      ['/', 'levels'],
    ];
    const problems: string[] = [];
    for (const [url, open] of screens) {
      await page.goto(url);
      if (open) await page.getByTestId(open).click();
      await page.waitForTimeout(200);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .filter((b) => b.offsetParent !== null)
          .map((b) => {
            const r = b.getBoundingClientRect();
            return { id: b.dataset.testid, w: r.width, h: r.height };
          })
          .filter((r) => r.w < 43.5 || r.h < 43.5),
      );
      for (const b of small)
        problems.push(`${open ?? url}: ${b.id} ${Math.round(b.w)}x${Math.round(b.h)}`);
    }
    expect(problems).toEqual([]);
  });
});
