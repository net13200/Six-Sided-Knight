/**
 * Renders the game's music tracks to WAV files for listening:
 *   npx vite --port 5199 &  node tools/render-music.mjs [outDir]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const outDir = process.argv[2] ?? 'music-previews';
const local = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(local) ? { executablePath: local } : {});
const page = await browser.newPage();
await page.goto(process.env.MUSIC_URL ?? 'http://localhost:5199/mockups/music.html');
await page.waitForFunction(() => document.title === 'ready');
mkdirSync(outDir, { recursive: true });
for (const [id, loops] of [
  ['hall', 2],
  ['puzzle', 1],
  ['depths', 2],
]) {
  const b64 = await page.evaluate(([i, n]) => window.renderTrack(i, n), [id, loops]);
  const file = `${outDir}/${id}.wav`;
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(file);
}
await browser.close();
