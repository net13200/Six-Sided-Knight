/**
 * Title-screen logo + app icon mockups (not shipped).
 *  1. Today: flat die with small face badges around it
 *  2. 3D die: a big isometric die (Shield on top, Sword and Key on the sides)
 *  3. Crest: one huge Shield face with a Sword behind it, like a knight's crest
 * Each: the title screen top half, plus the app icon at home-screen size (60 px) and large.
 */
import { drawBadge, drawDieBody, drawFace } from '../src/game/view/art';
import { cameraMatrix, drawCube3d } from '../src/game/view/cube';
import { C } from '../src/game/view/palette';

const die = {
  shape: 'd6',
  loadout: ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Coin'],
  orient: 0,
};
const W = 340;
const H = 330;
const GAP = 16;
const K = 2;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = (W * 3 + GAP * 2) * K;
canvas.height = (H + 30) * K;
canvas.style.width = `${W * 3 + GAP * 2}px`;
canvas.style.height = `${H + 30}px`;
const ctx = canvas.getContext('2d')!;
ctx.scale(K, K);
ctx.fillStyle = '#0b0a10';
ctx.fillRect(0, 0, W * 3 + GAP * 2, H + 30);

type Art = (cx: number, cy: number, size: number) => void; // size = full width of the art

const today: Art = (cx, cy, size) => {
  const k = size / 130;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  drawDieBody(ctx, 0, 0, 64, 64);
  drawFace(ctx, 'Shield', 0, -2, 40);
  for (const [f, dx, dy] of [
    ['Bomb', 0, -1],
    ['Sword', 1, 0],
    ['Key', 0, 1],
    ['Coin', -1, 0],
  ] as const)
    drawBadge(ctx, f, dx * 52, dy * 52, 13);
  ctx.restore();
};

const cube3d: Art = (cx, cy, size) => {
  // Soft shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.42, size * 0.36, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawCube3d(ctx, die, cx, cy, size * 0.42, cameraMatrix(-38, -32));
  // A bold outline around the silhouette helps it read at icon sizes.
};

const crest: Art = (cx, cy, size) => {
  const k = size / 130;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  // Sword behind, diagonal
  drawFace(ctx, 'Sword', 0, 4, 205);
  // Die tile in front
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.roundRect(-40, -36, 84, 84, 16);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-42, -42, 84, 84, 16);
  ctx.fillStyle = '#fbf6ea';
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 4;
  ctx.stroke();
  drawFace(ctx, 'Shield', 0, 0, 62);
  // corner pips hint it's a die
  ctx.fillStyle = '#c8b99a';
  for (const [x, y] of [
    [-30, -30],
    [30, 30],
  ])
    ctx.fillRect(x - 3, y - 3, 6, 6);
  ctx.restore();
};

const arts: Array<[string, Art]> = [
  ['1. Today', today],
  ['2. Big 3D die', cube3d],
  ['3. Crest', crest],
];

function icon(art: Art, x: number, y: number, s: number) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, s * 0.22);
  ctx.fillStyle = C.bg;
  ctx.fill();
  ctx.clip();
  art(x + s / 2, y + s / 2 + (art === cube3d ? -s * 0.02 : 0), s * (art === today ? 0.92 : 0.8));
  ctx.restore();
}

arts.forEach(([label, art], i) => {
  const ox = i * (W + GAP);
  ctx.save();
  ctx.translate(ox, 30);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.text;
  ctx.font = '800 34px system-ui';
  ctx.fillText('Six Sided', 170, 40);
  ctx.fillStyle = C.gold;
  ctx.fillText('Knight', 170, 76);
  art(170, 172, art === today ? 130 : 150);
  // Home-screen mock: icons at real size (60) and large (96)
  ctx.fillStyle = '#2b3350';
  ctx.fillRect(0, 250, W, 80);
  icon(art, 40, 260, 60);
  ctx.fillStyle = '#fff';
  ctx.font = '11px system-ui';
  ctx.fillText('Six Sided…', 70, 326);
  icon(art, 200, 254, 72);
  ctx.restore();
  ctx.fillStyle = C.text;
  ctx.font = 'bold 15px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(label, ox + 4, 14);
});
document.title = 'ready';
