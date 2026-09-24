/**
 * Renders the app icon (the logo's 3D die) with the game's own art (tools/make-icons.mjs
 * screenshots it). ?size=512&maskable=1 — maskable icons keep the art inside
 * the central safe zone and fill the whole square with background.
 */
import { cameraMatrix, drawCube3d } from '../src/game/view/cube';
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
// The logo die, as big as the icon allows (maskable icons keep to the central safe zone).
const die = {
  shape: 'd6',
  loadout: ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Coin'],
  orient: 0,
};
drawCube3d(ctx, die, 50, 51, maskable ? 44 : 46, cameraMatrix(-38, -32));
document.title = 'ready';
