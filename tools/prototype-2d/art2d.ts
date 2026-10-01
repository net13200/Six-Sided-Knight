/**
 * The lit-dungeon look, drawn on a 2D canvas: pale flagstone floors, thick
 * stone walls with brick faces on the walls you look at, stairs, torch
 * sconces. Drawn once per level into an offscreen canvas.
 */
import type { GameState } from '../../src/engine';
import { rules } from '../mockups/kit';
import type { Seg } from './light';

const RIM = 0.3; // wall thickness drawn inside a wall tile, in tiles
const FACE = 0.46; // height of a brick face (walls north of the floor)

const rand = (x: number, y: number, k = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export function isOpen(s: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return false;
  return rules.tiles.get(s.tiles[y * s.width + x]!).passable;
}

export function isGoal(s: GameState, x: number, y: number): boolean {
  return !!rules.tiles.get(s.tiles[y * s.width + x]!).goal;
}

export interface Sconce {
  x: number;
  y: number;
  /** Where its light sits (just out in the room). */
  lx: number;
  ly: number;
}

/**
 * The wall faces light stops at, set into the walls by the thickness drawn
 * there (so the walls themselves catch the light), and the torch spots.
 */
export function wallSegments(s: GameState): { segs: Seg[]; sconces: Sconce[] } {
  const segs: Seg[] = [];
  const sconces: Sconce[] = [];
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      if (isOpen(s, x, y)) continue;
      if (isOpen(s, x, y + 1)) {
        const d = FACE * 0.8;
        segs.push({ ax: x - 0.02, ay: y + 1 - d, bx: x + 1.02, by: y + 1 - d });
        if (rand(x, y, 8) > 0.55 && x % 2 === 1)
          sconces.push({ x: x + 0.5, y: y + 1 - FACE * 0.62, lx: x + 0.5, ly: y + 1.35 });
      }
      if (isOpen(s, x, y - 1))
        segs.push({ ax: x - 0.02, ay: y + RIM * 0.6, bx: x + 1.02, by: y + RIM * 0.6 });
      if (isOpen(s, x + 1, y)) {
        segs.push({ ax: x + 1 - RIM * 0.6, ay: y - 0.02, bx: x + 1 - RIM * 0.6, by: y + 1.02 });
        if (y % 6 === 2 && isOpen(s, x + 1, y - 1) && isOpen(s, x + 1, y + 1))
          sconces.push({ x: x + 1 - RIM * 0.5, y: y + 0.55, lx: x + 1.4, ly: y + 0.5 });
      }
      if (isOpen(s, x - 1, y)) {
        segs.push({ ax: x + RIM * 0.6, ay: y - 0.02, bx: x + RIM * 0.6, by: y + 1.02 });
        if (y % 6 === 5 && isOpen(s, x - 1, y - 1) && isOpen(s, x - 1, y + 1))
          sconces.push({ x: x + RIM * 0.5, y: y + 0.55, lx: x - 0.4, ly: y + 0.5 });
      }
    }
  }
  // close the corners between those faces
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      if (isOpen(s, x, y)) continue;
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as const) {
        if (isOpen(s, x + dx, y + dy) && !isOpen(s, x + dx, y) && !isOpen(s, x, y + dy)) {
          const cx = dx > 0 ? x + 1 : x;
          const cy = dy > 0 ? y + 1 : y;
          segs.push({ ax: cx, ay: cy - 0.35 * dy, bx: cx - 0.35 * dx, by: cy });
        }
      }
    }
  }
  return { segs, sconces };
}

/** The whole level's static art, at `px` pixels per tile. */
export function drawLevel(s: GameState, px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(s.width * px);
  c.height = Math.ceil(s.height * px);
  const x = c.getContext('2d')!;
  x.scale(px, px);
  x.lineJoin = 'round';

  // floor
  for (let ty = 0; ty < s.height; ty++) {
    for (let tx = 0; tx < s.width; tx++) {
      if (!isOpen(s, tx, ty)) continue;
      flagstone(x, tx, ty);
      if (isGoal(s, tx, ty)) stairs(x, tx, ty);
    }
  }
  // soft shadow the walls throw onto the floor
  for (let ty = 0; ty < s.height; ty++) {
    for (let tx = 0; tx < s.width; tx++) {
      if (!isOpen(s, tx, ty)) continue;
      const sh = (
        x0: number,
        y0: number,
        w: number,
        h: number,
        gx0: number,
        gy0: number,
        gx1: number,
        gy1: number,
      ) => {
        const g = x.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, 'rgba(20,12,10,0.45)');
        g.addColorStop(1, 'rgba(20,12,10,0)');
        x.fillStyle = g;
        x.fillRect(x0, y0, w, h);
      };
      if (!isOpen(s, tx, ty - 1)) sh(tx, ty, 1, 0.3, 0, ty, 0, ty + 0.3);
      if (!isOpen(s, tx - 1, ty)) sh(tx, ty, 0.22, 1, tx, 0, tx + 0.22, 0);
      if (!isOpen(s, tx + 1, ty)) sh(tx + 0.78, ty, 0.22, 1, tx + 1, 0, tx + 0.78, 0);
    }
  }
  // walls
  for (let ty = 0; ty < s.height; ty++) {
    for (let tx = 0; tx < s.width; tx++) {
      if (isOpen(s, tx, ty)) continue;
      wall(s, x, tx, ty);
    }
  }
  return c;
}

function flagstone(x: CanvasRenderingContext2D, tx: number, ty: number): void {
  const v = rand(tx, ty);
  const base = 168 + Math.round(v * 14);
  x.fillStyle = '#3a3330';
  x.fillRect(tx, ty, 1, 1);
  x.fillStyle = `rgb(${base},${base - 6},${base - 16})`;
  x.beginPath();
  x.roundRect(tx + 0.035, ty + 0.035, 0.93, 0.93, 0.06);
  x.fill();
  // bevel: light top-left, dark bottom-right
  x.strokeStyle = 'rgba(255,250,235,0.35)';
  x.lineWidth = 0.025;
  x.beginPath();
  x.moveTo(tx + 0.06, ty + 0.94);
  x.lineTo(tx + 0.06, ty + 0.06);
  x.lineTo(tx + 0.94, ty + 0.06);
  x.stroke();
  x.strokeStyle = 'rgba(40,30,25,0.35)';
  x.beginPath();
  x.moveTo(tx + 0.94, ty + 0.06);
  x.lineTo(tx + 0.94, ty + 0.94);
  x.lineTo(tx + 0.06, ty + 0.94);
  x.stroke();
  // mottling
  for (let i = 0; i < 9; i++) {
    x.fillStyle = rand(tx, ty, i) > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(60,50,40,0.08)';
    x.beginPath();
    x.ellipse(
      tx + 0.12 + rand(tx, ty, i + 10) * 0.76,
      ty + 0.12 + rand(tx, ty, i + 20) * 0.76,
      0.06 + rand(tx, ty, i + 30) * 0.12,
      0.04 + rand(tx, ty, i + 40) * 0.08,
      rand(tx, ty, i + 50) * 3,
      0,
      Math.PI * 2,
    );
    x.fill();
  }
  // a crack now and then
  if (rand(tx, ty, 3) > 0.62) {
    x.strokeStyle = 'rgba(70,58,50,0.55)';
    x.lineWidth = 0.018;
    x.beginPath();
    let cx = tx + 0.2 + rand(tx, ty, 4) * 0.6;
    let cy = ty + 0.08;
    x.moveTo(cx, cy);
    for (let k = 0; k < 4; k++) {
      cx += (rand(tx, ty, 5 + k) - 0.5) * 0.25;
      cy += 0.12 + rand(tx, ty, 9 + k) * 0.1;
      x.lineTo(cx, cy);
    }
    x.stroke();
  }
  // pebbles
  if (rand(tx, ty, 6) > 0.7) {
    for (let k = 0; k < 4; k++) {
      x.fillStyle = 'rgba(80,68,58,0.8)';
      x.beginPath();
      x.arc(
        tx + 0.2 + rand(tx, ty, 60 + k) * 0.6,
        ty + 0.2 + rand(tx, ty, 70 + k) * 0.6,
        0.018 + rand(tx, ty, 80 + k) * 0.02,
        0,
        Math.PI * 2,
      );
      x.fill();
    }
  }
}

function stairs(x: CanvasRenderingContext2D, tx: number, ty: number): void {
  x.fillStyle = '#120d10';
  x.beginPath();
  x.roundRect(tx + 0.1, ty + 0.1, 0.8, 0.8, 0.04);
  x.fill();
  for (let i = 0; i < 4; i++) {
    const l = 120 - i * 26;
    x.fillStyle = `rgb(${l},${l - 8},${l - 14})`;
    x.fillRect(tx + 0.14, ty + 0.14 + i * 0.18, 0.72, 0.12);
    x.fillStyle = 'rgba(0,0,0,0.35)';
    x.fillRect(tx + 0.14, ty + 0.24 + i * 0.18, 0.72, 0.04);
  }
  x.strokeStyle = '#8a6a3a';
  x.lineWidth = 0.05;
  x.strokeRect(tx + 0.1, ty + 0.1, 0.8, 0.8);
}

const STONE = '#4b3529';
const STONE_HI = '#7d5c45';
const STONE_DARK = '#24180f';

function wall(s: GameState, x: CanvasRenderingContext2D, tx: number, ty: number): void {
  const S = isOpen(s, tx, ty + 1);
  const N = isOpen(s, tx, ty - 1);
  const E = isOpen(s, tx + 1, ty);
  const W = isOpen(s, tx - 1, ty);
  const band = (x0: number, y0: number, w: number, h: number) => {
    x.fillStyle = STONE;
    x.fillRect(x0, y0, w, h);
    // little blocks along the rim
    x.strokeStyle = STONE_DARK;
    x.lineWidth = 0.02;
    const along = w > h;
    const len = along ? w : h;
    for (let i = 0; i < len; i += 0.25) {
      x.beginPath();
      if (along) {
        x.moveTo(x0 + i, y0);
        x.lineTo(x0 + i, y0 + h);
      } else {
        x.moveTo(x0, y0 + i);
        x.lineTo(x0 + w, y0 + i);
      }
      x.stroke();
    }
    for (let i = 0; i < 6; i++) {
      x.fillStyle = 'rgba(255,220,180,0.06)';
      x.fillRect(
        x0 + rand(tx, ty, i + 90) * w * 0.9,
        y0 + rand(tx, ty, i + 95) * h * 0.8,
        0.05,
        0.03,
      );
    }
  };
  // rims along every side that faces the floor
  if (N) band(tx, ty, 1, RIM);
  if (E) band(tx + 1 - RIM, ty, RIM, 1);
  if (W) band(tx, ty, RIM, 1);
  if (S) band(tx, ty + 1 - FACE - RIM * 0.6, 1, RIM * 0.6);
  // outer corners where only a diagonal touches the floor
  for (const [dx, dy] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    if (isOpen(s, tx + dx, ty + dy) && !isOpen(s, tx + dx, ty) && !isOpen(s, tx, ty + dy)) {
      const cx = dx > 0 ? tx + 1 - RIM : tx;
      const cy = dy > 0 ? ty + 1 - RIM : ty;
      x.fillStyle = STONE;
      x.fillRect(cx, cy, RIM, RIM);
    }
  }
  // the brick face of walls north of the floor (the side you look at)
  if (S) {
    const top = ty + 1 - FACE;
    x.fillStyle = '#3a271d';
    x.fillRect(tx, top, 1, FACE);
    const rows = 3;
    const rh = FACE / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 0.17 : 0;
      for (let bx = -1; bx < 4; bx++) {
        const x0 = Math.max(tx, tx + off + bx * 0.33);
        const x1 = Math.min(tx + 1, tx + off + (bx + 1) * 0.33);
        if (x1 <= x0 + 0.02) continue;
        const v = rand(tx * 5 + bx, ty * 3 + r, 2);
        const l = 88 + Math.round(v * 22);
        x.fillStyle = `rgb(${l + 18},${l - 6},${l - 26})`;
        x.beginPath();
        x.roundRect(x0 + 0.012, top + r * rh + 0.012, x1 - x0 - 0.024, rh - 0.024, 0.02);
        x.fill();
        x.fillStyle = 'rgba(255,230,200,0.12)';
        x.fillRect(x0 + 0.02, top + r * rh + 0.015, x1 - x0 - 0.04, 0.02);
      }
    }
    // shade toward the floor, and a top lip
    const g = x.createLinearGradient(0, top, 0, ty + 1);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(10,5,0,0.35)');
    x.fillStyle = g;
    x.fillRect(tx, top, 1, FACE);
    x.fillStyle = STONE_HI;
    x.fillRect(tx, top - 0.03, 1, 0.04);
  }
  // highlight on rim edges facing the floor
  x.fillStyle = STONE_HI;
  if (N) x.fillRect(tx, ty + RIM - 0.035, 1, 0.035);
  if (E) x.fillRect(tx + 1 - RIM, ty, 0.035, 1);
  if (W) x.fillRect(tx + RIM - 0.035, ty, 0.035, 1);
}

/** A sconce with its flame (drawn every frame: the flame flickers). */
export function drawSconce(
  x: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  px: number,
  t: number,
  seed: number,
): void {
  const f = 0.85 + Math.sin(t * 11 + seed * 40) * 0.1 + Math.sin(t * 23 + seed * 13) * 0.06;
  x.fillStyle = '#2a1d16';
  x.fillRect(sx - 0.05 * px, sy - 0.02 * px, 0.1 * px, 0.16 * px);
  x.fillStyle = '#6b5a4a';
  x.fillRect(sx - 0.09 * px, sy - 0.04 * px, 0.18 * px, 0.05 * px);
  x.save();
  x.globalCompositeOperation = 'lighter';
  const g = x.createRadialGradient(sx, sy - 0.12 * px, 0, sx, sy - 0.12 * px, 0.3 * px);
  g.addColorStop(0, 'rgba(255,190,90,0.7)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  x.fillStyle = g;
  x.fillRect(sx - 0.3 * px, sy - 0.42 * px, 0.6 * px, 0.6 * px);
  x.restore();
  x.fillStyle = '#ffb347';
  x.beginPath();
  x.moveTo(sx - 0.06 * px, sy - 0.05 * px);
  x.quadraticCurveTo(
    sx - 0.05 * px,
    sy - 0.2 * px * f,
    sx + Math.sin(t * 7 + seed) * 0.02 * px,
    sy - 0.27 * px * f,
  );
  x.quadraticCurveTo(sx + 0.05 * px, sy - 0.2 * px * f, sx + 0.06 * px, sy - 0.05 * px);
  x.fill();
  x.fillStyle = '#fff1b0';
  x.beginPath();
  x.ellipse(sx, sy - 0.09 * px, 0.025 * px, 0.06 * px * f, 0, 0, Math.PI * 2);
  x.fill();
}
