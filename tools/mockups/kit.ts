/**
 * Shared drawing for the design mockups (not part of the game): backdrops,
 * pills, stars, round icon buttons, effects, and the real board renderer
 * placed anywhere at any scale.
 */
import { defaultRules } from '../../src/content/register';
import { createState, parseTextLevel, type Dir, type GameState } from '../../src/engine';
import { drawBoard } from '../../src/game/view/board';
import { drawFace } from '../../src/game/view/art';
import { Fx } from '../../src/game/view/fx';
import { predictOutcome } from '../../src/game/view/outcome';

export type Ctx = CanvasRenderingContext2D;
export const rules = defaultRules();

export const GOLD = '#ffd75e';
export const INK = '#231d2b';
export const CREAM = '#f3ead2';
export const NOTE = '#5fd3e8';

export function canvas(id: string): { ctx: Ctx; w: number; h: number } {
  const c = document.getElementById(id) as HTMLCanvasElement;
  return { ctx: c.getContext('2d')!, w: c.width, h: c.height };
}

export function backdrop(ctx: Ctx, w: number, h: number, hue: 'dungeon' | 'meadow'): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hue === 'dungeon' ? '#1d1830' : '#203629');
  g.addColorStop(1, hue === 'dungeon' ? '#0d0b14' : '#0f1a14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#ffffff';
  for (let y = 0; y < h; y += 34) {
    for (let x = (y / 34) % 2 ? -36 : 0; x < w; x += 72) ctx.fillRect(x + 2, y + 2, 68, 30);
  }
  ctx.globalAlpha = 1;
  for (const tx of [w * 0.12, w * 0.88]) {
    const tg = ctx.createRadialGradient(tx, h * 0.3, 4, tx, h * 0.3, Math.max(w, h) * 0.25);
    tg.addColorStop(0, 'rgba(255,170,70,0.32)');
    tg.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, w, h);
  }
}

export function vignette(ctx: Ctx, w: number, h: number, strength = 0.6): void {
  const v = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.65,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

export function pill(ctx: Ctx, x: number, y: number, w: number, h: number, r = h / 2): void {
  ctx.fillStyle = 'rgba(20,17,30,0.86)';
  ctx.strokeStyle = 'rgba(255,215,94,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

export function star(ctx: Ctx, cx: number, cy: number, r: number, on: boolean): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = on ? GOLD : 'rgba(255,255,255,0.13)';
  ctx.fill();
  ctx.strokeStyle = on ? '#a8761a' : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(2, r / 9);
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export const ICON: Record<string, string> = {
  undo: 'M9 3L4 8l5 5M4 8h10a6 6 0 010 12h-2',
  retry: 'M20 12a8 8 0 11-2.3-5.6M20 4v5h-5',
  hint: 'M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0012 3z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11',
  play: 'M8 5l11 7-11 7z',
  next: 'M5 12h13M13 6l6 6-6 6',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  anvil: 'M4 8h13a4 4 0 01-4 4h-1v3h3v3H7v-3h3v-3H8a4 4 0 01-4-4zM17 8l3-2',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  trophy: 'M7 4h10v5a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4M12 14v4M8 20h8',
};

export function iconPath(
  ctx: Ctx,
  name: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(ICON[name]!));
  ctx.restore();
}

export function roundButton(
  ctx: Ctx,
  name: string,
  cx: number,
  cy: number,
  r: number,
  style: 'plain' | 'accent' | 'gold' = 'plain',
): void {
  ctx.save();
  if (style !== 'plain') {
    ctx.shadowColor = 'rgba(255,215,94,0.55)';
    ctx.shadowBlur = style === 'gold' ? 26 : 14;
  }
  ctx.fillStyle = style === 'gold' ? GOLD : style === 'accent' ? '#3b3160' : 'rgba(34,31,47,0.94)';
  ctx.strokeStyle = style === 'plain' ? '#4d4568' : style === 'gold' ? '#a8761a' : GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // a lip under the button: it looks pressable
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy + 1, r - 1, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  iconPath(
    ctx,
    name,
    cx,
    cy,
    r * 1.05,
    style === 'gold' ? INK : style === 'accent' ? GOLD : '#ece6d6',
  );
}

/** A big pill button with an icon and (at most) one word. */
export function bigButton(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  icon: string | null,
  gold = true,
): void {
  ctx.save();
  ctx.shadowColor = gold ? 'rgba(255,215,94,0.5)' : 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = gold ? 28 : 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = gold ? '#a8761a' : '#16131f';
  ctx.beginPath();
  ctx.roundRect(x, y + 6, w, h, h / 2);
  ctx.fill();
  ctx.restore();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, gold ? '#ffe48f' : '#3a3450');
  g.addColorStop(1, gold ? '#f2c443' : '#2a2539');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = gold ? '#fff3c4' : '#5a5276';
  ctx.lineWidth = 2;
  ctx.stroke();
  const color = gold ? INK : '#ece6d6';
  ctx.font = `900 ${Math.round(h * 0.42)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(label).width;
  const iw = icon ? h * 0.5 : 0;
  const gap = icon && label ? 12 : 0;
  const start = x + w / 2 - (tw + iw + gap) / 2;
  if (icon) {
    if (icon === 'play') {
      ctx.fillStyle = color;
      ctx.save();
      ctx.translate(start, y + h / 2 - iw / 2);
      ctx.scale(iw / 24, iw / 24);
      ctx.fill(new Path2D(ICON.play!));
      ctx.restore();
    } else iconPath(ctx, icon, start + iw / 2, y + h / 2, iw, color);
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(label, start + iw + gap, y + h / 2 + 1);
}

export function burst(
  ctx: Ctx,
  x: number,
  y: number,
  n: number,
  r: number,
  colors: string[],
  seed = 0,
): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + ((i + seed) % 3) * 0.3;
    const d = r * (0.45 + (((i + seed) * 37) % 10) / 14);
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.save();
    ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d);
    ctx.rotate(a);
    ctx.fillRect(-3, -1.5, 7, 3);
    ctx.restore();
  }
}

export function confetti(ctx: Ctx, w: number, h: number, n: number): void {
  const cols = [GOLD, '#ff7a8a', '#6ee07a', '#8fc6ff', '#ff9d3a', '#fff3c4'];
  for (let i = 0; i < n; i++) {
    const x = (i * 197.3) % w;
    const y = (i * 91.7 + (i % 7) * 40) % (h * 0.8);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(i * 0.7);
    ctx.fillStyle = cols[i % cols.length]!;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-5, -2.5, 10, 5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function glow(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function floater(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = size / 5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** A design note (cyan): explains the mockup, is not part of the UI. */
export function note(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = '700 13px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 18;
  const left = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  ctx.fillStyle = 'rgba(8,40,48,0.92)';
  ctx.strokeStyle = NOTE;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.roundRect(left, y - 12, w, 24, 6);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = NOTE;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + 9, y + 1);
}

/** A board-space tile centre (the game's 40 px tiles, board origin 10,50). */
export const tile = (x: number, y: number): [number, number] => [
  10 + x * 40 + 20,
  50 + y * 40 + 20,
];

export interface BoardOpts {
  /** Board-space point placed at (cx, cy); defaults to the board's middle. */
  focus?: [number, number];
  /** Clip to this board-space rectangle [x, y, w, h]. */
  clip?: [number, number, number, number];
  mutate?: (s: GameState) => GameState;
  frame?: boolean;
  draw?: (ctx: Ctx) => void;
}

/** The game's real board renderer, placed at (cx, cy) and scaled. */
export function boardAt(
  ctx: Ctx,
  text: string,
  cx: number,
  cy: number,
  scale: number,
  o: BoardOpts = {},
): void {
  let state = createState(rules, parseTextLevel(text));
  if (o.mutate) state = o.mutate(state);
  const fx = new Fx();
  fx.time = 0.4;
  const [fx0, fy0] = o.focus ?? [170, 230];
  const ox = cx - fx0 * scale;
  const oy = cy - fy0 * scale;
  const [bx, by, bw, bh] = o.clip ?? [10, 50, 320, 360];
  if (o.frame !== false) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#0d0b14';
    ctx.beginPath();
    ctx.roundRect(ox + bx * scale - 6, oy + by * scale - 6, bw * scale + 12, bh * scale + 12, 18);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ox + bx * scale, oy + by * scale, bw * scale, bh * scale, 12);
  ctx.clip();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  const outcomes = (['N', 'E', 'S', 'W'] as Dir[]).map(
    (d) => [d, predictOutcome(rules, state, d)] as const,
  );
  drawBoard(ctx, rules, state, fx.compute(), fx, outcomes);
  o.draw?.(ctx);
  ctx.restore();
}

/** The roll wheel: which face acts on each side, as pictures. */
export function rollWheel(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  faces: Record<Dir, string>,
  lit?: Dir,
): void {
  ctx.fillStyle = 'rgba(20,17,30,0.8)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,94,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const k = r * 0.6;
  const at: Record<Dir, [number, number]> = { N: [0, -k], E: [k, 0], S: [0, k], W: [-k, 0] };
  for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
    const [dx, dy] = at[d];
    ctx.fillStyle = d === lit ? '#4a3d78' : '#2e2940';
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
    if (d === lit) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    drawFace(ctx, faces[d], cx + dx, cy + dy, r * 0.33);
    ctx.save();
    ctx.translate(cx + dx * 0.45, cy + dy * 0.45);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = 'rgba(255,215,94,0.8)';
    ctx.beginPath();
    ctx.moveTo(r * 0.07, 0);
    ctx.lineTo(-r * 0.05, -r * 0.07);
    ctx.lineTo(-r * 0.05, r * 0.07);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ece6d6';
  ctx.beginPath();
  ctx.roundRect(cx - r * 0.15, cy - r * 0.15, r * 0.3, r * 0.3, r * 0.08);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

/** Level badge + name, star meter, hearts. */
export function hudLevel(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  n: number,
  name: string,
  size = 1,
): void {
  const h = 52 * size;
  pill(ctx, x, y, w, h);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.roundRect(x + 8 * size, y + 8 * size, 52 * size, 36 * size, 18 * size);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `900 ${22 * size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x + 34 * size, y + h / 2 + 1);
  ctx.fillStyle = CREAM;
  ctx.font = `800 ${22 * size}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(name, x + 74 * size, y + h / 2 + 1);
}

export function hudMeter(
  ctx: Ctx,
  cx: number,
  y: number,
  moves: number,
  par: number,
  size = 1,
): void {
  const w = 300 * size;
  const h = 52 * size;
  pill(ctx, cx - w / 2, y, w, h);
  for (let k = 0; k < 3; k++)
    star(ctx, cx - w / 2 + 30 * size + k * 30 * size, y + h / 2, 12 * size, true);
  const bx = cx - w / 2 + 114 * size;
  const bw = 130 * size;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(bx, y + h / 2 - 6 * size, bw, 12 * size, 6 * size);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.roundRect(
    bx,
    y + h / 2 - 6 * size,
    Math.max(12 * size, bw * (moves / par)),
    12 * size,
    6 * size,
  );
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.font = `800 ${15 * size}px system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${moves}/${par}`, cx + w / 2 - 14 * size, y + h / 2 + 1);
}

export function hudHearts(ctx: Ctx, right: number, y: number, hp: number, size = 1): void {
  const w = 156 * size;
  pill(ctx, right - w, y, w, 52 * size);
  for (let k = 0; k < 3; k++) {
    ctx.globalAlpha = k < hp ? 1 : 0.22;
    drawFace(ctx, 'Heart', right - w + 34 * size + k * 44 * size, y + 26 * size, 30 * size);
  }
  ctx.globalAlpha = 1;
}
