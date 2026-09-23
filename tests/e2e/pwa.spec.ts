import { expect, test } from '@playwright/test';
import { scene } from './helpers';

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
    await expect.poll(() => scene(page)).toBe('play');
    await context.setOffline(false);
  });
});
