/**
 * Procedural art. Every face, tile and enemy is drawn from code (no image
 * assets). Art is looked up by content id with a glyph fallback, so new
 * content renders (plainly) before it gets custom art.
 */
import type { EnemyDef, EnemyState, TileDef } from '../../engine';
import { C } from './palette';

type Ctx = CanvasRenderingContext2D;
type IconFn = (ctx: Ctx) => void; // draws in a [-1, 1] box

/** Fills and outlines the current path. `lw` is in unit space. */
function paint(ctx: Ctx, fill: string, lw = 0.12, stroke: string = C.outline): void {
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

const FACE_ICONS: Record<string, IconFn> = {
  Sword(ctx) {
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(-0.15, 0.22);
    ctx.lineTo(-0.15, -0.68);
    ctx.lineTo(0, -0.98);
    ctx.lineTo(0.15, -0.68);
    ctx.lineTo(0.15, 0.22);
    ctx.closePath();
    paint(ctx, C.sword);
    ctx.beginPath();
    ctx.moveTo(0, -0.85);
    ctx.lineTo(0, 0.18);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = '#9aa6b8';
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-0.46, 0.22, 0.92, 0.16, 0.06);
    paint(ctx, '#c49a4c');
    ctx.beginPath();
    ctx.rect(-0.09, 0.38, 0.18, 0.36);
    paint(ctx, '#6d4a2b');
    ctx.beginPath();
    ctx.arc(0, 0.84, 0.13, 0, Math.PI * 2);
    paint(ctx, '#c49a4c');
    ctx.restore();
  },
  Shield(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.74, -0.82);
    ctx.lineTo(0.74, -0.82);
    ctx.lineTo(0.74, -0.1);
    ctx.quadraticCurveTo(0.72, 0.56, 0, 0.96);
    ctx.quadraticCurveTo(-0.72, 0.56, -0.74, -0.1);
    ctx.closePath();
    paint(ctx, C.shield);
    ctx.beginPath();
    ctx.moveTo(0, -0.7);
    ctx.lineTo(0, 0.78);
    ctx.moveTo(-0.6, -0.28);
    ctx.lineTo(0.6, -0.28);
    ctx.lineWidth = 0.16;
    ctx.strokeStyle = '#cfe2ff';
    ctx.stroke();
  },
  Bomb(ctx) {
    ctx.beginPath();
    ctx.moveTo(0.28, -0.52);
    ctx.quadraticCurveTo(0.5, -0.95, 0.72, -0.78);
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = '#b8a07a';
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(0.08, -0.62, 0.34, 0.24);
    paint(ctx, '#5c5a6e');
    ctx.beginPath();
    ctx.arc(-0.1, 0.16, 0.66, 0, Math.PI * 2);
    paint(ctx, C.bomb);
    ctx.beginPath();
    ctx.arc(-0.34, -0.08, 0.15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    // spark
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 0.1 : 0.24;
      ctx.lineTo(0.74 + Math.cos(a) * r, -0.8 + Math.sin(a) * r);
    }
    ctx.closePath();
    paint(ctx, C.fuse, 0.05);
  },
  Heart(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, 0.86);
    ctx.bezierCurveTo(-0.98, 0.18, -0.86, -0.78, -0.42, -0.78);
    ctx.bezierCurveTo(-0.18, -0.78, 0, -0.58, 0, -0.42);
    ctx.bezierCurveTo(0, -0.58, 0.18, -0.78, 0.42, -0.78);
    ctx.bezierCurveTo(0.86, -0.78, 0.98, 0.18, 0, 0.86);
    ctx.closePath();
    paint(ctx, C.heart);
    ctx.beginPath();
    ctx.ellipse(-0.42, -0.36, 0.16, 0.1, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  },
  Key(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.15, -0.11);
    ctx.lineTo(0.9, -0.11);
    ctx.lineTo(0.9, 0.11);
    ctx.lineTo(0.8, 0.11);
    ctx.lineTo(0.8, 0.42);
    ctx.lineTo(0.62, 0.42);
    ctx.lineTo(0.62, 0.11);
    ctx.lineTo(0.48, 0.11);
    ctx.lineTo(0.48, 0.32);
    ctx.lineTo(0.3, 0.32);
    ctx.lineTo(0.3, 0.11);
    ctx.lineTo(-0.15, 0.11);
    ctx.closePath();
    paint(ctx, C.key);
    ctx.beginPath();
    ctx.arc(-0.48, 0, 0.42, 0, Math.PI * 2);
    ctx.arc(-0.48, 0, 0.18, 0, Math.PI * 2, true);
    paint(ctx, C.key);
  },
  Coin(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.82, 0, Math.PI * 2);
    paint(ctx, C.coin);
    ctx.beginPath();
    ctx.arc(0, 0, 0.58, 0, Math.PI * 2);
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = '#c9a22e';
    ctx.stroke();
    // four-point star stamp
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 0.14 : 0.4;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#c9a22e';
    ctx.fill();
  },
};

export function drawFace(ctx: Ctx, face: string, cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 2, size / 2);
  const icon = FACE_ICONS[face];
  if (icon) {
    icon(ctx);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 0.8, 0, Math.PI * 2);
    paint(ctx, '#9b8fbf');
    ctx.fillStyle = C.outline;
    ctx.font = 'bold 1px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(face.slice(0, 1), 0, 0.06);
  }
  ctx.restore();
}

// ---------- tiles ----------

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function floor(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number): void {
  ctx.fillStyle = (tx + ty) % 2 ? C.floorA : C.floorB;
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 3; i++) {
    const r = hash2(tx * 3 + i, ty * 7 - i);
    const r2 = hash2(ty * 5 + i, tx * 11 + i);
    ctx.fillRect(px + 4 + r * (s - 10), py + 4 + r2 * (s - 10), 2, 2);
  }
}

type TileArt = (
  ctx: Ctx,
  px: number,
  py: number,
  s: number,
  tx: number,
  ty: number,
  t: number,
) => void;

const TILE_ART: Record<string, TileArt> = {
  floor,
  wall(ctx, px, py, s, tx, ty) {
    ctx.fillStyle = C.wall;
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = C.wallTop;
    ctx.fillRect(px + 1, py + 1, s - 2, s - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    const off = ty % 2 ? s / 2 : 0;
    ctx.fillRect(px + 1, py + (s - 8) / 2, s - 2, 1.5);
    ctx.fillRect(px + ((off + s / 4 + hash2(tx, ty) * 4) % s), py + 1, 1.5, (s - 8) / 2);
    ctx.fillStyle = C.wallEdge;
    ctx.fillRect(px + 1, py + 1, s - 2, 2);
  },
  spikes(ctx, px, py, s, tx, ty) {
    floor(ctx, px, py, s, tx, ty);
    const h = s / 2;
    for (const [ox, oy] of [
      [0, 0],
      [h, 0],
      [0, h],
      [h, h],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(px + ox + 4, py + oy + h - 3);
      ctx.lineTo(px + ox + h / 2, py + oy + 3);
      ctx.lineTo(px + ox + h - 4, py + oy + h - 3);
      ctx.closePath();
      ctx.fillStyle = C.spikes;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  },
  pool(ctx, px, py, s, tx, ty, t) {
    floor(ctx, px, py, s, tx, ty);
    ctx.beginPath();
    ctx.ellipse(px + s / 2, py + s / 2, s * 0.42, s * 0.34, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.pool;
    ctx.fill();
    ctx.strokeStyle = '#1e5f80';
    ctx.lineWidth = 2;
    ctx.stroke();
    const w = Math.sin(t * 2 + tx + ty) * 2;
    ctx.beginPath();
    ctx.ellipse(px + s / 2 - 3 + w, py + s / 2 - 3, s * 0.16, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.poolLight;
    ctx.fill();
    // plus sign: this pool heals
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(px + s / 2 + 5, py + s / 2 + 1, 6, 2);
    ctx.fillRect(px + s / 2 + 7, py + s / 2 - 1, 2, 6);
  },
  door(ctx, px, py, s) {
    ctx.fillStyle = C.wall;
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = C.door;
    ctx.fillRect(px + 4, py + 3, s - 8, s - 5);
    ctx.fillStyle = C.doorDark;
    for (let i = 1; i < 3; i++) ctx.fillRect(px + 4 + ((s - 8) * i) / 3, py + 3, 1.5, s - 5);
    ctx.fillRect(px + 4, py + 10, s - 8, 2);
    ctx.fillRect(px + 4, py + s - 12, s - 8, 2);
    // keyhole
    ctx.fillStyle = '#1a1208';
    ctx.beginPath();
    ctx.arc(px + s / 2, py + s / 2 - 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px + s / 2 - 3, py + s / 2 + 7);
    ctx.lineTo(px + s / 2, py + s / 2 - 1);
    ctx.lineTo(px + s / 2 + 3, py + s / 2 + 7);
    ctx.fill();
  },
  chest(ctx, px, py, s, tx, ty) {
    floor(ctx, px, py, s, tx, ty);
    const x = px + 5;
    const y = py + 9;
    const w = s - 10;
    const h = s - 16;
    ctx.fillStyle = C.chest;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 1, y + h * 0.38, w - 2, 2);
    ctx.fillStyle = C.chestBand;
    ctx.fillRect(x + 4, y, 3, h);
    ctx.fillRect(x + w - 7, y, 3, h);
    // coin slot: this chest takes a Coin
    ctx.fillStyle = '#2a1a08';
    ctx.fillRect(px + s / 2 - 4, y + h * 0.5, 8, 2.5);
  },
  gem(ctx, px, py, s, tx, ty, t) {
    floor(ctx, px, py, s, tx, ty);
    const cx = px + s / 2;
    const cy = py + s / 2 + Math.sin(t * 3 + tx) * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx + 9, cy - 2);
    ctx.lineTo(cx, cy + 10);
    ctx.lineTo(cx - 9, cy - 2);
    ctx.closePath();
    ctx.fillStyle = C.gem;
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 2);
    ctx.lineTo(cx + 9, cy - 2);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx - 3, cy - 2);
    ctx.lineTo(cx, cy + 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },
  exit(ctx, px, py, s, tx, ty, t) {
    floor(ctx, px, py, s, tx, ty);
    ctx.fillStyle = '#0c0a12';
    ctx.fillRect(px + 4, py + 4, s - 8, s - 8);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(226,182,80,${0.85 - i * 0.2})`;
      ctx.fillRect(px + 6 + i * 2, py + 7 + i * 7, s - 12 - i * 4, 4);
    }
    ctx.strokeStyle = `rgba(226,182,80,${0.55 + 0.35 * Math.sin(t * 3)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 3, py + 3, s - 6, s - 6);
  },
};

export function drawTile(
  ctx: Ctx,
  def: TileDef,
  px: number,
  py: number,
  s: number,
  tx: number,
  ty: number,
  t: number,
): void {
  const art = TILE_ART[def.id];
  if (art) {
    art(ctx, px, py, s, tx, ty, t);
    return;
  }
  floor(ctx, px, py, s, tx, ty);
  ctx.fillStyle = C.text;
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.glyph, px + s / 2, py + s / 2);
}

// ---------- enemies ----------

export interface EnemyLook {
  /** Where the enemy is looking (unit vector toward the player). */
  readonly lookX: number;
  readonly lookY: number;
  /** 0..1 white hit flash. */
  readonly flash: number;
  readonly t: number;
}

type EnemyArt = (ctx: Ctx, cx: number, cy: number, look: EnemyLook) => void;

const ENEMY_ART: Record<string, EnemyArt> = {
  skeleton(ctx, cx, cy, look) {
    const bob = Math.sin(look.t * 4 + cx) * 0.8;
    const y = cy + bob;
    // jaw
    ctx.beginPath();
    ctx.roundRect(cx - 7, y + 3, 14, 8, 3);
    ctx.fillStyle = C.skeleton;
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    // skull
    ctx.beginPath();
    ctx.arc(cx, y - 3, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // eye sockets follow the player a little
    ctx.fillStyle = '#231d2b';
    const ex = look.lookX * 1.5;
    const ey = look.lookY * 1.5;
    ctx.beginPath();
    ctx.arc(cx - 4.5 + ex, y - 3 + ey, 3.2, 0, Math.PI * 2);
    ctx.arc(cx + 4.5 + ex, y - 3 + ey, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 1, y + 2, 2, 2);
    ctx.fillStyle = '#231d2b';
    for (let i = -1; i <= 1; i++) ctx.fillRect(cx + i * 3.5 - 0.5, y + 5, 1, 5);
  },
  slime(ctx, cx, cy, look) {
    const squish = Math.sin(look.t * 3 + cx * 0.3) * 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 13 - squish, cy + 11);
    ctx.bezierCurveTo(cx - 14, cy - 8 + squish, cx - 6, cy - 13 + squish, cx, cy - 13 + squish);
    ctx.bezierCurveTo(
      cx + 6,
      cy - 13 + squish,
      cx + 14,
      cy - 8 + squish,
      cx + 13 + squish,
      cy + 11,
    );
    ctx.closePath();
    ctx.fillStyle = C.slime;
    ctx.fill();
    ctx.strokeStyle = C.slimeDark;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx - 6, cy - 6 + squish, 3, 2, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + side * 5, cy + 1, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + side * 5 + look.lookX * 1.6, cy + 1 + look.lookY * 1.6, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#10200c';
      ctx.fill();
    }
  },
};

export function drawEnemy(
  ctx: Ctx,
  def: EnemyDef,
  enemy: EnemyState,
  cx: number,
  cy: number,
  look: EnemyLook,
  showStatus = true,
): void {
  const art = ENEMY_ART[def.kind];
  if (art) {
    art(ctx, cx, cy, look);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#b05bd6';
    ctx.fill();
    ctx.fillStyle = C.outline;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.glyph, cx, cy + 1);
  }
  if (look.flash > 0) {
    ctx.save();
    ctx.globalAlpha = look.flash * 0.8;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }
  if (!showStatus) return;
  // HP pips
  const n = def.hp;
  for (let i = 0; i < n; i++) {
    const x = cx - ((n - 1) * 6) / 2 + i * 6;
    ctx.beginPath();
    ctx.arc(x, cy + 16, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = i < enemy.hp ? C.hurt : 'rgba(255,255,255,0.18)';
    ctx.fill();
  }
  // Cadence indicator for enemies that skip turns.
  if (def.willAct) {
    const ready = def.willAct(enemy);
    const bx = cx + 12;
    const by = cy - 13;
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fillStyle = ready ? C.alert : '#3a3550';
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = ready ? C.outline : C.textDim;
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ready ? '!' : 'z', bx, by + 0.5);
  }
}

// ---------- the die ----------

export function drawDieBody(ctx: Ctx, cx: number, cy: number, w: number, h: number): void {
  ctx.fillStyle = C.dieShadow;
  ctx.beginPath();
  ctx.ellipse(cx, cy + h / 2 + 1, w * 0.45, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 6);
  ctx.fillStyle = C.dieEdge;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h - 3, 6);
  ctx.fillStyle = C.dieBody;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 6);
  ctx.stroke();
}

/** A small face badge (used around the die and in the compass). */
export function drawBadge(ctx: Ctx, face: string, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,18,28,0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(241,231,207,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  drawFace(ctx, face, cx, cy, r * 1.45);
}
