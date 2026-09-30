/**
 * Makes CrazyGames' game covers into crazygames/, drawn like Poki's thumbnail
 * (tools/thumbnails/thumb.ts): only the title as text, no border, no logos.
 *   cover-landscape.png   1920x1080 (16:9)
 *   cover-portrait.png    800x1200 (2:3)
 *   cover-square.png      800x800 (1:1)
 *
 *   node tools/thumbnails/covers.mjs
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { drawCover, withGame } from './shared.mjs';

const OUT = 'crazygames';
const COVERS = [
  { name: 'cover-landscape.png', w: 1920, h: 1080 },
  { name: 'cover-portrait.png', w: 800, h: 1200 },
  { name: 'cover-square.png', w: 800, h: 800 },
];

mkdirSync(OUT, { recursive: true });
await withGame(4181, async (browser, base) => {
  for (const c of COVERS) await drawCover(browser, base, c.w, c.h, join(OUT, c.name));
});
console.log(`Covers written to ${OUT}/`);
