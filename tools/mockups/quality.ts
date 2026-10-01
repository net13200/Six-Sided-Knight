/**
 * Mockup of a desktop-first look (not part of the game): the real board,
 * bigger, in a 16:9 layout with icon controls, visual hints instead of text,
 * and more "juice". Drawn with the game's own renderer.
 */
import { defaultRules } from '../../src/content/register';
import { createState, parseTextLevel, type Dir } from '../../src/engine';
import { drawBoard } from '../../src/game/view/board';
import { drawFace } from '../../src/game/view/art';
import { Fx } from '../../src/game/view/fx';
import { predictOutcome } from '../../src/game/view/outcome';
import lvl10 from '../../src/levels/data/c1-10.txt?raw';
import lvl1 from '../../src/levels/data/c1-01.txt?raw';

const W = 1216;
const H = 684;
const S = 1.62; // board scale: 360 logical px tall -> ~583
const rules = defaultRules();

type Ctx = CanvasRenderingContext2D;

function backdrop(ctx: Ctx, hue: 'dungeon' | 'meadow'): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (hue === 'dungeon') {
    g.addColorStop(0, '#1d1830');
    g.addColorStop(1, '#0d0b14');
  } else {
    g.addColorStop(0, '#203629');
    g.addColorStop(1, '#0f1a14');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // bricks
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#ffffff';
  for (let y = 0; y < H; y += 34) {
    for (let x = (y / 34) % 2 ? -36 : 0; x < W; x += 72) ctx.fillRect(x + 2, y + 2, 68, 30);
  }
  ctx.globalAlpha = 1;
  // torches
  for (const tx of [150, W - 150]) {
    const tg = ctx.createRadialGradient(tx, 210, 4, tx, 210, 260);
    tg.addColorStop(0, 'rgba(255,170,70,0.35)');
    tg.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, H);
  }
}

function vignette(ctx: Ctx): void {
  const v = ctx.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 760);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

/** The board, scaled up and centred, with a soft shadow and frame. */
function board(ctx: Ctx, text: string, draw?: (ctx: Ctx) => void): void {
  const level = parseTextLevel(text);
  const state = createState(rules, level);
  const fx = new Fx();
  fx.time = 0.4;
  const ox = W / 2 - 170 * S;
  const oy = H / 2 + 22 - 230 * S;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#0d0b14';
  ctx.beginPath();
  ctx.roundRect(ox + 10 * S - 6, oy + 50 * S - 6, 320 * S + 12, 360 * S + 12, 18);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(S, S);
  const outcomes = (['N', 'E', 'S', 'W'] as Dir[]).map(
    (d) => [d, predictOutcome(rules, state, d)] as const,
  );
  drawBoard(ctx, rules, state, fx.compute(), fx, outcomes);
  draw?.(ctx);
  ctx.restore();
}

function pill(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(20,17,30,0.82)';
  ctx.strokeStyle = 'rgba(255,215,94,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
}

function star(ctx: Ctx, cx: number, cy: number, r: number, on: boolean): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = on ? '#ffd75e' : 'rgba(255,255,255,0.15)';
  ctx.fill();
  if (on) {
    ctx.strokeStyle = '#a8761a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** Top bar: level badge, star meter, hearts. Few words. */
function topBar(ctx: Ctx, n: number, name: string, moves: number, par: number, hp: number): void {
  pill(ctx, 24, 20, 300, 52);
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath();
  ctx.roundRect(32, 28, 52, 36, 18);
  ctx.fill();
  ctx.fillStyle = '#231d2b';
  ctx.font = '900 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 58, 47);
  ctx.fillStyle = '#f3ead2';
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(name, 98, 47);
  // star meter: moves vs par
  pill(ctx, W / 2 - 150, 20, 300, 52);
  for (let k = 0; k < 3; k++) star(ctx, W / 2 - 120 + k * 30, 46, 12, true);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - 36, 40, 130, 12, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath();
  ctx.roundRect(W / 2 - 36, 40, Math.max(12, 130 * (moves / par)), 12, 6);
  ctx.fill();
  ctx.fillStyle = '#f3ead2';
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${moves}/${par}`, W / 2 + 140, 47);
  pill(ctx, W - 180, 20, 156, 52);
  for (let k = 0; k < 3; k++) {
    ctx.globalAlpha = k < hp ? 1 : 0.25;
    drawFace(ctx, 'Heart', W - 146 + k * 44, 46, 30);
  }
  ctx.globalAlpha = 1;
}

const ICON: Record<string, string> = {
  undo: 'M9 3L4 8l5 5M4 8h10a6 6 0 010 12h-2',
  retry: 'M20 12a8 8 0 11-2.3-5.6M20 4v5h-5',
  hint: 'M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0012 3z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11',
};

/** Round icon buttons down the right side: no labels needed. */
function sideButtons(ctx: Ctx, glowHint = false): void {
  const names = ['undo', 'retry', 'hint', 'menu', 'sound'];
  names.forEach((n, i) => {
    const cx = W - 70;
    const cy = 170 + i * 92;
    ctx.save();
    if (glowHint && n === 'hint') {
      ctx.shadowColor = 'rgba(255,215,94,0.9)';
      ctx.shadowBlur = 24;
    }
    ctx.fillStyle = n === 'hint' ? '#3b3160' : 'rgba(34,31,47,0.92)';
    ctx.strokeStyle = n === 'hint' ? '#ffd75e' : '#4d4568';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(cx - 18, cy - 18);
    ctx.scale(1.5, 1.5);
    ctx.strokeStyle = n === 'hint' ? '#ffd75e' : '#ece6d6';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(ICON[n]!));
    ctx.restore();
  });
}

/** The die's next rolls, as pictures: which face hits on each side. */
function rollWheel(ctx: Ctx, faces: Record<Dir, string>): void {
  const cx = 150;
  const cy = 400;
  ctx.fillStyle = 'rgba(20,17,30,0.75)';
  ctx.beginPath();
  ctx.arc(cx, cy, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,94,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const at: Record<Dir, [number, number]> = { N: [0, -72], E: [72, 0], S: [0, 72], W: [-72, 0] };
  for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
    const [dx, dy] = at[d];
    ctx.fillStyle = '#2e2940';
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 30, 0, Math.PI * 2);
    ctx.fill();
    drawFace(ctx, faces[d], cx + dx, cy + dy, 40);
    // arrow from centre
    ctx.save();
    ctx.translate(cx + dx * 0.45, cy + dy * 0.45);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = 'rgba(255,215,94,0.8)';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-6, 8);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ece6d6';
  ctx.beginPath();
  ctx.roundRect(cx - 18, cy - 18, 36, 36, 9);
  ctx.fill();
  ctx.fillStyle = '#231d2b';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
}

function burst(ctx: Ctx, x: number, y: number, n: number, r: number, colors: string[]): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.3;
    const d = r * (0.45 + ((i * 37) % 10) / 14);
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.save();
    ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d);
    ctx.rotate(a);
    ctx.fillRect(-3, -1.5, 7, 3);
    ctx.restore();
  }
}

function floater(ctx: Ctx, text: string, x: number, y: number, size: number, color: string): void {
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = size / 5;
  ctx.strokeStyle = '#231d2b';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// ---------- A: mid-level, the Bomb lands ----------
{
  const ctx = (document.getElementById('a') as HTMLCanvasElement).getContext('2d')!;
  backdrop(ctx, 'dungeon');
  board(ctx, lvl10, (c) => {
    // the blast on the middle skeleton (tile 3,6), splash on its neighbours
    const bx = 10 + 3 * 40 + 20;
    const by = 50 + 6 * 40 + 20;
    const glow = c.createRadialGradient(bx, by, 2, bx, by, 70);
    glow.addColorStop(0, 'rgba(255,240,180,0.95)');
    glow.addColorStop(0.35, 'rgba(255,150,60,0.6)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = glow;
    c.fillRect(bx - 80, by - 80, 160, 160);
    burst(c, bx, by, 26, 46, ['#ffd75e', '#ff9d3a', '#fff3c4', '#e85d4a']);
    for (const sx of [-40, 40]) burst(c, bx + sx, by, 10, 20, ['#ffd75e', '#ff9d3a']);
    floater(c, '-2', bx, by - 34, 20, '#ffd75e');
    floater(c, '-1', bx - 40, by - 24, 15, '#ff9d3a');
    floater(c, '-1', bx + 40, by - 24, 15, '#ff9d3a');
    // light from the blast over the board
    c.globalCompositeOperation = 'lighter';
    const wash = c.createRadialGradient(bx, by, 10, bx, by, 160);
    wash.addColorStop(0, 'rgba(255,140,60,0.25)');
    wash.addColorStop(1, 'rgba(255,140,60,0)');
    c.fillStyle = wash;
    c.fillRect(0, 0, 400, 500);
    c.globalCompositeOperation = 'source-over';
  });
  vignette(ctx);
  topBar(ctx, 10, 'Crowd Control', 3, 8, 3);
  rollWheel(ctx, { N: 'Bomb', E: 'Sword', S: 'Heart', W: 'Shield' });
  sideButtons(ctx);
  // combo callout
  floater(ctx, 'TRIPLE!', W / 2 + 240, 300, 40, '#ffd75e');
}

// ---------- B: the first seconds of level 1, shown not told ----------
{
  const ctx = (document.getElementById('b') as HTMLCanvasElement).getContext('2d')!;
  backdrop(ctx, 'meadow');
  board(ctx, lvl1, (c) => {
    // the way to the stairs as a dotted trail
    const pts = [
      [2, 3],
      [3, 3],
      [4, 3],
      [5, 3],
      [5, 4],
      [5, 5],
    ];
    c.setLineDash([2, 7]);
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,215,94,0.9)';
    c.lineWidth = 4;
    c.beginPath();
    for (const [x, y] of pts) c.lineTo(10 + x! * 40 + 20, 50 + y! * 40 + 20);
    c.stroke();
    c.setLineDash([]);
    // the stairs pulse
    const sx = 10 + 5 * 40 + 20;
    const sy = 50 + 5 * 40 + 20;
    for (const r of [26, 34]) {
      c.strokeStyle = `rgba(255,215,94,${r === 26 ? 0.9 : 0.4})`;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(sx, sy, r, 0, Math.PI * 2);
      c.stroke();
    }
    // a hand swiping right from the die
    const hx = 10 + 3 * 40 + 14;
    const hy = 50 + 3 * 40 + 52;
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.beginPath();
    c.ellipse(hx, hy, 9, 12, -0.4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.roundRect(hx - 3, hy - 26, 7, 20, 3);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(hx + 12, hy - 18);
    c.lineTo(hx + 40, hy - 18);
    c.stroke();
    c.beginPath();
    c.moveTo(hx + 40, hy - 24);
    c.lineTo(hx + 47, hy - 18);
    c.lineTo(hx + 40, hy - 12);
    c.fill();
  });
  vignette(ctx);
  topBar(ctx, 1, 'First Roll', 0, 5, 3);
  // keyboard: keycaps, not sentences
  const kx = 150;
  const ky = 420;
  ctx.fillStyle = 'rgba(20,17,30,0.75)';
  ctx.beginPath();
  ctx.roundRect(kx - 100, ky - 90, 200, 170, 20);
  ctx.fill();
  const cap = (x: number, y: number, s: string, lit = false) => {
    ctx.fillStyle = lit ? '#ffd75e' : '#2e2940';
    ctx.strokeStyle = '#4d4568';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 26, y - 24, 52, 48, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = lit ? '#231d2b' : '#ece6d6';
    ctx.font = '900 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y + 1);
  };
  cap(kx, ky - 40, '↑');
  cap(kx - 58, ky + 14, '←');
  cap(kx, ky + 14, '↓');
  cap(kx + 58, ky + 14, '→', true);
  sideButtons(ctx, false);
}
(window as unknown as { mockReady: boolean }).mockReady = true;
