/**
 * Makes Poki's thumbnails into poki/:
 *   thumbnail-1080.png, thumbnail-628.png   the static thumbnail (title, board, burning die)
 *   thumbnail-animated.mp4                  1080x1080, three short gameplay scenes
 *
 *   node tools/thumbnails/make.mjs
 *
 * Runs the game in Vite's dev server and records it with Playwright's
 * Chromium. Needs an ffmpeg with H.264 (FFMPEG=/path, or `pip install
 * imageio-ffmpeg`, which this script finds on its own).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const OUT = 'poki';
const TMP = 'tools/thumbnails/out';
const PORT = 4180;
/** Seconds per scene in the animated thumbnail. */
const SCENE_S = 2;
/** Top of the square crop in the 3x recording: logical y 46, just above the board. */
const BOARD_TOP = 138;
const BASE = `http://localhost:${PORT}`;
/** Scenes for the animated thumbnail: campaign level (0-based) and ms per move. */
const SCENES = [
  { level: 9, stepMs: 230 }, // Crowd Control: a Bomb takes out a crowd
  { level: 11, stepMs: 380 }, // Skating Rink: sliding on ice
  { level: 44, stepMs: 230 }, // Winter Watch: Freeze and an archer
];

function ffmpeg() {
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
function seedSave() {
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

/** The par route for a level, from the game's own solver (run in Node). */
async function routes() {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const { defaultRules } = await server.ssrLoadModule('/src/content/register.ts');
  const { createState } = await server.ssrLoadModule('/src/engine/index.ts');
  const { solve } = await server.ssrLoadModule('/src/solver/solve.ts');
  const { parseTextLevel } = await server.ssrLoadModule('/src/engine/index.ts');
  const { readFileSync } = await import('node:fs');
  const files = readdirSync('src/levels/data')
    .filter((f) => f.endsWith('.txt'))
    .sort();
  const rules = defaultRules();
  const out = SCENES.map((s) => {
    const level = parseTextLevel(readFileSync(join('src/levels/data', files[s.level]), 'utf8'));
    return solve(rules, createState(rules, level), { maxNodes: 400_000 }).path;
  });
  await server.close();
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const paths = await routes();
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
    const save = seedSave();
    const seeded = async (ctx) =>
      ctx.addInitScript((s) => {
        if (!localStorage.getItem('ssk.save')) localStorage.setItem('ssk.save', s);
      }, save);
    const ready = (page) =>
      page.waitForFunction(() => window.__ssk?.scene() === 'play', null, { timeout: 30_000 });
    const KEY = { N: 'ArrowUp', E: 'ArrowRight', S: 'ArrowDown', W: 'ArrowLeft' };

    // 1. The static thumbnail.
    {
      const ctx = await browser.newContext({ viewport: { width: 1080, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/tools/thumbnails/thumb.html`);
      await page.waitForFunction(() => window.thumbReady === true, null, { timeout: 30_000 });
      await page.locator('#thumb').screenshot({ path: join(OUT, 'thumbnail-1080.png') });
      await ctx.close();
    }
    // 2. Gameplay clips: the game at 3x (1020x1440, with a strip of wall each side),
    // later cropped to the board.
    const clips = [];
    for (const [i, scene] of SCENES.entries()) {
      const dir = join(TMP, `clip${i}`);
      const ctx = await browser.newContext({
        viewport: { width: 1080, height: 1440 },
        recordVideo: { dir, size: { width: 1080, height: 1440 } },
      });
      await seeded(ctx);
      const t0 = Date.now();
      const page = await ctx.newPage();
      await page.goto(`${BASE}/?level=${scene.level + 1}`);
      await ready(page);
      await page.waitForTimeout(500);
      const first = (Date.now() - t0) / 1000 - 0.25;
      let last = 0;
      for (const d of paths[i]) {
        last = (Date.now() - t0) / 1000;
        await page.keyboard.press(KEY[d]);
        await page.waitForTimeout(scene.stepMs);
      }
      await page.waitForTimeout(700);
      // End on the winning move, before the results screen comes up.
      const end = last + 0.55;
      // Poki asks for scenes of 1-2 seconds: keep the end of the route (the payoff).
      const start = Math.max(first, end - SCENE_S);
      await ctx.close();
      const webm = join(
        dir,
        readdirSync(dir).find((f) => f.endsWith('.webm')),
      );
      clips.push({ webm, start, end });
    }
    await browser.close();

    const ff = ffmpeg();
    execFileSync(ff, [
      '-y',
      '-loglevel',
      'error',
      '-i',
      join(OUT, 'thumbnail-1080.png'),
      '-vf',
      'scale=628:628',
      join(OUT, 'thumbnail-628.png'),
    ]);
    const parts = clips.map((c, i) => {
      const out = join(TMP, `part${i}.mp4`);
      execFileSync(ff, [
        '-y',
        '-loglevel',
        'error',
        '-ss',
        c.start.toFixed(2),
        '-to',
        c.end.toFixed(2),
        '-i',
        c.webm,
        '-vf',
        `crop=1080:1080:0:${BOARD_TOP},fps=30`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '22',
        '-an',
        out,
      ]);
      return out;
    });
    const list = join(TMP, 'list.txt');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(list, parts.map((p) => `file '${join(process.cwd(), p)}'`).join('\n'));
    execFileSync(ff, [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '22',
      '-movflags',
      '+faststart',
      '-an',
      join(OUT, 'thumbnail-animated.mp4'),
    ]);
    console.log(`Thumbnails written to ${OUT}/`);
  } finally {
    dev.kill();
  }
}

await main();
