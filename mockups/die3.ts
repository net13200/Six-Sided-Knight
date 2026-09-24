/**
 * Die readability mockups, version 3 (not shipped). The same level drawn four ways:
 *  A. today
 *  B. Bold cube: the die overflows its tile, a much bigger top face, thicker edges
 *  C. Face + tabs: the top face fills the tile; the four side faces are big round
 *     tabs sticking out on the side they'll hit
 *  D. Big die panel: B on the board, plus a large "your die" panel under the board
 *     (Menu and Sound move up to the header)
 */
import { defaultRules } from '../src/content/register';
import { DIRS, createState, DIR_DELTA, type GameState, type LevelData } from '../src/engine';
import { drawFace, drawTile } from '../src/game/view/art';
import { drawBoard, drawCompass, facesOf } from '../src/game/view/board';
import { drawDieCube } from '../src/game/view/cube';
import { Fx } from '../src/game/view/fx';
import { BAR_Y, BOARD_Y, TILE, tileCenter } from '../src/game/view/layout';
import { drawOutcomeChips, predictOutcome } from '../src/game/view/outcome';
const drawOutcomeChipsToday = (x: number, y: number) => drawOutcomeChips(ctx, outcomes, x, y);
import { C } from '../src/game/view/palette';
import { roleColor } from '../src/game/view/roles';

const rules = defaultRules();
const level: LevelData = {
  schema: 1,
  id: 'mock',
  name: 'Mock',
  grid: [
    '########',
    '#......#',
    '#..k...#',
    '#.$@|.>#',
    '#..^...#',
    '#......#',
    '#.s..*.#',
    '#......#',
    '########',
  ],
};
const state = createState(rules, level);
const outcomes = DIRS.map((d) => [d, predictOutcome(rules, state, d)] as const);
const fx = new Fx();

const W = 340;
const H = 480;
const K = 2;
const GAP = 16;
const panels = [
  'A. Today',
  'B. Big cube, labels on tiles',
  'C. Big face + side tabs',
  'D. B + big die panel',
];
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = (W * 4 + GAP * 3) * K;
canvas.height = (H + 30) * K;
canvas.style.width = `${W * 4 + GAP * 3}px`;
canvas.style.height = `${H + 30}px`;
const ctx = canvas.getContext('2d')!;
ctx.scale(K, K);
ctx.fillStyle = '#0b0a10';
ctx.fillRect(0, 0, canvas.width, canvas.height);

function button(x: number, y: number, w: number, h: number, label: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fillStyle = '#221f2f';
  ctx.fill();
  ctx.strokeStyle = '#3a3550';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = C.text;
  ctx.font = '600 10px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 12);
}

function hud(title: string) {
  ctx.fillStyle = C.hud;
  ctx.fillRect(0, 0, W, BOARD_Y - 4);
  ctx.fillStyle = C.text;
  ctx.font = 'bold 15px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 12, 16);
  ctx.fillStyle = C.textDim;
  ctx.font = '12px system-ui';
  ctx.fillText('Moves 0 / par 9', 12, 35);
  for (let i = 0; i < 5; i++) drawFace(ctx, 'Heart', 328 - (5 - i) * 17 + 8, 16, 14);
}

/** Board with the die hidden (drawn separately per variant). */
function boardWithoutDie() {
  const hidden: GameState = { ...state, player: { ...state.player, x: 40, y: 40 } };
  drawBoard(ctx, rules, hidden, fx.compute(), fx);
  const p = state.player;
  drawTile(
    ctx,
    rules.tiles.get(state.tiles[p.y * state.width + p.x]!),
    10 + p.x * TILE,
    BOARD_Y + p.y * TILE,
    TILE,
    p.x,
    p.y,
    0,
  );
}

/** B: bold cube — bigger overall, much bigger top face, thin side panels. */
function boldCube(cx: number, cy: number, scale = 1) {
  const f = facesOf(state.player.die);
  const R = 28 * scale;
  const r = 17 * scale;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(-R + 3, -R + 5, R * 2, R * 2, 8);
  ctx.fill();
  const sides = [
    ['north', 0, -1],
    ['east', 1, 0],
    ['south', 0, 1],
    ['west', -1, 0],
  ] as const;
  for (const [slot, dx, dy] of sides) {
    ctx.beginPath();
    if (dx === 0) {
      ctx.moveTo(-r, dy * r);
      ctx.lineTo(r, dy * r);
      ctx.lineTo(R, dy * R);
      ctx.lineTo(-R, dy * R);
    } else {
      ctx.moveTo(dx * r, -r);
      ctx.lineTo(dx * r, r);
      ctx.lineTo(dx * R, R);
      ctx.lineTo(dx * R, -R);
    }
    ctx.closePath();
    ctx.fillStyle = roleColor(f[slot] ?? '');
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    const mid = (r + R) / 2;
    ctx.translate(dx * mid, dy * mid);
    drawFace(ctx, f[slot] ?? '', 0, 0, 12 * scale);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.roundRect(-r, -r, r * 2, r * 2, 4);
  ctx.fillStyle = '#fbf6ea';
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  drawFace(ctx, f.top ?? '', 0, 0, 29 * scale);
  ctx.beginPath();
  ctx.roundRect(-R, -R, R * 2, R * 2, 7);
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

/** C: the top face fills the tile; side faces are tabs over the tile edges. */
function faceAndTabs(cx: number, cy: number) {
  const f = facesOf(state.player.die);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(cx - 21 + 2, cy - 21 + 4, 42, 42, 9);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx - 21, cy - 21, 42, 42, 9);
  ctx.fillStyle = '#fbf6ea';
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 3;
  ctx.stroke();
  drawFace(ctx, f.top ?? '', cx, cy, 34);
  for (const dir of DIRS) {
    const slot = { N: 'north', E: 'east', S: 'south', W: 'west' }[dir];
    const { dx, dy } = DIR_DELTA[dir];
    const x = cx + dx * 27;
    const y = cy + dy * 27;
    ctx.beginPath();
    ctx.arc(x, y, 12.5, 0, Math.PI * 2);
    ctx.fillStyle = roleColor(f[slot] ?? '');
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    drawFace(ctx, f[slot] ?? '', x, y, 18);
  }
  ctx.restore();
}

/** Outcome labels drawn on the target tiles themselves, big, so they never cover the die. */
function tileLabels(cx: number, cy: number, dist = 40) {
  for (const [d, o] of outcomes) {
    if (!o.chip) continue;
    const { dx, dy } = DIR_DELTA[d];
    // At the far edge of the target tile, so the tile's contents stay visible.
    const x = cx + dx * (dist + 14);
    const y = cy + dy * (dist + 14) + (dx !== 0 ? 0 : 0);
    ctx.font = 'bold 11px system-ui';
    const w = Math.max(22, ctx.measureText(o.chip.label).width + 12);
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 8, w, 16, 8);
    ctx.fillStyle = '#0c0a12';
    ctx.fill();
    ctx.strokeStyle = o.chip.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = o.chip.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.chip.label, x, y + 0.5);
  }
}

/** D: a large "your die" panel under the board (the unfolded cube, big). */
function bigPanel() {
  const f = facesOf(state.player.die);
  const cx = 170;
  const cy = BAR_Y + 34;
  const s = 25;
  ctx.fillStyle = C.textDim;
  ctx.font = '600 9px system-ui';
  ctx.textAlign = 'center';
  const cells: Array<[string, number, number]> = [
    ['north', 0, -1],
    ['west', -1, 0],
    ['top', 0, 0],
    ['east', 1, 0],
    ['south', 0, 1],
  ];
  for (const [slot, dx, dy] of cells) {
    const x = cx + dx * (s + 2);
    const y = cy + dy * (s + 2);
    ctx.beginPath();
    ctx.roundRect(x - s / 2, y - s / 2, s, s, 5);
    ctx.fillStyle = slot === 'top' ? '#fbf6ea' : roleColor(f[slot] ?? '');
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    drawFace(ctx, f[slot] ?? '', x, y, slot === 'top' ? 22 : 20);
  }
  // bottom face, to the side
  ctx.beginPath();
  ctx.roundRect(cx + 2 * (s + 2) - s / 2 + 6, cy + (s + 2) - s / 2, s, s, 5);
  ctx.setLineDash([3, 2]);
  ctx.strokeStyle = roleColor(f.bottom ?? '');
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  drawFace(ctx, f.bottom ?? '', cx + 2 * (s + 2) + 6, cy + (s + 2), 15);
  ctx.fillText('under', cx + 2 * (s + 2) + 6, cy + (s + 2) + 17);
}

panels.forEach((label, i) => {
  ctx.save();
  ctx.translate(i * (W + GAP), 30);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  hud('3. Keys and Coins');
  if (i === 3) {
    // Menu + Sound move into the header
    ctx.fillStyle = C.textDim;
    ctx.font = '600 10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText('☰  🔊', 328, 36);
  }
  boardWithoutDie();
  const p = tileCenter(state.player.x, state.player.y);
  if (i === 0) {
    drawDieCube(
      ctx,
      state.player.die,
      state.player.die.orient,
      p.x,
      p.y,
      { sx: 1, sy: 1, flash: 0 },
      true,
    );
    drawOutcomeChipsToday(p.x, p.y);
  } else if (i === 1 || i === 3) {
    boldCube(p.x, p.y);
    tileLabels(p.x, p.y);
  } else {
    faceAndTabs(p.x, p.y);
    tileLabels(p.x, p.y, 44);
  }
  const y = BAR_Y + 3;
  if (i < 3) {
    button(4, y, 64, 62, 'Undo');
    button(70, y, 64, 62, 'Retry');
    button(206, y, 64, 62, 'Menu');
    button(272, y, 64, 62, 'Sound');
    drawCompass(ctx, state.player.die, 170, BAR_Y + 34);
  } else {
    button(4, y, 64, 62, 'Undo');
    button(272, y, 64, 62, 'Retry');
    bigPanel();
  }
  ctx.restore();
  ctx.fillStyle = C.text;
  ctx.font = 'bold 15px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, i * (W + GAP) + 4, 14);
});
document.title = 'ready';
