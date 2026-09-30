/**
 * Shared by the thumbnail, cover and video scripts: the dev server, the
 * browser, a seeded save, par routes from the game's own solver, and ffmpeg.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

export const KEY = { N: 'ArrowUp', E: 'ArrowRight', S: 'ArrowDown', W: 'ArrowLeft' };

/** An ffmpeg with H.264: FFMPEG=/path, or the one from `pip install imageio-ffmpeg`. */
export function ffmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    return execFileSync('python3', [
      '-c',
      'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())',
    ])
      .toString()
      .trim();
  } catch {
    return 'ffmpeg';
  }
}

/** A player with every level beaten (so the Ember skin is unlocked and worn). */
export function seedSave() {
  const levels = {};
  for (let c = 1; c <= 6; c++)
    for (let l = 1; l <= 10; l++)
      levels[`c${c}-${String(l).padStart(2, '0')}`] = {
        stars: 3,
        bestMoves: 1,
        completions: 1,
        bestTimeMs: 1,
      };
  return JSON.stringify({
    version: 3,
    createdAt: 1,
    campaign: 2,
    levels,
    skin: 'ember',
    hints: { inspect: true },
    settings: { muted: true },
  });
}

/** The par route for each campaign level (0-based), from the game's own solver (run in Node). */
export async function routes(levelIndexes) {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const { defaultRules } = await server.ssrLoadModule('/src/content/register.ts');
  const { createState, parseTextLevel } = await server.ssrLoadModule('/src/engine/index.ts');
  const { solve } = await server.ssrLoadModule('/src/solver/solve.ts');
  const files = readdirSync('src/levels/data')
    .filter((f) => f.endsWith('.txt'))
    .sort();
  const rules = defaultRules();
  const out = levelIndexes.map((i) => {
    const level = parseTextLevel(readFileSync(join('src/levels/data', files[i]), 'utf8'));
    return solve(rules, createState(rules, level), { maxNodes: 400_000 }).path;
  });
  await server.close();
  return out;
}

/** Runs `fn(browser, base)` with Vite's dev server up on `port`. */
export async function withGame(port, fn) {
  const base = `http://localhost:${port}`;
  const dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const exe = '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
    try {
      await fn(browser, base);
    } finally {
      await browser.close();
    }
  } finally {
    dev.kill();
  }
}

/** Draws a cover or thumbnail (tools/thumbnails/thumb.ts) at w x h into `path`. */
export async function drawCover(browser, base, w, h, path) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${base}/tools/thumbnails/thumb.html?w=${w}&h=${h}`);
  await page.waitForFunction(() => window.thumbReady === true, null, { timeout: 30_000 });
  await page.locator('#thumb').screenshot({ path });
  await ctx.close();
}

/**
 * Records a level being played along `route` in a `w` x `h` window. Returns
 * the webm and the seconds in it from the first move to just after the
 * winning one (before the results screen comes up).
 */
export async function recordClip(browser, base, { level, route, stepMs, w, h, dir }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    recordVideo: { dir, size: { width: w, height: h } },
  });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('ssk.save')) localStorage.setItem('ssk.save', s);
  }, seedSave());
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto(`${base}/?level=${level + 1}`);
  await page.waitForFunction(() => window.__ssk?.scene() === 'play', null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  const first = (Date.now() - t0) / 1000 - 0.25;
  let last = 0;
  for (const d of route) {
    last = (Date.now() - t0) / 1000;
    await page.keyboard.press(KEY[d]);
    await page.waitForTimeout(stepMs);
  }
  await page.waitForTimeout(700);
  await ctx.close();
  const webm = join(
    dir,
    readdirSync(dir).find((f) => f.endsWith('.webm')),
  );
  return { webm, start: first, end: last + 0.55 };
}
