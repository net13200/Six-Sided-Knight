import { expect, test } from '@playwright/test';
import { scene, skipStory } from './helpers';

test.describe('installable app', () => {
  test('has a standalone manifest with icons', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = await (await request.get(href!)).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const res = await request.get(icon.src);
      expect(res.ok(), icon.src).toBe(true);
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('works offline once loaded', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Reload so the service worker controls the page and caches this build's files.
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.waitForTimeout(500);
    await context.setOffline(true);
    await page.reload();
    await expect.poll(() => scene(page)).toBe('menu');
    await page.getByTestId('play').click();
    await skipStory(page);
    // Generated floors work offline too (the generator runs in a cached worker).
    await page.keyboard.press('Escape');
    await page.goto('/');
    await page.getByTestId('daily').click();
    await page.getByTestId('daily-start').click();
    await expect.poll(() => scene(page), { timeout: 15_000 }).toBe('play');
    await context.setOffline(false);
  });
});

test.describe('SugiGames splash', () => {
  test('plays before the title screen, then gets out of the way', async ({ page }) => {
    await page.goto('/?splash');
    await expect(page.getByTestId('splash')).toBeVisible();
    await expect(page.getByTestId('splash')).toHaveCount(0, { timeout: 8000 });
    await expect.poll(() => scene(page)).toBe('menu');
    await page.getByTestId('play').click();
    await skipStory(page);
  });

  test('a tap skips it', async ({ page }) => {
    await page.goto('/?splash');
    await page.getByTestId('splash').click();
    await expect(page.getByTestId('splash')).toHaveCount(0, { timeout: 2500 });
  });
});

test.describe('update notice', () => {
  // The service worker would fetch on the page's behalf, bypassing page.route.
  test.use({ serviceWorkers: 'block' });

  test('offers a reload when a newer build is out', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await expect.poll(() => scene(page)).toBe('menu');
    // The server now has a different build.
    await page.route(/\/$/, async (route) => {
      const res = await route.fetch();
      const html = (await res.text()).replace(/assets\/index-[\w-]+\.js/, 'assets/index-NEWER.js');
      await route.fulfill({ response: res, body: html });
    });
    await page.clock.fastForward('11:00');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByTestId('update-reload')).toBeVisible();
  });
});
