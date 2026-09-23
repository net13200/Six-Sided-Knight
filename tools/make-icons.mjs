/**
 * Generates the PWA icons in public/icons/ from mockups/icon.html (drawn with
 * the game's own procedural art). Needs a running dev server:
 *   npx vite --port 5199 & node tools/make-icons.mjs
 */
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.env.ICON_URL ?? 'http://localhost:5199/mockups/icon.html';
const local = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(local) ? { executablePath: local } : {});
mkdirSync('public/icons', { recursive: true });
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];
for (const [name, size, maskable] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.goto(`${base}?size=${size}&maskable=${maskable ? 1 : 0}`);
  await page.waitForFunction(() => document.title === 'ready');
  await page.locator('canvas').screenshot({ path: `public/icons/${name}`, omitBackground: true });
  await page.close();
  console.log(`public/icons/${name}`);
}
await browser.close();
