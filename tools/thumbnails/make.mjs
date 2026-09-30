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
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawCover, ffmpeg, recordClip, routes, withGame } from './shared.mjs';

const OUT = 'poki';
const TMP = 'tools/thumbnails/out';
/** Seconds per scene in the animated thumbnail. */
const SCENE_S = 2;
/** Top of the square crop in the 3x recording: logical y 46, just above the board. */
const BOARD_TOP = 138;
/** Scenes for the animated thumbnail: campaign level (0-based) and ms per move. */
const SCENES = [
  { level: 9, stepMs: 230 }, // Crowd Control: a Bomb takes out a crowd
  { level: 11, stepMs: 380 }, // Skating Rink: sliding on ice
  { level: 44, stepMs: 230 }, // Winter Watch: Freeze and an archer
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const paths = await routes(SCENES.map((s) => s.level));
  const clips = [];
  await withGame(4180, async (browser, base) => {
    // 1. The static thumbnail.
    await drawCover(browser, base, 1080, 1080, join(OUT, 'thumbnail-1080.png'));
    // 2. Gameplay clips: the game at 3x (1020x1440, with a strip of wall each side),
    // later cropped to the board.
    for (const [i, scene] of SCENES.entries()) {
      const c = await recordClip(browser, base, {
        ...scene,
        route: paths[i],
        w: 1080,
        h: 1440,
        dir: join(TMP, `clip${i}`),
      });
      // Poki asks for scenes of 1-2 seconds: keep the end of the route (the payoff).
      clips.push({ ...c, start: Math.max(c.start, c.end - SCENE_S) });
    }
  });

  const ff = ffmpeg();
  const run = (args) => execFileSync(ff, ['-y', '-loglevel', 'error', ...args]);
  run([
    '-i',
    join(OUT, 'thumbnail-1080.png'),
    '-vf',
    'scale=628:628',
    join(OUT, 'thumbnail-628.png'),
  ]);
  const x264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-an'];
  const parts = clips.map((c, i) => {
    const out = join(TMP, `part${i}.mp4`);
    run([
      '-ss',
      c.start.toFixed(2),
      '-to',
      c.end.toFixed(2),
      '-i',
      c.webm,
      '-vf',
      `crop=1080:1080:0:${BOARD_TOP},fps=30`,
      ...x264,
      out,
    ]);
    return out;
  });
  const list = join(TMP, 'list.txt');
  writeFileSync(list, parts.map((p) => `file '${join(process.cwd(), p)}'`).join('\n'));
  run([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    ...x264,
    '-movflags',
    '+faststart',
    join(OUT, 'thumbnail-animated.mp4'),
  ]);
  console.log(`Thumbnails written to ${OUT}/`);
}

await main();
