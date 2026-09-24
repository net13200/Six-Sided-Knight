import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const running = (page: Page) =>
  page.evaluate(() => (window.__ssk as { audioRunning(): boolean }).audioRunning());
const localChromium = '/opt/pw-browsers/chromium';
const base = existsSync(localChromium) ? { executablePath: localChromium } : {};

// A browser that allows sound on load (e.g. an installed app): no tap needed.
test.use({ launchOptions: { ...base, args: ['--autoplay-policy=no-user-gesture-required'] } });

test('music plays on the title screen with no interaction at all', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => running(page)).toBe(true);
});
