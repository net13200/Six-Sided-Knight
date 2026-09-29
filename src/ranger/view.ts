/**
 * Drawing the Ranger's world: a forest of triangles, the d8 on the board,
 * its face icons, and a turning octahedron for story pages. Canvas 2D only.
 */
import type { Dir } from '../engine/types';
import {
  SLOT,
  faceAt,
  hidden,
  isUp,
  leading,
  movesFrom,
  neighbor,
  seeThrough,
  tileAt,
  type REnemy,
  type RState,
  type Tile,
} from './rules';

type Ctx = CanvasRenderingContext2D;

// ---------- geometry ----------

/** Triangle side, row height, and the board's top-left corner. */
export const SIDE = 64;
export const ROW = (SIDE * Math.sqrt(3)) / 2;
export const ORIGIN = { x: 10, y: 63 };

export interface Pt {
  x: number;
  y: number;
}

/** The three corners of cell (x, y). */
export function corners(x: number, y: number): [Pt, Pt, Pt] {
  const left = ORIGIN.x + (x * SIDE) / 2;
  const top = ORIGIN.y + y * ROW;
  return isUp(x, y)
    ? [
        { x: left, y: top + ROW },
        { x: left + SIDE, y: top + ROW },
        { x: left + SIDE / 2, y: top },
      ]
    : [
        { x: left, y: top },
        { x: left + SIDE, y: top },
        { x: left + SIDE / 2, y: top + ROW },
      ];
}

export function center(x: number, y: number): Pt {
  const left = ORIGIN.x + (x * SIDE) / 2;
  const top = ORIGIN.y + y * ROW;
  return { x: left + SIDE / 2, y: top + (isUp(x, y) ? (2 * ROW) / 3 : ROW / 3) };
}

/** The cell under a point, or null. */
export function cellAt(px: number, py: number, width: number, height: number): Pt | null {
  const y = Math.floor((py - ORIGIN.y) / ROW);
  if (y < 0 || y >= height) return null;
  for (let x = 0; x < width; x++) {
    const [a, b, c] = corners(x, y);
    if (inside(px, py, a, b, c)) return { x, y };
  }
  return null;
}

function inside(px: number, py: number, a: Pt, b: Pt, c: Pt): boolean {
  const s = (p: Pt, q: Pt) => (px - q.x) * (p.y - q.y) - (p.x - q.x) * (py - q.y);
  const d1 = s(a, b);
  const d2 = s(b, c);
  const d3 = s(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Which move reaches a tapped neighbour, if it is one. */
export function dirTo(from: Pt, to: Pt): Dir | null {
  for (const d of movesFrom(from.x, from.y)) {
    const n = neighbor(from.x, from.y, d)!;
    if (n.x === to.x && n.y === to.y) return d;
  }
  return null;
}

function tri(ctx: Ctx, [a, b, c]: [Pt, Pt, Pt], inset = 0): void {
  const m = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  const k = (p: Pt) => ({ x: p.x + (m.x - p.x) * inset, y: p.y + (m.y - p.y) * inset });
  const [p, q, r] = [k(a), k(b), k(c)];
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.lineTo(r.x, r.y);
  ctx.closePath();
}

// ---------- colours ----------

export const FOREST = {
  bg: '#12201a',
  grassA: '#2f5a37',
  grassB: '#346140',
  line: '#1d3a26',
  tree: '#18331f',
  pine: '#3f7d45',
  water: '#2c6d8f',
  waterHi: '#6fb7d8',
  exit: '#e2b650',
  post: '#8a5a2b',
  spring: '#5fc6c9',
  danger: 'rgba(255,90,70,0.16)',
};

const ROLE: Readonly<Record<string, string>> = {
  Bow: '#f08a7a',
  Knife: '#f2a6a0',
  Trap: '#f0b36a',
  Rope: '#d9b27c',
  Boots: '#7fc9b5',
  Cloak: '#a893e0',
  Herb: '#8fd07a',
  Leaf: '#e6e0c8',
};
export const rangerRole = (face: string): string => ROLE[face] ?? '#d9d2e8';

// ---------- the board ----------

export function drawForest(ctx: Ctx, s: RState, t: number): void {
  const { width, height } = s.level;
  ctx.fillStyle = FOREST.bg;
  ctx.fillRect(0, 0, 340, 480);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) drawTile(ctx, tileAt(s, x, y)!, x, y, t);
  // The stags' rows are dangerous (unless the Cloak hides you).
  if (!hidden(s))
    for (const e of s.enemies) if (e.kind === 'stag' && e.snared === 0) drawLane(ctx, s, e);
}

function drawTile(ctx: Ctx, tile: Tile, x: number, y: number, t: number): void {
  const c = corners(x, y);
  const m = center(x, y);
  tri(ctx, c);
  ctx.fillStyle = (x + y) % 4 < 2 ? FOREST.grassA : FOREST.grassB;
  if (tile === 'water') ctx.fillStyle = FOREST.water;
  if (tile === 'tree') ctx.fillStyle = FOREST.tree;
  ctx.fill();
  ctx.strokeStyle = FOREST.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  switch (tile) {
    case 'tree':
      pine(ctx, m.x, m.y + 4, 13);
      break;
    case 'water': {
      ctx.strokeStyle = FOREST.waterHi;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.5;
      const w = Math.sin(t * 2 + x + y) * 2;
      for (const dy of [-4, 3]) {
        ctx.beginPath();
        ctx.moveTo(m.x - 8, m.y + dy);
        ctx.quadraticCurveTo(m.x - 4, m.y + dy - 3 + w, m.x, m.y + dy);
        ctx.quadraticCurveTo(m.x + 4, m.y + dy + 3 - w, m.x + 8, m.y + dy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'exit': {
      // A glowing gap in the trees.
      const g = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, 20);
      g.addColorStop(0, 'rgba(255,236,160,0.95)');
      g.addColorStop(1, 'rgba(226,182,80,0)');
      tri(ctx, c, 0.12);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = '#5a3b12';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('➜', m.x, m.y + 1);
      break;
    }
    case 'post':
      ctx.fillStyle = FOREST.post;
      ctx.fillRect(m.x - 3, m.y - 12, 6, 20);
      ctx.fillStyle = '#b07a42';
      ctx.fillRect(m.x - 5, m.y - 13, 10, 4);
      break;
    case 'spring': {
      tri(ctx, c, 0.35);
      ctx.fillStyle = FOREST.spring;
      ctx.fill();
      ctx.fillStyle = '#e8ffff';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', m.x, m.y);
      break;
    }
    case 'snare':
      ctx.strokeStyle = '#d9b27c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + 1, 8, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(m.x + 7, m.y - 2);
      ctx.lineTo(m.x + 12, m.y - 8);
      ctx.stroke();
      break;
    default:
      // Tufts of grass.
      ctx.strokeStyle = 'rgba(160,210,130,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.x - 4, m.y + 3);
      ctx.lineTo(m.x - 5, m.y - 1);
      ctx.moveTo(m.x - 2, m.y + 3);
      ctx.lineTo(m.x - 1, m.y - 2);
      ctx.stroke();
  }
}

function pine(ctx: Ctx, x: number, y: number, h: number): void {
  ctx.fillStyle = '#5a3b1f';
  ctx.fillRect(x - 1.5, y, 3, 4);
  ctx.fillStyle = FOREST.pine;
  for (const [dy, w] of [
    [-h, 5],
    [-h * 0.6, 8],
    [-h * 0.2, 10],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy);
    ctx.lineTo(x - w, y + dy + h * 0.55);
    ctx.lineTo(x + w, y + dy + h * 0.55);
    ctx.closePath();
    ctx.fill();
  }
}

function drawLane(ctx: Ctx, s: RState, e: REnemy): void {
  for (const dir of [-1, 1]) {
    for (let x = e.x + dir; ; x += dir) {
      const t = tileAt(s, x, e.y);
      if (!t || !seeThrough(t) || s.enemies.some((o) => o.x === x && o.y === e.y)) break;
      tri(ctx, corners(x, e.y), 0.05);
      ctx.fillStyle = FOREST.danger;
      ctx.fill();
    }
  }
}

// ---------- enemies ----------

export function drawEnemy(ctx: Ctx, e: REnemy, p: Pt, t: number): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  const bob = Math.sin(t * 3 + e.id) * 1;
  if (e.kind === 'wolf') {
    ctx.fillStyle = '#9aa0ab';
    ctx.strokeStyle = '#2b2d33';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Head with two ears and a snout.
    ctx.moveTo(-9, -4 + bob);
    ctx.lineTo(-7, -13 + bob);
    ctx.lineTo(-3, -7 + bob);
    ctx.lineTo(3, -7 + bob);
    ctx.lineTo(7, -13 + bob);
    ctx.lineTo(9, -4 + bob);
    ctx.lineTo(4, 7 + bob);
    ctx.lineTo(-4, 7 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd35e';
    ctx.fillRect(-5, -3 + bob, 2.5, 2);
    ctx.fillRect(2.5, -3 + bob, 2.5, 2);
    ctx.fillStyle = '#2b2d33';
    ctx.fillRect(-1.5, 3 + bob, 3, 2);
  } else {
    // The stag: a proud head and antlers.
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const sx of [-1, 1]) {
      ctx.moveTo(sx * 4, -6);
      ctx.lineTo(sx * 11, -16);
      ctx.moveTo(sx * 8, -11);
      ctx.lineTo(sx * 13, -10);
      ctx.moveTo(sx * 10, -14);
      ctx.lineTo(sx * 8, -20);
    }
    ctx.stroke();
    ctx.fillStyle = '#b07a42';
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(-4, -2, 2, 2);
    ctx.fillRect(2, -2, 2, 2);
  }
  // HP pips.
  for (let i = 0; i < e.hp; i++) {
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(-((e.hp - 1) * 3) + i * 6, 12, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.snared > 0) {
    ctx.strokeStyle = '#d9b27c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 6, 11, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f5e6c8';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(e.snared), 12, -8);
  }
  ctx.restore();
}

// ---------- the die ----------

/**
 * The d8 from above, at `p` on cell (cx, cy): the top face as a triangle
 * pointing where the die can roll, and a badge toward each of the three
 * moves showing the face that leads that way.
 */
export function drawD8(ctx: Ctx, s: RState, p: Pt, cx: number, cy: number, squash = 1): void {
  const lo = s.level.loadout;
  const top = faceAt(lo, s.orient, SLOT.top);
  const dirs = movesFrom(cx, cy);
  const here = center(cx, cy);
  const unit = dirs.map((d) => {
    const n = center(neighbor(cx, cy, d)!.x, neighbor(cx, cy, d)!.y);
    const len = Math.hypot(n.x - here.x, n.y - here.y);
    return { d, x: (n.x - here.x) / len, y: (n.y - here.y) / len };
  });
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(squash, 1 / squash);
  // Shadow and body: a hexagon (the octahedron seen from above).
  const hex = (r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const u = unit[Math.floor(i / 2)]!;
      const a = Math.atan2(u.y, u.x) + (i % 2 ? Math.PI / 3 : 0);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.save();
  ctx.translate(2, 4);
  hex(24);
  ctx.fill();
  ctx.restore();
  hex(24);
  ctx.fillStyle = '#c99a5b';
  ctx.fill();
  ctx.strokeStyle = '#2a1a0c';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Upper faces: shaded wedges between the top face and the rim.
  for (let i = 0; i < 3; i++) {
    const a = unit[i]!;
    const b = unit[(i + 1) % 3]!;
    const mid = Math.atan2(a.y + b.y, a.x + b.x);
    ctx.beginPath();
    ctx.moveTo(a.x * 19, a.y * 19);
    ctx.lineTo(Math.cos(mid) * 24, Math.sin(mid) * 24);
    ctx.lineTo(b.x * 19, b.y * 19);
    ctx.closePath();
    ctx.fillStyle =
      i === 0 ? 'rgba(255,255,255,0.18)' : i === 1 ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.22)';
    ctx.fill();
  }
  // The top face.
  ctx.beginPath();
  unit.forEach((u, i) =>
    i === 0 ? ctx.moveTo(u.x * 19, u.y * 19) : ctx.lineTo(u.x * 19, u.y * 19),
  );
  ctx.closePath();
  ctx.fillStyle = '#fbf3df';
  ctx.fill();
  ctx.strokeStyle = '#2a1a0c';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawRangerFace(ctx, top, 0, 0, 17);
  ctx.restore();
  // Leading faces, on the side of each move.
  for (const u of unit) {
    const f = leading(lo, s.orient, u.d);
    const bx = p.x + u.x * 30;
    const by = p.y + u.y * 30;
    ctx.beginPath();
    ctx.arc(bx, by, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = rangerRole(f);
    ctx.fill();
    ctx.strokeStyle = '#2a1a0c';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawRangerFace(ctx, f, bx, by, 12);
  }
}

// ---------- face icons ----------

/** A face icon centred at (x, y), `size` across. */
export function drawRangerFace(ctx: Ctx, face: string, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 2, size / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (color: string, w = 0.14) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  const fill = (color: string) => {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#2a1a0c';
    ctx.lineWidth = 0.1;
    ctx.stroke();
  };
  switch (face) {
    case 'Bow':
      ctx.beginPath();
      ctx.arc(-0.35, 0, 0.75, -1.2, 1.2);
      stroke('#8a4b1f', 0.18);
      ctx.beginPath();
      ctx.moveTo(-0.08, -0.7);
      ctx.lineTo(-0.08, 0.7);
      stroke('#f3ead2', 0.06);
      ctx.beginPath();
      ctx.moveTo(-0.5, 0);
      ctx.lineTo(0.75, 0);
      stroke('#5a3a1a', 0.1);
      ctx.beginPath();
      ctx.moveTo(0.85, 0);
      ctx.lineTo(0.6, -0.15);
      ctx.lineTo(0.6, 0.15);
      ctx.closePath();
      fill('#c9ced6');
      break;
    case 'Knife':
      ctx.beginPath();
      ctx.moveTo(-0.55, 0.55);
      ctx.lineTo(0.55, -0.55);
      ctx.lineTo(0.62, -0.72);
      ctx.lineTo(0.45, -0.66);
      ctx.lineTo(-0.35, 0.18);
      ctx.closePath();
      fill('#dfe4ea');
      ctx.beginPath();
      ctx.moveTo(-0.45, 0.3);
      ctx.lineTo(-0.75, 0.7);
      stroke('#6b4423', 0.22);
      break;
    case 'Trap':
      ctx.beginPath();
      ctx.ellipse(0, 0.15, 0.6, 0.38, 0, 0, Math.PI * 2);
      stroke('#8a5a2b', 0.16);
      ctx.beginPath();
      ctx.moveTo(0.5, -0.05);
      ctx.quadraticCurveTo(0.7, -0.5, 0.35, -0.75);
      stroke('#8a5a2b', 0.14);
      break;
    case 'Rope':
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = i * 0.45;
        const r = 0.12 + i * 0.016;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      stroke('#a8753f', 0.14);
      break;
    case 'Cloak':
      ctx.beginPath();
      ctx.moveTo(0, -0.8);
      ctx.quadraticCurveTo(0.45, -0.8, 0.45, -0.3);
      ctx.lineTo(0.7, 0.75);
      ctx.lineTo(-0.7, 0.75);
      ctx.lineTo(-0.45, -0.3);
      ctx.quadraticCurveTo(-0.45, -0.8, 0, -0.8);
      ctx.closePath();
      fill('#5b4a9a');
      ctx.beginPath();
      ctx.ellipse(0, -0.28, 0.22, 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1530';
      ctx.fill();
      break;
    case 'Boots':
      ctx.beginPath();
      ctx.moveTo(-0.4, -0.75);
      ctx.lineTo(0.1, -0.75);
      ctx.lineTo(0.1, 0.25);
      ctx.lineTo(0.7, 0.35);
      ctx.lineTo(0.7, 0.7);
      ctx.lineTo(-0.4, 0.7);
      ctx.closePath();
      fill('#7a4e2a');
      ctx.beginPath();
      ctx.moveTo(-0.4, 0.55);
      ctx.lineTo(0.7, 0.55);
      stroke('#3b2410', 0.1);
      break;
    case 'Herb':
      ctx.beginPath();
      ctx.moveTo(0, 0.8);
      ctx.lineTo(0, -0.6);
      stroke('#3e7a2e', 0.1);
      for (const [dy, sx] of [
        [-0.45, 1],
        [-0.1, -1],
        [0.25, 1],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(sx * 0.28, dy, 0.28, 0.14, sx * -0.5, 0, Math.PI * 2);
        fill('#6fbf4f');
      }
      break;
    case 'Leaf':
      ctx.beginPath();
      ctx.moveTo(-0.6, 0.6);
      ctx.quadraticCurveTo(-0.6, -0.5, 0.65, -0.65);
      ctx.quadraticCurveTo(0.5, 0.55, -0.6, 0.6);
      ctx.closePath();
      fill('#9cc47a');
      ctx.beginPath();
      ctx.moveTo(-0.6, 0.6);
      ctx.lineTo(0.35, -0.35);
      stroke('#4f7a3a', 0.07);
      break;
  }
  ctx.restore();
}

// ---------- a turning octahedron (story pages, the chapter entrance) ----------

const OCTA_FACES: Array<[number, number, number]> = [];
for (const sx of [-1, 1])
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) OCTA_FACES.push([sx, sy, sz]);
const OCTA_ICONS = ['Bow', 'Knife', 'Trap', 'Rope', 'Cloak', 'Boots', 'Herb', 'Leaf'];

export function drawOctahedron(ctx: Ctx, cx: number, cy: number, size: number, t: number): void {
  const ya = t * 0.6;
  const xa = -0.62 + Math.sin(t * 0.4) * 0.15;
  const rot = (v: readonly number[]) => {
    const x1 = v[0]! * Math.cos(ya) + v[2]! * Math.sin(ya);
    const z1 = -v[0]! * Math.sin(ya) + v[2]! * Math.cos(ya);
    const y2 = v[1]! * Math.cos(xa) - z1 * Math.sin(xa);
    const z2 = v[1]! * Math.sin(xa) + z1 * Math.cos(xa);
    return [x1, y2, z2] as const;
  };
  const faces = OCTA_FACES.map((s, i) => {
    const vs = [
      [s[0], 0, 0],
      [0, s[1], 0],
      [0, 0, s[2]],
    ].map(rot);
    const n = rot([s[0] / Math.sqrt(3), s[1] / Math.sqrt(3), s[2] / Math.sqrt(3)]);
    return { vs, n, i };
  })
    .filter((f) => f.n[2] > 0)
    .sort((a, b) => a.n[2] - b.n[2]);
  for (const f of faces) {
    ctx.beginPath();
    f.vs.forEach((v, k) => {
      const x = cx + v[0] * size;
      const y = cy - v[1] * size;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    const light = 0.55 + 0.45 * Math.max(0, f.n[2] * 0.7 + f.n[1] * 0.4);
    ctx.fillStyle = `rgb(${Math.round(210 * light)},${Math.round(165 * light)},${Math.round(100 * light)})`;
    ctx.fill();
    ctx.strokeStyle = '#2a1a0c';
    ctx.lineWidth = 2;
    ctx.stroke();
    const mx = cx + ((f.vs[0]![0] + f.vs[1]![0] + f.vs[2]![0]) / 3) * size;
    const my = cy - ((f.vs[0]![1] + f.vs[1]![1] + f.vs[2]![1]) / 3) * size;
    ctx.globalAlpha = Math.min(1, f.n[2] * 2.2);
    drawRangerFace(ctx, OCTA_ICONS[f.i]!, mx, my, size * 0.46 * (0.55 + 0.45 * f.n[2]));
    ctx.globalAlpha = 1;
  }
}
