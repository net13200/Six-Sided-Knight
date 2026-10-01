import { expect, test } from '@playwright/test';
import { scene } from './helpers';

test.describe('language', () => {
  test('switches from Settings, and the choice sticks after a reload', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await page.evaluate(() => document.getElementById('splash')?.remove());
    await page.getByTestId('settings').click();
    await page.getByTestId('setting-lang').selectOption('de');
    // The title screen is rebuilt in German, with Settings still open.
    await expect(page.getByTestId('settings-sheet')).toContainText('Sprache');
    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('play')).toContainText('Spielen');
    await page.reload();
    await expect.poll(() => scene(page)).toBe('menu');
    await expect(page.getByTestId('play')).toContainText('Spielen');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test.describe('a browser set to Spanish', () => {
    test.use({ locale: 'es-ES' });
    test('starts in Spanish; "Automatic" follows it', async ({ page }) => {
      await page.goto('/');
      await expect.poll(() => scene(page)).toBe('menu');
      await page.evaluate(() => document.getElementById('splash')?.remove());
      await expect(page.getByTestId('play')).toContainText('Jugar');
      await page.getByTestId('settings').click();
      await expect(page.getByTestId('setting-lang')).toHaveValue('');
      await page.getByTestId('setting-lang').selectOption('en');
      await page.getByTestId('settings-close').click();
      await expect(page.getByTestId('play')).toContainText('Play');
    });
  });

  test('Hebrew reads right to left', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    await page.evaluate(() => document.getElementById('splash')?.remove());
    await page.getByTestId('settings').click();
    await page.getByTestId('setting-lang').selectOption('he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('play')).toContainText('שחק');
    // Back to a left-to-right language.
    await page.getByTestId('settings').click();
    await page.getByTestId('setting-lang').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});
