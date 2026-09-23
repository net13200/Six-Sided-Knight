/**
 * Die mockups, version 2: ideas 1 + 2 + 3 + 5 together.
 *  1. the die as a cube seen from above (slightly larger than its tile, bigger side icons)
 *  2. the outcome of each move next to the die (smaller, semi-transparent labels)
 *  3. the bottom face, peeking out at the die's lower-right corner (and in the compass)
 *  5. faces tinted by role: attack warm, defence blue, heal green, tools gold
 * Rendered with the real game art and rules. Not shipped.
 */
import { defaultRules } from '../src/content/register';
import {
  createState,
  DIR_DELTA,
  DIRS,
  step,
  type Dir,
  type GameState,
  type LevelData,
} from '../src/engine';
import { drawFace } from '../src/game/view/art';
import { drawBoard, drawCompass, facesOf } from '../src/game/view/board';
import { Fx } from '../src/game/view/fx';
import { BAR_Y, TILE, tileCenter } from '../src/game/view/layout';
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

// ---------- idea 5: role colours ----------
const ROLE: Record<string, string> = {
  Sword: '#f4b39c', // attack
  Bomb: '#f4b39c', // attack
  Shield: '#b3cff5', // defence
  Heart: '#b8e6b9', // heal
  Key: '#f1d78e', // tools
  Coin: '#f1d78e', // tools
};
const roleOf = (face: string) => ROLE[face] ?? '#d9d2e8';

/** Per-side light: the light comes from the top-left. */
const LIGHT: Record<string, string> = {
  north: 'rgba(255,255,255,0.30)',
  west: 'rgba(255,255,255,0.12)',
  east: 'rgba(0,0,0,0.10)',
  south: 'rgba(0,0,0,0.22)',
};

// ---------- ideas 1 + 3 + 5: the cube ----------
function drawCubeV2(ctx: CanvasRenderingContext2D, s: GameState, cx: number, cy: number): void {
  const faces = facesOf(s.player.die);
  const R = 22; // 2px larger than half a tile: nothing else is drawn at the die's edges
  const r = 9.5;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(cx - R + 3, cy - R + 5, R * 2, R * 2, 7);
  ctx.fill();

  const sides: Array<[string, number, number]> = [
    ['north', 0, -1],
    ['east', 1, 0],
    ['south', 0, 1],
    ['west', -1, 0],
  ];
  for (const [slot, dx, dy] of sides) {
    const face = faces[slot] ?? '';
    const pts: Array<[number, number]> =
      dx === 0
        ? [
            [cx - r, cy + dy * r],
            [cx + r, cy + dy * r],
            [cx + R, cy + dy * R],
            [cx - R, cy + dy * R],
          ]
        : [
            [cx + dx * r, cy - r],
            [cx + dx * r, cy + r],
            [cx + dx * R, cy + R],
            [cx + dx * R, cy - R],
          ];
    const path = () => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };
    path();
    ctx.fillStyle = roleOf(face);
    ctx.fill();
    path();
    ctx.fillStyle = LIGHT[slot]!;
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const mid = (r + R) / 2;
    ctx.save();
    ctx.translate(cx + dx * mid, cy + dy * mid);
    if (dx === 0) ctx.scale(1, 0.8);
    else ctx.scale(0.8, 1);
    drawFace(ctx, face, 0, 0, 15);
    ctx.restore();
  }

  // Top face
  ctx.beginPath();
  ctx.roundRect(cx - r, cy - r, r * 2, r * 2, 3);
  ctx.fillStyle = roleOf(faces.top ?? '');
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawFace(ctx, faces.top ?? '', cx, cy, 16);
  ctx.beginPath();
  ctx.roundRect(cx - R, cy - R, R * 2, R * 2, 6);
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2;
  ctx.stroke();

  drawBottomBadge(ctx, faces.bottom ?? '', cx + R - 1, cy + R - 1, 7.5);
}

/** Idea 3: the face underneath, as a dashed "under the die" badge. */
function drawBottomBadge(
  ctx: CanvasRenderingContext2D,
  face: string,
  x: number,
  y: number,
  rad: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fillStyle = '#16131f';
  ctx.fill();
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = roleOf(face);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  drawFace(ctx, face, x, y, rad * 1.35);
}

// ---------- idea 2: outcomes ----------
type Outcome = { label: string; color: string; icon?: 'skull' | 'check' | 'heart' } | null;

function predict(s: GameState, dir: Dir): Outcome {
  const r = step(rules, s, { type: 'move', dir });
  if (!r.consumed) {
    const t = s.tiles[(s.player.y + DIR_DELTA[dir].dy) * s.width + s.player.x + DIR_DELTA[dir].dx];
    return t === 'wall' ? null : { label: '✕', color: '#8d86a0' };
  }
  const own = r.events.filter(
    (e) => !['enemyMoved', 'enemyAttacked', 'enemyWaited'].includes(e.type),
  );
  if (own.some((e) => e.type === 'killed')) return { label: 'KO', color: C.hurt, icon: 'skull' };
  const hit = own.find((e) => e.type === 'attacked' && !e.splash);
  if (hit?.type === 'attacked') {
    return hit.damage > 0
      ? { label: `-${hit.damage}`, color: '#ff9d3a' }
      : { label: '0', color: '#8d86a0' };
  }
  if (own.some((e) => e.type === 'opened')) return { label: '+30', color: C.gold, icon: 'check' };
  if (own.some((e) => e.type === 'unlocked'))
    return { label: 'open', color: C.heal, icon: 'check' };
  const hurt = own.find((e) => e.type === 'hurt' && e.source.kind === 'tile');
  if (hurt?.type === 'hurt') return { label: `-${hurt.amount}`, color: C.hurt, icon: 'heart' };
  const heal = own.find((e) => e.type === 'healed');
  if (heal?.type === 'healed') return { label: `+${heal.amount}`, color: C.heal, icon: 'heart' };
  if (own.some((e) => e.type === 'won')) return { label: 'exit', color: C.gold };
  return null;
}

function drawOutcomesV2(ctx: CanvasRenderingContext2D, s: GameState, cx: number, cy: number): void {
  for (const dir of DIRS) {
    const o = predict(s, dir);
    if (!o) continue;
    const { dx, dy } = DIR_DELTA[dir];
    const x = cx + dx * 28;
    const y = cy + dy * 28;
    ctx.font = 'bold 8px system-ui, sans-serif';
    const w = Math.max(14, ctx.measureText(o.label).width + (o.icon ? 15 : 8));
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 6, w, 12, 6);
    ctx.fillStyle = '#0c0a12';
    ctx.fill();
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    let tx = x;
    if (o.icon) {
      const ix = x - w / 2 + 7;
      if (o.icon === 'heart') drawFace(ctx, 'Heart', ix, y, 7.5);
      else if (o.icon === 'check') {
        ctx.strokeStyle = o.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(ix - 3.5, y);
        ctx.lineTo(ix - 1, y + 2.5);
        ctx.lineTo(ix + 3.5, y - 2.5);
        ctx.stroke();
      } else {
        ctx.fillStyle = C.skeleton;
        ctx.beginPath();
        ctx.arc(ix, y - 1, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(ix - 2, y + 1, 4, 2.5);
        ctx.fillStyle = '#231d2b';
        ctx.fillRect(ix - 2, y - 2, 1.5, 1.5);
        ctx.fillRect(ix + 0.5, y - 2, 1.5, 1.5);
      }
      tx = x + 3.5;
    }
    ctx.fillStyle = o.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.label, tx, y + 0.5);
  }
}

// ---------- compass v2: tinted faces + the bottom face ----------
function drawCompassV2(ctx: CanvasRenderingContext2D, s: GameState, cx: number, cy: number): void {
  const faces = facesOf(s.player.die);
  const gap = 23;
  ctx.beginPath();
  ctx.roundRect(cx - 12, cy - 12, 24, 24, 5);
  ctx.fillStyle = roleOf(faces.top ?? '');
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawFace(ctx, faces.top ?? '', cx, cy, 16);
  for (const [slot, dx, dy] of [
    ['north', 0, -1],
    ['east', 1, 0],
    ['south', 0, 1],
    ['west', -1, 0],
  ] as const) {
    const x = cx + dx * gap;
    const y = cy + dy * gap;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fillStyle = roleOf(faces[slot] ?? '');
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawFace(ctx, faces[slot] ?? '', x, y, 14);
  }
  drawBottomBadge(ctx, faces.bottom ?? '', cx + gap, cy + gap - 2, 8);
}

// ---------- rendering ----------
type Variant = 'today' | 'v1' | 'v2';

function drawButtons(ctx: CanvasRenderingContext2D): void {
  const y = BAR_Y + 3;
  for (const [x, label] of [
    [4, 'Undo'],
    [70, 'Retry'],
    [206, 'Menu'],
    [272, 'Sound'],
  ] as const) {
    ctx.beginPath();
    ctx.roundRect(x, y, 64, 62, 12);
    ctx.fillStyle = '#221f2f';
    ctx.fill();
    ctx.strokeStyle = '#3a3550';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + 32, y + 44);
  }
}

function renderScreen(variant: Variant): HTMLCanvasElement {
  const k = 4;
  const c = document.createElement('canvas');
  c.width = 340 * k;
  c.height = 480 * k;
  const ctx = c.getContext('2d')!;
  ctx.scale(k, k);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, 340, 480);
  const p = tileCenter(state.player.x, state.player.y);
  if (variant === 'today') {
    drawBoard(ctx, rules, state, V, fx);
    drawCompass(ctx, state.player.die, 170, BAR_Y + 34);
  } else {
    drawBoard(ctx, rules, { ...state, player: { ...state.player, x: -20, y: -20 } }, V, fx);
    if (variant === 'v1') {
      drawCompass(ctx, state.player.die, 170, BAR_Y + 34);
    } else {
      drawCubeV2(ctx, state, p.x, p.y);
      drawOutcomesV2(ctx, state, p.x, p.y);
      drawCompassV2(ctx, state, 170, BAR_Y + 34);
    }
  }
  drawButtons(ctx);
  return c;
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const PANEL = 360;
canvas.width = PANEL * 2 + 30;
canvas.height = PANEL + 90;
ctx.fillStyle = '#0b0a10';
ctx.fillRect(0, 0, canvas.width, canvas.height);
const p = tileCenter(state.player.x, state.player.y);
(
  [
    ['today', 'Today', 'Flat square + tiny badges'],
    ['v2', 'Version 2', 'Cube + outcomes + bottom face + role colours'],
  ] as const
).forEach(([variant, title, sub], i) => {
  const screen = renderScreen(variant);
  const span = TILE * 3;
  const x0 = 10 + i * (PANEL + 10);
  ctx.drawImage(
    screen,
    (p.x - span / 2) * 4,
    (p.y - span / 2) * 4,
    span * 4,
    span * 4,
    x0,
    70,
    PANEL,
    PANEL,
  );
  ctx.fillStyle = C.gold;
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, x0 + 4, 30);
  ctx.fillStyle = C.textDim;
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(sub, x0 + 4, 54);
});

(window as unknown as { screen2: (v: string) => string }).screen2 = (v: string) =>
  renderScreen(v as Variant).toDataURL();
