/** Illustrations for the story pages, drawn in code like the rest of the art. */
import type { DieState, Rules } from '../../engine';
import type { StoryPage } from '../story';
import { drawCrown, drawEnemy, drawFace, drawTile } from './art';
import { cameraMatrix, drawCube3d } from './cube';
import { C } from './palette';

type Ctx = CanvasRenderingContext2D;

const LOADOUT = ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Coin'];

function die(orient: number): DieState {
  return { shape: 'd6', loadout: LOADOUT, orient } as DieState;
}

/** A die of Oddmere: `alpha` < 1 for the ones that just tumble along. */
function cube(
  ctx: Ctx,
  x: number,
  y: number,
  size: number,
  orient: number,
  yaw: number,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 1.05, size * 0.85, size * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  drawCube3d(ctx, die(orient), x, y, size, cameraMatrix(yaw, -30));
  ctx.restore();
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, strength = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('ALPHA', String(strength)));
  g.addColorStop(1, color.replace('ALPHA', '0'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

const GOLD = 'rgba(255,215,94,ALPHA)';
const FROST = 'rgba(159,224,255,ALPHA)';

function sparkle(ctx: Ctx, x: number, y: number, r: number, color: string = C.gold) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** Sparkles drifting upward from (x, y), looping over time. */
function rising(
  ctx: Ctx,
  x: number,
  y: number,
  spread: number,
  t: number,
  n = 7,
  color: string = C.gold,
) {
  for (let i = 0; i < n; i++) {
    const k = (t * 0.25 + i / n) % 1;
    const sx = x + Math.sin(i * 2.4 + t * 0.8) * spread * (0.4 + k * 0.6);
    ctx.save();
    ctx.globalAlpha *= Math.sin(k * Math.PI);
    sparkle(ctx, sx, y - k * 110, 2.5 + (i % 3), color);
    ctx.restore();
  }
}

function throne(ctx: Ctx, x: number, y: number) {
  ctx.save();
  ctx.lineJoin = 'round';
  // Back, seat, legs.
  ctx.fillStyle = '#6b2d3a';
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 34, y + 20);
  ctx.lineTo(x - 34, y - 50);
  ctx.quadraticCurveTo(x, y - 82, x + 34, y - 50);
  ctx.lineTo(x + 34, y + 20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a1f29';
  ctx.beginPath();
  ctx.roundRect(x - 44, y + 12, 88, 18, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3a1820';
  ctx.fillRect(x - 40, y + 30, 8, 26);
  ctx.fillRect(x + 32, y + 30, 8, 26);
  ctx.restore();
}

function scroll(ctx: Ctx, x: number, y: number, angle: number, mark: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#efe3c2';
  ctx.strokeStyle = '#a8916a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-13, -16, 26, 32, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#7a6448';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, 0, 1);
  ctx.restore();
}

function well(ctx: Ctx, x: number, y: number, t: number, lit = true) {
  ctx.save();
  // Posts and roof.
  ctx.fillStyle = '#5a3d27';
  ctx.fillRect(x - 58, y - 92, 8, 70);
  ctx.fillRect(x + 50, y - 92, 8, 70);
  ctx.fillStyle = '#7b3b2e';
  ctx.beginPath();
  ctx.moveTo(x - 72, y - 86);
  ctx.lineTo(x, y - 122);
  ctx.lineTo(x + 72, y - 86);
  ctx.closePath();
  ctx.fill();
  // Glow from inside.
  if (lit) glow(ctx, x, y - 30, 90, GOLD, 0.35 + Math.sin(t * 2) * 0.08);
  // Stone body.
  ctx.fillStyle = '#4d4668';
  ctx.beginPath();
  ctx.roundRect(x - 60, y - 26, 120, 64, 6);
  ctx.fill();
  ctx.strokeStyle = '#2c2839';
  ctx.lineWidth = 2;
  for (let r = 0; r < 3; r++) {
    const yy = y - 26 + r * 21;
    ctx.beginPath();
    ctx.moveTo(x - 60, yy);
    ctx.lineTo(x + 60, yy);
    ctx.stroke();
    for (let c = 0; c < 4; c++) {
      const xx = x - 60 + c * 32 + (r % 2 ? 16 : 0);
      if (xx <= x - 58 || xx >= x + 58) continue;
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, yy + 21);
      ctx.stroke();
    }
  }
  // Rim and the dark (or glowing) water.
  ctx.fillStyle = '#5b547a';
  ctx.beginPath();
  ctx.ellipse(x, y - 26, 64, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lit ? '#e2b650' : '#0d0b13';
  ctx.beginPath();
  ctx.ellipse(x, y - 26, 52, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  if (lit) rising(ctx, x, y - 30, 40, t);
  ctx.restore();
}

function bubble(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  tailX: number,
  tailY: number,
  text: string,
) {
  ctx.save();
  ctx.fillStyle = C.text;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 10, y + h / 2 - 2);
  ctx.lineTo(tailX, tailY);
  ctx.lineTo(x + 6, y + h / 2 - 2);
  ctx.fill();
  ctx.fillStyle = C.bg;
  ctx.font = `bold ${text.length > 3 ? 15 : 20}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - 1);
  ctx.restore();
}

/** Crowned die: the Queen. */
function queenDie(ctx: Ctx, x: number, y: number, size: number, yaw: number, alpha = 1) {
  cube(ctx, x, y, size, 5, yaw, alpha);
  ctx.save();
  ctx.globalAlpha *= alpha;
  drawCrown(ctx, x, y - size * 0.95, size * 0.9);
  ctx.restore();
}

function goatDie(ctx: Ctx, x: number, y: number, size: number, yaw: number, alpha: number) {
  cube(ctx, x, y, size, 11, yaw, alpha);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = '#d8cfb8';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * size * 0.25, y - size * 0.6);
    ctx.quadraticCurveTo(x + s * size * 0.8, y - size * 1.1, x + s * size * 0.5, y - size * 1.3);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws a page's illustration centred at (cx, cy), roughly 300 x 220.
 * `t` is seconds since the page opened; `still` turns motion off.
 */
export function drawStoryArt(
  ctx: Ctx,
  rules: Rules,
  page: StoryPage,
  cx: number,
  cy: number,
  t: number,
  still: boolean,
): void {
  const tt = still ? 0 : t;
  const sway = (k: number, amp = 8) => (still ? 0 : Math.sin(tt * 0.8 + k) * amp);
  ctx.save();
  switch (page.art) {
    case 'queen': {
      glow(ctx, cx, cy - 20, 120, GOLD, 0.12);
      throne(ctx, cx, cy + 30);
      drawCrown(ctx, cx, cy - 40 + sway(0, 4), 40);
      const marks = ['?', '!', '?', '§', '?', '…'];
      marks.forEach((m, i) => {
        const a = (i / marks.length) * Math.PI * 2 + tt * 0.25;
        scroll(ctx, cx + Math.cos(a) * 125, cy + Math.sin(a) * 80 + 5, Math.sin(a + tt) * 0.35, m);
      });
      break;
    }
    case 'well':
      well(ctx, cx, cy + 50, tt);
      break;
    case 'dice': {
      const spots: Array<[number, number, number, number]> = [
        [-110, -50, 22, 3],
        [-40, -72, 18, 8],
        [60, -60, 20, 14],
        [120, -20, 18, 19],
        [-125, 30, 20, 21],
        [-55, 45, 24, 6],
        [120, 70, 22, 17],
      ];
      spots.forEach(([dx, dy, s, o], i) =>
        cube(ctx, cx + dx, cy + dy, s, o, -38 + sway(i, 18), 0.55),
      );
      queenDie(ctx, cx + 20, cy + 10, 30, -30 + sway(2, 10), 0.9);
      goatDie(ctx, cx + 50, cy + 75, 17, -45 + sway(5, 14), 0.6);
      break;
    }
    case 'you': {
      [
        [-120, -40, 16, 7],
        [120, -50, 16, 13],
        [-110, 70, 18, 20],
        [115, 60, 17, 4],
      ].forEach(([dx, dy, s, o], i) =>
        cube(ctx, cx + dx!, cy + dy!, s!, o!, -40 + sway(i, 20), 0.3),
      );
      glow(ctx, cx, cy + 10, 95, GOLD, 0.3);
      cube(ctx, cx - 10, cy + 20, 44, 0, -38 + sway(0, 6));
      bubble(ctx, cx + 78, cy - 70, 70, 36, cx + 40, cy - 30, '…');
      break;
    }
    case 'chapter':
      chapterArt(ctx, rules, page.chapter ?? 0, cx, cy, tt, sway);
      break;
    case 'bottom': {
      const g = ctx.createRadialGradient(cx, cy + 20, 10, cx, cy + 20, 150);
      g.addColorStop(0, '#2c2839');
      g.addColorStop(1, C.bg);
      ctx.fillStyle = g;
      ctx.fillRect(cx - 160, cy - 110, 320, 230);
      ctx.strokeStyle = 'rgba(159,224,255,0.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const k = (tt * 0.3 + i / 3) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 62, 30 + k * 110, 6 + k * 18, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      queenDie(ctx, cx, cy + 30, 22, -30, 0.85);
      break;
    }
    case 'sentence':
      cube(ctx, cx - 75, cy + 30, 36, 0, -30);
      queenDie(ctx, cx + 80, cy + 45, 22, -50, 0.85);
      bubble(ctx, cx, cy - 70, 190, 40, cx - 55, cy - 20, 'Just the next move.');
      break;
    case 'awaken': {
      glow(ctx, cx, cy + 20, 150, GOLD, 0.18);
      const spots: Array<[number, number, number, number]> = [
        [-115, -40, 20, 3],
        [-45, -65, 18, 8],
        [55, -55, 20, 14],
        [120, -5, 20, 19],
        [-120, 55, 22, 21],
        [110, 75, 20, 6],
      ];
      spots.forEach(([dx, dy, s, o], i) => {
        const hop = still ? 0 : Math.max(0, Math.sin(tt * 3 + i * 1.3)) * 8;
        cube(ctx, cx + dx, cy + dy - hop, s, o, -38 + sway(i, 25), 0.9);
      });
      queenDie(ctx, cx, cy + 35, 28, -30 + sway(1, 12), 1);
      rising(ctx, cx, cy + 60, 120, tt, 10);
      break;
    }
    case 'depths': {
      // Stairs going down into the dark.
      for (let i = 0; i < 6; i++) {
        const w = 220 - i * 30;
        ctx.fillStyle = `rgba(77,70,104,${0.9 - i * 0.14})`;
        ctx.fillRect(cx - w / 2, cy - 60 + i * 26, w, 14);
      }
      // Eyes in the dark: dice that like it this way.
      for (const [dx, dy, k] of [
        [-70, 70, 0],
        [60, 85, 1.7],
        [0, 100, 3.1],
      ] as const) {
        const blink = still ? 1 : Math.sin(tt * 1.3 + k) > 0.92 ? 0.2 : 1;
        ctx.fillStyle = C.gold;
        for (const s of [-5, 5]) {
          ctx.beginPath();
          ctx.ellipse(cx + dx + s, cy + dy, 2.5, 2.5 * blink, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
  }
  ctx.restore();
}

function chapterArt(
  ctx: Ctx,
  rules: Rules,
  chapter: number,
  cx: number,
  cy: number,
  t: number,
  sway: (k: number, amp?: number) => number,
): void {
  const enemy = (kind: string, x: number, y: number, scale: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawEnemy(
      ctx,
      rules.enemies.get(kind),
      { id: 0, kind, x: 0, y: 0, hp: 1, data: {}, effects: [] },
      0,
      0,
      { lookX: 0, lookY: 1, flash: 0, t },
      false,
    );
    ctx.restore();
  };
  switch (chapter) {
    case 0: {
      // Your six tools around you.
      glow(ctx, cx, cy, 110, GOLD, 0.2);
      LOADOUT.forEach((f, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2 + t * 0.2;
        drawFace(ctx, f, cx + Math.cos(a) * 95, cy + Math.sin(a) * 72, 30);
      });
      cube(ctx, cx, cy - 6, 34, 0, -38 + sway(0, 10));
      break;
    }
    case 1: {
      const ice = rules.tiles.get('ice');
      for (let i = 0; i < 5; i++) drawTile(ctx, ice, cx - 125 + i * 50, cy + 30, 50, i, 0, t);
      const slide = (t * 0.35) % 1;
      cube(ctx, cx - 100 + slide * 200, cy + 34, 22, 0, -38);
      ctx.strokeStyle = 'rgba(159,224,255,0.6)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (const dy of [-10, 5, 20]) {
        ctx.beginPath();
        ctx.moveTo(cx - 140 + slide * 200, cy + dy);
        ctx.lineTo(cx - 125 + slide * 200 - 10, cy + dy);
        ctx.stroke();
      }
      break;
    }
    case 2:
      glow(ctx, cx, cy + 10, 110, GOLD, 0.15);
      for (const [dx, dy] of [
        [-95, 60],
        [95, 55],
        [-70, -50],
        [85, -60],
      ] as const)
        drawFace(ctx, 'Coin', cx + dx, cy + dy + sway(dx, 4), 26);
      enemy('golem', cx, cy + 10, 3);
      break;
    case 3:
      enemy('archer', cx, cy + 10, 3);
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 3;
      for (const dy of [-40, 0, 40]) {
        const k = (t * 0.8 + dy / 80 + 1) % 1;
        const x = cx + 60 + k * 90;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.moveTo(x, cy + dy);
        ctx.lineTo(x + 26, cy + dy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 26, cy + dy);
        ctx.lineTo(x + 19, cy + dy - 5);
        ctx.moveTo(x + 26, cy + dy);
        ctx.lineTo(x + 19, cy + dy + 5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    case 4:
      glow(ctx, cx, cy, 120, FROST, 0.35);
      drawFace(ctx, 'Freeze', cx, cy, 90);
      rising(ctx, cx, cy + 70, 110, t, 8, C.poolLight);
      break;
    default:
      throne(ctx, cx, cy - 10);
      glow(ctx, cx, cy + 70, 80, GOLD, 0.35 + Math.sin(t * 2) * 0.1);
      rising(ctx, cx, cy + 80, 60, t, 6);
      break;
  }
}
