/**
 * Renders the app icon with the game's own art (tools/make-icons.mjs
 * screenshots it). ?size=512&maskable=1 — maskable icons keep the art inside
 * the central safe zone and fill the whole square with background.
 */
import { drawBadge, drawDieBody, drawFace } from '../src/game/view/art';
import { C } from '../src/game/view/palette';

const q = new URLSearchParams(location.search);
const size = Number(q.get('size') ?? 512);
const maskable = q.get('maskable') === '1';
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = size;
canvas.height = size;
const ctx = canvas.getContext('2d')!;
const k = size / 100; // draw in a 100x100 space
ctx.scale(k, k);

// Background: full bleed for maskable, rounded tile otherwise.
ctx.fillStyle = C.bg;
if (maskable) ctx.fillRect(0, 0, 100, 100);
else {
  ctx.beginPath();
  ctx.roundRect(2, 2, 96, 96, 22);
  ctx.fill();
}
const glow = ctx.createRadialGradient(50, 50, 8, 50, 50, 50);
glow.addColorStop(0, 'rgba(255,215,94,0.28)');
glow.addColorStop(1, 'rgba(255,215,94,0)');
ctx.fillStyle = glow;
ctx.fillRect(0, 0, 100, 100);

// The hero die: Shield on top, faces around it (as on the title screen).
const s = maskable ? 0.72 : 0.9; // maskable safe zone is the central 80%
ctx.translate(50, 52);
ctx.scale(s, s);
drawDieBody(ctx, 0, 0, 44, 44);
drawFace(ctx, 'Shield', 0, -1.5, 28);
for (const [face, dx, dy] of [
  ['Bomb', 0, -1],
  ['Sword', 1, 0],
  ['Key', 0, 1],
  ['Coin', -1, 0],
] as const) {
  drawBadge(ctx, face, dx * 36, dy * 36, 9);
}
document.title = 'ready';
