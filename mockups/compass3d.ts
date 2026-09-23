/**
 * 3D compass mockups (not shipped):
 *  A. the compass tumbles in 3D in sync with each roll, then settles back into the flat cross
 *  B. long-press to inspect: a big cube you can spin, with a preview of each possible roll
 * A tiny orthographic cube renderer on the 2D canvas: no WebGL, no libraries.
 */
import { defaultRules } from '../src/content/register';
import {
  createState,
  DIR_DELTA,
  rollDie,
  step,
  type Dir,
  type DieState,
  type GameState,
  type LevelData,
} from '../src/engine';
import { drawFace } from '../src/game/view/art';
import { drawBoard, facesOf } from '../src/game/view/board';
import { Fx } from '../src/game/view/fx';
import { C } from '../src/game/view/palette';

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
    '#......#',
    '#......#',
    '########',
  ],
};
const state = createState(rules, level);
const fx = new Fx();
const V = fx.compute();

const ROLE: Record<string, string> = {
  Sword: '#f4b39c',
  Bomb: '#f4b39c',
  Shield: '#b3cff5',
  Heart: '#b8e6b9',
  Key: '#f1d78e',
  Coin: '#f1d78e',
};
const roleOf = (f: string) => ROLE[f] ?? '#d9d2e8';

// ---------- 3D maths ----------
type V3 = [number, number, number];
type M3 = [V3, V3, V3]; // rows
const mul = (m: M3, v: V3): V3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const mm = (a: M3, b: M3): M3 =>
  [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => a[i]![0] * b[0][j] + a[i]![1] * b[1][j] + a[i]![2] * b[2][j]),
  ) as M3;
const rotX = (a: number): M3 => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
];
const rotY = (a: number): M3 => [
  [Math.cos(a), 0, Math.sin(a)],
  [0, 1, 0],
  [-Math.sin(a), 0, Math.cos(a)],
];
const rotZ = (a: number): M3 => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];
const deg = (d: number) => (d * Math.PI) / 180;

/** World: x = east, y = north, z = up. Each slot: normal, and the face's right (u) and up (v) axes. */
const SLOTS: Record<string, { n: V3; u: V3; v: V3 }> = {
  top: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  bottom: { n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] },
  north: { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1] },
  south: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  east: { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  west: { n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1] },
};

/** A roll in `dir` is a quarter turn: this is the partial rotation at progress t (0..1). */
function rollRotation(dir: Dir, t: number): M3 {
  const a = deg(90 * t);
  if (dir === 'E') return rotY(a);
  if (dir === 'W') return rotY(-a);
  if (dir === 'N') return rotX(-a);
  return rotX(a);
}

/**
 * Draws the die as a 3D cube. `model` rotates the die (e.g. mid-roll), `camera` is the view.
 * Faces are drawn with an affine transform, so the real face icons are reused.
 */
function drawCube3d(
  ctx: CanvasRenderingContext2D,
  die: DieState,
  cx: number,
  cy: number,
  size: number,
  camera: M3,
  model: M3 = rotZ(0),
  highlight: string | null = null,
): void {
  const faces = facesOf(die);
  const full = mm(camera, model);
  const light: V3 = [-0.4, 0.5, 0.77];
  const quads = Object.entries(SLOTS)
    .map(([slot, f]) => {
      const n = mul(full, f.n);
      return { slot, f, n, depth: n[2] };
    })
    .filter((q) => q.depth > 0.01)
    .sort((a, b) => a.depth - b.depth);
  for (const q of quads) {
    const c = mul(full, q.f.n.map((x) => x * 0.5) as V3);
    const u = mul(full, q.f.u.map((x) => x * 0.5) as V3);
    const v = mul(full, q.f.v.map((x) => x * 0.5) as V3);
    ctx.save();
    // Face space [-1,1]^2 -> screen: right = u, down = -v (canvas y points down).
    ctx.transform(
      u[0] * size,
      -u[1] * size,
      -v[0] * size,
      v[1] * size,
      cx + c[0] * size,
      cy - c[1] * size,
    );
    const face = faces[q.slot] ?? '';
    ctx.beginPath();
    ctx.rect(-1, -1, 2, 2);
    ctx.fillStyle = roleOf(face);
    ctx.fill();
    const lit = Math.max(0, q.n[0] * light[0] + q.n[1] * light[1] + q.n[2] * light[2]);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - lit)})`;
    ctx.fill();
    ctx.lineWidth = 0.09;
    ctx.strokeStyle = highlight === q.slot ? C.gold : C.outline;
    if (highlight === q.slot) ctx.lineWidth = 0.18;
    ctx.stroke();
    drawFace(ctx, face, 0, 0, 1.25);
    ctx.restore();
  }
}

/** Compass camera: looking down from the south-east, so top, south and east faces show. */
const COMPASS_CAM = mm(rotX(deg(-38)), rotZ(deg(-28)));

// ---------- flat cross (version 2 compass) ----------
function drawCross(
  ctx: CanvasRenderingContext2D,
  die: DieState,
  cx: number,
  cy: number,
  k = 1,
): void {
  const faces = facesOf(die);
  const gap = 23 * k;
  ctx.beginPath();
  ctx.roundRect(cx - 12 * k, cy - 12 * k, 24 * k, 24 * k, 5 * k);
  ctx.fillStyle = roleOf(faces.top ?? '');
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2 * k;
  ctx.stroke();
  drawFace(ctx, faces.top ?? '', cx, cy, 16 * k);
  for (const [slot, dx, dy] of [
    ['north', 0, -1],
    ['east', 1, 0],
    ['south', 0, 1],
    ['west', -1, 0],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx * gap, cy + dy * gap, 10 * k, 0, Math.PI * 2);
    ctx.fillStyle = roleOf(faces[slot] ?? '');
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5 * k;
    ctx.stroke();
    drawFace(ctx, faces[slot] ?? '', cx + dx * gap, cy + dy * gap, 14 * k);
  }
  const bx = cx + gap;
  const by = cy + gap - 2 * k;
  ctx.beginPath();
  ctx.arc(bx, by, 8 * k, 0, Math.PI * 2);
  ctx.fillStyle = '#16131f';
  ctx.fill();
  ctx.setLineDash([2 * k, 2 * k]);
  ctx.strokeStyle = roleOf(faces.bottom ?? '');
  ctx.lineWidth = 1.5 * k;
  ctx.stroke();
  ctx.setLineDash([]);
  drawFace(ctx, faces.bottom ?? '', bx, by, 11 * k);
}

// ---------- outcome of a roll (real rules) ----------
function describeRoll(s: GameState, dir: Dir): { text: string; color: string } {
  const r = step(rules, s, { type: 'move', dir });
  const target =
    s.tiles[(s.player.y + DIR_DELTA[dir].dy) * s.width + s.player.x + DIR_DELTA[dir].dx];
  if (!r.consumed)
    return {
      text: target === 'door' ? 'Locked: needs the Key leading' : 'Blocked',
      color: C.textDim,
    };
  const e = r.events;
  if (e.some((x) => x.type === 'killed')) return { text: 'Knocks out the skeleton', color: C.hurt };
  if (e.some((x) => x.type === 'opened'))
    return { text: 'Opens the chest: +30 gold', color: C.gold };
  if (e.some((x) => x.type === 'hurt' && x.source.kind === 'tile'))
    return { text: 'Spikes: -1 HP', color: C.hurt };
  return { text: 'Moves', color: C.text };
}

// ---------- scene helpers ----------
const DIR_NAME: Record<Dir, string> = { N: 'north', E: 'east', S: 'south', W: 'west' };

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string = C.textDim,
  size = 13,
  weight = 400,
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// ---------- A: filmstrip of the compass during a roll east ----------
function renderFilmstrip(): HTMLCanvasElement {
  const k = 3;
  const W = 5 * 130 + 20;
  const H = 210;
  const c = document.createElement('canvas');
  c.width = W * k;
  c.height = H * k;
  const ctx = c.getContext('2d')!;
  ctx.scale(k, k);
  ctx.fillStyle = '#0b0a10';
  ctx.fillRect(0, 0, W, H);
  const before = state.player.die;
  const after = rollDie(before, 'E');
  const frames: Array<[string, (x: number, y: number) => void]> = [
    ['Before', (x, y) => drawCross(ctx, before, x, y, 1.25)],
    ['Swipe: lifts into 3D', (x, y) => drawCube3d(ctx, before, x, y, 44, COMPASS_CAM)],
    [
      'Tumbles with the die',
      (x, y) => drawCube3d(ctx, before, x, y, 44, COMPASS_CAM, rollRotation('E', 0.5)),
    ],
    ['Landed', (x, y) => drawCube3d(ctx, before, x, y, 44, COMPASS_CAM, rollRotation('E', 1))],
    ['Settles back flat', (x, y) => drawCross(ctx, after, x, y, 1.25)],
  ];
  frames.forEach(([title, draw], i) => {
    const x = 10 + i * 130;
    ctx.fillStyle = C.hud;
    ctx.beginPath();
    ctx.roundRect(x, 30, 120, 140, 12);
    ctx.fill();
    draw(x + 60, 100);
    label(ctx, title, x + 60, 186, C.text, 11, 600);
    if (i < 4) label(ctx, '›', x + 125, 100, C.textDim, 22, 700);
  });
  label(
    ctx,
    'A · The compass tumbles with every roll (about 0.3 s), then settles back into the flat cross',
    W / 2,
    14,
    C.gold,
    13,
    700,
  );
  return c;
}

// ---------- B: inspect view ----------
function renderInspect(preview: Dir | null, spin: number): HTMLCanvasElement {
  const k = 3;
  const c = document.createElement('canvas');
  c.width = 340 * k;
  c.height = 480 * k;
  const ctx = c.getContext('2d')!;
  ctx.scale(k, k);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, 340, 480);
  drawBoard(ctx, rules, state, V, fx);
  ctx.fillStyle = 'rgba(8,6,12,0.82)';
  ctx.fillRect(0, 0, 340, 480);

  const cx = 170;
  const cy = 200;
  const die = state.player.die;
  const cam = mm(rotX(deg(-38)), rotZ(deg(-28 + spin)));
  label(ctx, preview ? `Preview: roll ${DIR_NAME[preview]}` : 'Your die', 170, 42, C.gold, 20, 800);
  label(
    ctx,
    preview ? 'Nothing happens until you swipe' : 'Drag to spin · tap an arrow to preview a roll',
    170,
    66,
    C.textDim,
    12,
  );
  if (preview) {
    drawCube3d(ctx, die, cx, cy, 100, cam, rollRotation(preview, 1), 'top');
  } else {
    drawCube3d(ctx, die, cx, cy, 100, cam);
  }

  // Arrows for the four roll directions.
  for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
    const { dx, dy } = DIR_DELTA[d];
    const x = cx + dx * 118;
    const y = cy + dy * 112;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = preview === d ? C.gold : '#221f2f';
    ctx.fill();
    ctx.strokeStyle = preview === d ? '#8a6414' : '#5b547a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-4, -7);
    ctx.lineTo(-4, 7);
    ctx.closePath();
    ctx.fillStyle = preview === d ? '#231a05' : C.text;
    ctx.fill();
    ctx.restore();
  }

  // Panel: what the preview would do.
  ctx.fillStyle = '#1d1a28';
  ctx.beginPath();
  ctx.roundRect(24, 346, 292, 96, 14);
  ctx.fill();
  ctx.strokeStyle = '#3a3550';
  ctx.stroke();
  if (preview) {
    const next = rollDie(die, preview);
    const f = facesOf(next);
    const out = describeRoll(state, preview);
    label(ctx, out.text, 170, 370, out.color, 15, 700);
    ctx.textAlign = 'left';
    for (const [i, [slotLabel, face]] of (
      [
        ['Top', f.top],
        ['Bottom', f.bottom],
      ] as const
    ).entries()) {
      const x = 62 + i * 130;
      drawFace(ctx, face ?? '', x, 408, 24);
      ctx.fillStyle = C.textDim;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(slotLabel, x + 18, 400);
      ctx.fillStyle = C.text;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(face ?? '', x + 18, 416);
    }
  } else {
    const f = facesOf(die);
    label(ctx, 'All six faces', 170, 368, C.text, 14, 700);
    const order = ['top', 'north', 'east', 'south', 'west', 'bottom'] as const;
    order.forEach((slot, i) => {
      const x = 48 + i * 49;
      ctx.beginPath();
      ctx.roundRect(x - 17, 382, 34, 34, 6);
      ctx.fillStyle = roleOf(f[slot] ?? '');
      ctx.fill();
      drawFace(ctx, f[slot] ?? '', x, 399, 24);
      label(ctx, slot, x, 428, C.textDim, 9);
    });
  }
  label(ctx, 'Tap outside to close', 170, 462, C.textDim, 11);
  return c;
}

// ---------- page ----------
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = 10;
canvas.height = 10;
const api = {
  filmstrip: () => renderFilmstrip().toDataURL(),
  inspect: (preview: Dir | null, spin: number) => renderInspect(preview, spin).toDataURL(),
};
(window as unknown as { mock: typeof api }).mock = api;
