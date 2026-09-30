/**
 * Makes CrazyGames' preview videos into crazygames/:
 *   preview-landscape.mp4   1920x1080
 *   preview-portrait.mp4    1080x1920
 *
 *   node tools/thumbnails/videos.mjs
 *
 * Their rules: 15-20 seconds, 1080p, no sound, the cover as the first frame,
 * no black bars, text or logos on top, and gameplay at its real pace. So each
 * video opens on the cover, then plays a few levels as they look in the game
 * in that window, one move at a time. Only part of each solution is shown
 * (it stops well before the stairs), and each level has the die in a
 * different skin.
 * Needs an ffmpeg with H.264 (see shared.mjs).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawCover, ffmpeg, recordClip, routes, withGame } from './shared.mjs';

const OUT = 'crazygames';
const TMP = 'tools/thumbnails/out';
/** The cover holds this long before the gameplay starts. */
const COVER_S = 1.5;
/** The longest a scene may run (the latest part of what's played is kept). */
const SCENE_S = 4.5;
/** How much of each solution is played: never all of it. */
const PART = 0.6;
/**
 * Campaign level (0-based), ms per move (a natural pace, never sped up) and
 * the die's skin. One level from each of four districts.
 */
const SCENES = [
  { level: 18, stepMs: 420, skin: 'gilded' },
  { level: 23, stepMs: 420, skin: 'frost' },
  { level: 38, stepMs: 420, skin: 'night' },
  { level: 47, stepMs: 420, skin: 'flame' },
];
const FORMATS = [
  { name: 'landscape', w: 1920, h: 1080 },
  { name: 'portrait', w: 1080, h: 1920 },
];

mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const paths = (await routes(SCENES.map((s) => s.level))).map((r) =>
  r.slice(0, Math.max(3, Math.floor(r.length * PART))),
);
const made = [];
await withGame(4182, async (browser, base) => {
  for (const f of FORMATS) {
    const cover = join(TMP, `cover-${f.name}.png`);
    await drawCover(browser, base, f.w, f.h, cover);
    const clips = [];
    for (const [i, scene] of SCENES.entries()) {
      const c = await recordClip(browser, base, {
        ...scene,
        route: paths[i],
        w: f.w,
        h: f.h,
        dir: join(TMP, `${f.name}-clip${i}`),
      });
      clips.push({ ...c, start: Math.max(c.start, c.end - SCENE_S) });
    }
    made.push({ ...f, cover, clips });
  }
});

const ff = ffmpeg();
const x264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '30', '-an'];
for (const f of made) {
  const size = `scale=${f.w}:${f.h},setsar=1,fps=30`;
  const parts = [join(TMP, `${f.name}-part0.mp4`)];
  execFileSync(ff, [
    ...['-y', '-loglevel', 'error', '-loop', '1', '-t', String(COVER_S), '-i', f.cover],
    ...['-vf', size, ...x264, parts[0]],
  ]);
  f.clips.forEach((c, i) => {
    const out = join(TMP, `${f.name}-part${i + 1}.mp4`);
    execFileSync(ff, [
      ...['-y', '-loglevel', 'error', '-ss', c.start.toFixed(2), '-to', c.end.toFixed(2)],
      ...['-i', c.webm, '-vf', size, ...x264, out],
    ]);
    parts.push(out);
  });
  const list = join(TMP, `${f.name}-list.txt`);
  writeFileSync(list, parts.map((p) => `file '${join(process.cwd(), p)}'`).join('\n'));
  execFileSync(ff, [
    ...['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list],
    ...x264,
    ...['-movflags', '+faststart', join(OUT, `preview-${f.name}.mp4`)],
  ]);
}
console.log(`Preview videos written to ${OUT}/`);
