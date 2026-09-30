/**
 * The backdrop: fills the window around the game (a 16:9 desktop window, a
 * phone held sideways, a very tall phone) so there are never empty bars.
 * A dungeon wall with torches (or the forest, in the bonus chapter), and side
 * panels the current scene may fill, drawn at the same scale as the game.
 */
import type { Stage } from './stage';
import { LOGICAL_H } from './stage';

type Ctx = CanvasRenderingContext2D;

export type BackdropTheme = 'dungeon' | 'forest';

/** A scene's side panels: `side` is left or right; w and h are logical units. */
export type SideRenderer = (ctx: Ctx, side: 'left' | 'right', w: number, h: number) => void;

/** Side panels are drawn only when there is at least this much room (logical units). */
export const MIN_SIDE = 150;

let cache: { key: string; canvas: HTMLCanvasElement } | null = null;

/** The static part (wall or trees), drawn once per size and theme. */
function scenery(stage: Stage, theme: BackdropTheme): HTMLCanvasElement {
  const key = `${theme}:${stage.backdropVersion}`;
  if (cache?.key === key) return cache.canvas;
  const c = document.createElement('canvas');
  c.width = stage.backdrop.width;
  c.height = stage.backdrop.height;
  const ctx = c.getContext('2d')!;
  const k = c.width / Math.max(1, stage.view.w);
  ctx.scale(k, k);
  const { w, h } = stage.view;
  const unit = stage.scale; // bricks and trees at the game's scale
  if (theme === 'dungeon') {
    ctx.fillStyle = '#17141f';
    ctx.fillRect(0, 0, w, h);
    const bw = 44 * unit;
    const bh = 22 * unit;
    for (let row = 0; row * bh < h; row++) {
      for (let col = -1; col * bw < w; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        const y = row * bh;
        const shade = 30 + ((row * 7 + col * 13) % 5) * 3;
        ctx.fillStyle = `rgb(${shade},${shade - 4},${shade + 12})`;
        ctx.fillRect(x + 1.5 * unit, y + 1.5 * unit, bw - 3 * unit, bh - 3 * unit);
      }
    }
  } else {
    ctx.fillStyle = '#10201a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = ((i * 97) % 100) / 100;
      const y = ((i * 57) % 100) / 100;
      const s = (18 + ((i * 13) % 20)) * unit;
      pine(ctx, x * w, y * h + s, s, i % 3 === 0 ? '#1f4a2b' : '#183a23');
    }
  }
  // Darker toward the edges, and a soft shadow around the game.
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const b = stage.box;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 24 * unit;
  ctx.fillStyle = '#14121c';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  cache = { key, canvas: c };
  return c;
}

function pine(ctx: Ctx, x: number, y: number, h: number, color: string): void {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const w = h * (0.22 + i * 0.1);
    const top = y - h + i * h * 0.25;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - w, top + h * 0.45);
    ctx.lineTo(x + w, top + h * 0.45);
    ctx.closePath();
    ctx.fill();
  }
}

/** A wall torch (dungeon), flickering. */
function torch(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const f = 0.85 + 0.15 * Math.sin(t * 9 + x) * Math.sin(t * 5.3 + y);
  const g = ctx.createRadialGradient(x, y - 6 * s, 0, x, y - 6 * s, 70 * s * f);
  g.addColorStop(0, 'rgba(255,170,70,0.35)');
  g.addColorStop(1, 'rgba(255,170,70,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 80 * s, y - 80 * s, 160 * s, 160 * s);
  ctx.fillStyle = '#5a3b1f';
  ctx.fillRect(x - 3 * s, y, 6 * s, 16 * s);
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.ellipse(x, y - 5 * s, 5 * s * f, 10 * s * f, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff1b0';
  ctx.beginPath();
  ctx.ellipse(x, y - 3 * s, 2.5 * s, 5 * s * f, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draws the backdrop. `sides` fills the room left and right of the game (when
 * there is enough of it); otherwise torches decorate the wall.
 */
export function drawBackdrop(
  stage: Stage,
  theme: BackdropTheme,
  t: number,
  sides?: SideRenderer,
): void {
  const ctx = stage.beginBackdrop();
  ctx.drawImage(scenery(stage, theme), 0, 0, stage.view.w, stage.view.h);
  const b = stage.box;
  const s = stage.scale;
  const sideW = stage.sideRoom / s; // logical units
  if (sideW < 20) return;
  const panels = sides && sideW >= MIN_SIDE;
  if (theme === 'dungeon' && !panels) {
    for (const cx of [b.x / 2, b.x + b.w + b.x / 2]) torch(ctx, cx, b.y + b.h * 0.3, s, t);
  }
  if (!panels) return;
  const w = Math.min(sideW - 24, 260);
  for (const side of ['left', 'right'] as const) {
    ctx.save();
    const x0 = side === 'left' ? b.x - (w + 12) * s : b.x + b.w + 12 * s;
    ctx.translate(x0, b.y);
    ctx.scale(s, s);
    sides(ctx, side, w, LOGICAL_H);
    ctx.restore();
  }
}

/** A side panel's card, with a title; returns the y below the title. */
export function sideCard(ctx: Ctx, w: number, h: number, title: string): number {
  ctx.fillStyle = 'rgba(20,18,28,0.88)';
  ctx.strokeStyle = 'rgba(255,215,94,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd75e';
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 16, 24);
  return 50;
}

/** Key or gesture help: rows of [key, what it does]. */
export function drawControls(
  ctx: Ctx,
  w: number,
  y: number,
  rows: ReadonlyArray<readonly [string, string]>,
): number {
  for (const [key, what] of rows) {
    ctx.font = 'bold 12px system-ui, sans-serif';
    const kw = Math.max(26, ctx.measureText(key).width + 12);
    ctx.fillStyle = '#2e2940';
    ctx.strokeStyle = '#4d4568';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(16, y - 11, kw, 22, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ece6d6';
    ctx.textAlign = 'center';
    ctx.fillText(key, 16 + kw / 2, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#b9b0cc';
    ctx.font = '12px system-ui, sans-serif';
    const end = wrap(ctx, what, 16 + kw + 10, y, w - kw - 42, 15);
    y = Math.max(y + 32, end + 12);
  }
  return y;
}

/** Wraps text into lines no wider than `max`; returns the y after the last line. */
export function wrap(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  max: number,
  lh: number,
): number {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}

/** Whether the player is on a touch screen (show gestures, not keys). */
export function touchFirst(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}
