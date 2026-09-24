/**
 * Drawing the die as a cube:
 * - drawDieCube: on the board, seen from straight above. The top face sits
 *   in the middle and each side face is a slanted panel on the side it will
 *   hit. The bottom face peeks out from the shadow.
 * - drawCube3d: a freely rotated cube (orthographic projection) for the
 *   inspect view. No WebGL: each face is a 2D affine transform, so the same
 *   face icons are reused.
 * - drawCompass: the flat cross under the board, with the bottom face.
 */
import { faceInSlot, getShape, type DieState } from '../../engine';
import { SKINS, type SkinDef } from '../../meta/skins';
import { drawFace } from './art';
import { C } from './palette';
import { roleColor } from './roles';

export function facesOf(die: DieState, orient = die.orient): Record<string, string> {
  const shape = getShape(die.shape);
  const d = { ...die, orient };
  const out: Record<string, string> = {};
  shape.def.slots.forEach((name, slot) => (out[name] = faceInSlot(d, slot)));
  return out;
}

const SIDES = [
  ['north', 0, -1],
  ['east', 1, 0],
  ['south', 0, 1],
  ['west', -1, 0],
] as const;

/** Light from the top-left: each side panel gets a little lighter or darker. */
const SIDE_LIGHT: Record<string, string> = {
  north: 'rgba(255,255,255,0.30)',
  west: 'rgba(255,255,255,0.12)',
  east: 'rgba(0,0,0,0.10)',
  south: 'rgba(0,0,0,0.22)',
};

export interface CubeLook {
  /** Squash along each axis (roll animation). */
  readonly sx: number;
  readonly sy: number;
  /** 0..1 red hurt flash. */
  readonly flash: number;
}

/** The equipped cosmetic skin (frame, glow, pattern). Never changes face colours. */
let currentSkin: SkinDef = SKINS[0]!;
export function setDieSkin(skin: SkinDef): void {
  currentSkin = skin;
}

/** The die on the board, seen from above. `R` is the outer half-size. */
export function drawDieCube(
  ctx: CanvasRenderingContext2D,
  die: DieState,
  orient: number,
  cx: number,
  cy: number,
  look: CubeLook,
  showBottom: boolean,
  skin: SkinDef = currentSkin,
): void {
  const faces = facesOf(die, orient);
  // Bigger than its tile (the die is the one thing you must always read), with
  // a large top face; move labels sit on the neighbouring tiles, not on the die.
  const R = 28;
  const r = 17;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(look.sx, look.sy);

  if (skin.glow) {
    const g = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.5);
    g.addColorStop(0, skin.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-R * 1.6, -R * 1.6, R * 3.2, R * 3.2);
  }

  // Shadow, with the bottom face peeking out of it.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(-R + 3, -R + 5, R * 2, R * 2, 8);
  ctx.fill();
  if (showBottom) drawBottomBadge(ctx, faces.bottom ?? '', R - 1, R + 2, 7.5, 0.95);

  for (const [slot, dx, dy] of SIDES) {
    const face = faces[slot] ?? '';
    const path = () => {
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
    };
    path();
    ctx.fillStyle = roleColor(face);
    ctx.fill();
    ctx.fillStyle = SIDE_LIGHT[slot]!;
    ctx.fill();
    if (skin.pattern !== 'none') {
      ctx.save();
      ctx.clip();
      drawPattern(ctx, skin, R);
      ctx.restore();
      path();
    }
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    const mid = (r + R) / 2;
    drawFace(ctx, face, dx * mid, dy * mid, 12);
  }

  // Top face
  ctx.beginPath();
  ctx.roundRect(-r, -r, r * 2, r * 2, 4);
  ctx.fillStyle = '#fbf6ea';
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  drawFace(ctx, faces.top ?? '', 0, 0, 29);

  ctx.beginPath();
  ctx.roundRect(-R, -R, R * 2, R * 2, 7);
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 3;
  ctx.stroke();
  if (skin.id !== 'classic') {
    ctx.beginPath();
    ctx.roundRect(-R + 2, -R + 2, R * 2 - 4, R * 2 - 4, 6);
    ctx.strokeStyle = skin.rim;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (look.flash > 0) {
    ctx.globalAlpha = look.flash * 0.55;
    ctx.fillStyle = C.hurt;
    ctx.beginPath();
    ctx.roundRect(-R, -R, R * 2, R * 2, 6);
    ctx.fill();
  }
  ctx.restore();
}

/** A faint cosmetic pattern over the side panels (already clipped). */
function drawPattern(ctx: CanvasRenderingContext2D, skin: SkinDef, R: number): void {
  ctx.fillStyle = skin.patternColor;
  ctx.strokeStyle = skin.patternColor;
  ctx.lineWidth = 1;
  switch (skin.pattern) {
    case 'dots':
      for (let y = -R; y <= R; y += 5)
        for (let x = -R + ((y / 5) % 2 ? 2.5 : 0); x <= R; x += 5) ctx.fillRect(x, y, 1.4, 1.4);
      break;
    case 'stripes':
      ctx.beginPath();
      for (let k = -2 * R; k <= 2 * R; k += 5) {
        ctx.moveTo(k, -R);
        ctx.lineTo(k + 2 * R, R);
      }
      ctx.stroke();
      break;
    case 'stars':
      for (const [x, y] of [
        [-17, -15],
        [12, -18],
        [18, 6],
        [-14, 16],
        [5, 18],
        [-19, 2],
        [16, -4],
        [-4, -19],
      ] as const) {
        ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
      }
      break;
    case 'frost':
      ctx.beginPath();
      for (const [x, y, a] of [
        [-16, -16, 0.6],
        [16, -16, 2.4],
        [16, 16, 3.9],
        [-16, 16, 5.5],
      ] as const) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
        ctx.moveTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
        ctx.lineTo(x + Math.cos(a + 0.8) * 5, y + Math.sin(a + 0.8) * 5);
      }
      ctx.stroke();
      break;
    case 'cracks':
      ctx.beginPath();
      ctx.moveTo(-R, -8);
      ctx.lineTo(-14, -5);
      ctx.lineTo(-16, 2);
      ctx.moveTo(R, 10);
      ctx.lineTo(14, 8);
      ctx.lineTo(15, 14);
      ctx.moveTo(4, -R);
      ctx.lineTo(6, -14);
      ctx.stroke();
      break;
    case 'shine':
      ctx.beginPath();
      ctx.moveTo(-R, -R + 6);
      ctx.lineTo(-R + 6, -R);
      ctx.lineTo(-R + 12, -R);
      ctx.lineTo(-R, -R + 12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(R, R - 6);
      ctx.lineTo(R - 6, R);
      ctx.lineTo(R - 9, R);
      ctx.lineTo(R, R - 9);
      ctx.closePath();
      ctx.fill();
      break;
    case 'none':
      break;
  }
}

/** The face underneath: a small badge with a dashed ring ("under the die"). */
export function drawBottomBadge(
  ctx: CanvasRenderingContext2D,
  face: string,
  x: number,
  y: number,
  rad: number,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fillStyle = '#16131f';
  ctx.fill();
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = roleColor(face);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  drawFace(ctx, face, x, y, rad * 1.35);
  ctx.restore();
}

/** The compass: top face in the middle, leading faces around it, the bottom face in the corner. */
export function drawCompass(
  ctx: CanvasRenderingContext2D,
  die: DieState,
  cx: number,
  cy: number,
): void {
  const faces = facesOf(die);
  const gap = 23;
  ctx.beginPath();
  ctx.roundRect(cx - 12, cy - 12, 24, 24, 5);
  ctx.fillStyle = roleColor(faces.top ?? '');
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawFace(ctx, faces.top ?? '', cx, cy, 16);
  for (const [slot, dx, dy] of SIDES) {
    const x = cx + dx * gap;
    const y = cy + dy * gap;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fillStyle = roleColor(faces[slot] ?? '');
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawFace(ctx, faces[slot] ?? '', x, y, 14);
  }
  drawBottomBadge(ctx, faces.bottom ?? '', cx + gap, cy + gap - 2, 8);
}

// ---------- 3D ----------

export type V3 = readonly [number, number, number];
export type M3 = readonly [V3, V3, V3];

export const mul = (m: M3, v: V3): V3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

export function matmul(a: M3, b: M3): M3 {
  const row = (r: V3): V3 => [
    r[0] * b[0][0] + r[1] * b[1][0] + r[2] * b[2][0],
    r[0] * b[0][1] + r[1] * b[1][1] + r[2] * b[2][1],
    r[0] * b[0][2] + r[1] * b[1][2] + r[2] * b[2][2],
  ];
  return [row(a[0]), row(a[1]), row(a[2])];
}

export const rotX = (a: number): M3 => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
];
export const rotY = (a: number): M3 => [
  [Math.cos(a), 0, Math.sin(a)],
  [0, 1, 0],
  [-Math.sin(a), 0, Math.cos(a)],
];
export const rotZ = (a: number): M3 => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];
export const IDENTITY: M3 = rotZ(0);
const deg = (d: number) => (d * Math.PI) / 180;

/** World: x = east, y = north, z = up. Per slot: outward normal, face right (u) and up (v). */
export const SLOT_FRAMES: Record<string, { n: V3; u: V3; v: V3 }> = {
  top: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  bottom: { n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] },
  north: { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1] },
  south: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  east: { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  west: { n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1] },
};

/** Partial rotation of a roll in `dir` at progress t (0..1); t = 1 is a full quarter turn. */
export function rollRotation(dir: 'N' | 'E' | 'S' | 'W', t: number): M3 {
  const a = deg(90 * t);
  if (dir === 'E') return rotY(a);
  if (dir === 'W') return rotY(-a);
  if (dir === 'N') return rotX(-a);
  return rotX(a);
}

/** Camera looking down from the south-east. yaw/pitch in degrees. */
export function cameraMatrix(yaw: number, pitch: number): M3 {
  return matmul(rotX(deg(pitch)), rotZ(deg(yaw)));
}

/** Which slots face the camera, back to front. */
export function visibleSlots(full: M3): string[] {
  return Object.entries(SLOT_FRAMES)
    .map(([slot, f]) => ({ slot, z: mul(full, f.n)[2] }))
    .filter((q) => q.z > 0.01)
    .sort((a, b) => a.z - b.z)
    .map((q) => q.slot);
}

export function drawCube3d(
  ctx: CanvasRenderingContext2D,
  die: DieState,
  cx: number,
  cy: number,
  size: number,
  camera: M3,
  model: M3 = IDENTITY,
  highlight: string | null = null,
): void {
  const faces = facesOf(die);
  const full = matmul(camera, model);
  const light: V3 = [-0.4, 0.5, 0.77];
  for (const slot of visibleSlots(full)) {
    const f = SLOT_FRAMES[slot]!;
    const n = mul(full, f.n);
    const c = mul(full, [f.n[0] * 0.5, f.n[1] * 0.5, f.n[2] * 0.5]);
    const u = mul(full, [f.u[0] * 0.5, f.u[1] * 0.5, f.u[2] * 0.5]);
    const v = mul(full, [f.v[0] * 0.5, f.v[1] * 0.5, f.v[2] * 0.5]);
    ctx.save();
    // Face space [-1,1]^2 -> screen (canvas y points down).
    ctx.transform(
      u[0] * size,
      -u[1] * size,
      -v[0] * size,
      v[1] * size,
      cx + c[0] * size,
      cy - c[1] * size,
    );
    const face = faces[slot] ?? '';
    ctx.beginPath();
    ctx.rect(-1, -1, 2, 2);
    ctx.fillStyle = roleColor(face);
    ctx.fill();
    const lit = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - lit)})`;
    ctx.fill();
    ctx.lineWidth = highlight === slot ? 0.16 : 0.08;
    ctx.strokeStyle = highlight === slot ? C.gold : C.outline;
    ctx.stroke();
    drawFace(ctx, face, 0, 0, 1.25);
    ctx.restore();
  }
}
