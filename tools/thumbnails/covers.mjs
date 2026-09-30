/**
 * Makes CrazyGames' game covers into crazygames/, drawn like Poki's thumbnail
 * (tools/thumbnails/thumb.ts): only the title as text, no border, no logos.
 *   cover-landscape.png   1920x1080 (16:9)
 *   cover-portrait.png    800x1200 (2:3)
 *   cover-square.png      800x800 (1:1)
 *
 *   node tools/thumbnails/covers.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const OUT = 'crazygames';
const PORT = 4181;
const BASE = `http://localhost:${PORT}`;
const COVERS = [
  { name: 'cover-landscape.png', w: 1920, h: 1080 },
  { name: 'cover-portrait.png', w: 800, h: 1200 },
  { name: 'cover-square.png', w: 800, h: 800 },
];

mkdirSync(OUT, { recursive: true });
const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const exe = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
  for (const c of COVERS) {
    const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/tools/thumbnails/thumb.html?w=${c.w}&h=${c.h}`);
    await page.waitForFunction(() => window.thumbReady === true, null, { timeout: 30_000 });
    await page.locator('#thumb').screenshot({ path: join(OUT, c.name) });
    await ctx.close();
  }
  await browser.close();
  console.log(`Covers written to ${OUT}/`);
} finally {
  dev.kill();
}
