/** Mockups of die designs, rendered with the real game art and rules. Not shipped. */
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
import { drawBoard, facesOf } from '../src/game/view/board';
import { Fx } from '../src/game/view/fx';
import { TILE, tileCenter } from '../src/game/view/layout';
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

// ---------- idea 1: the die as a cube seen from above ----------
const SHADE: Record<string, string> = {
  north: '#fbf4e2',
  east: '#ddd0b0',
  south: '#c7b995',
  west: '#e9dfc4',
};

function drawCube(ctx: CanvasRenderingContext2D, s: GameState, cx: number, cy: number): void {
  const faces = facesOf(s.player.die);
  const R = 19; // outer half-size: the die's footprint
  const r = 9; // top face half-size
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.roundRect(cx - R + 2, cy - R + 4, R * 2, R * 2, 6);
  ctx.fill();
  const sides: Array<[string, number, number]> = [
    ['north', 0, -1],
    ['east', 1, 0],
    ['south', 0, 1],
    ['west', -1, 0],
  ];
  for (const [slot, dx, dy] of sides) {
    // Trapezoid between the top face edge and the outer edge on this side.
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
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = SHADE[slot]!;
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Face icon on the side panel, squashed toward the edge like it's tilted away.
    const mid = (r + R) / 2;
    ctx.save();
    ctx.translate(cx + dx * mid, cy + dy * mid);
    if (dx === 0) ctx.scale(1, 0.7);
    else ctx.scale(0.7, 1);
    drawFace(ctx, faces[slot] ?? '', 0, 0, 11);
    ctx.restore();
  }
  // Top face
  ctx.beginPath();
  ctx.roundRect(cx - r, cy - r, r * 2, r * 2, 3);
  ctx.fillStyle = C.dieBody;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawFace(ctx, faces.top ?? '', cx, cy, 15);
  // Outer outline
  ctx.beginPath();
  ctx.roundRect(cx - R, cy - R, R * 2, R * 2, 5);
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ---------- idea 2: outcome of each move, shown next to the die ----------
type Outcome = { label: string; color: string; icon?: string } | null;

export function predict(s: GameState, dir: Dir): Outcome {
  const r = step(rules, s, { type: 'move', dir });
  if (!r.consumed) {
    const t = s.tiles[(s.player.y + DIR_DELTA[dir].dy) * s.width + s.player.x + DIR_DELTA[dir].dx];
    return t === 'wall' ? null : { label: '✕', color: '#8d86a0' }; // walls are obvious; doors/chests aren't
  }
  const ev = r.events;
  const player = ev.filter(
    (e) => e.type !== 'enemyMoved' && e.type !== 'enemyAttacked' && e.type !== 'enemyWaited',
  );
  if (player.some((e) => e.type === 'killed')) return { label: 'KO', color: C.hurt, icon: 'skull' };
  const hit = player.find((e) => e.type === 'attacked' && !e.splash);
  if (hit && hit.type === 'attacked')
    return hit.damage > 0
      ? { label: `-${hit.damage}`, color: '#ff9d3a' }
      : { label: '0', color: '#8d86a0' };
  if (player.some((e) => e.type === 'opened'))
    return { label: '+30', color: C.gold, icon: 'check' };
  if (player.some((e) => e.type === 'unlocked'))
    return { label: 'open', color: C.heal, icon: 'check' };
  const hurt = player.find((e) => e.type === 'hurt' && e.source.kind === 'tile');
  if (hurt && hurt.type === 'hurt')
    return { label: `-${hurt.amount}`, color: C.hurt, icon: 'heart' };
  const heal = player.find((e) => e.type === 'healed');
  if (heal && heal.type === 'healed')
    return { label: `+${heal.amount}`, color: C.heal, icon: 'heart' };
  if (player.some((e) => e.type === 'won')) return { label: 'exit', color: C.gold };
  return null; // a plain move: no marker, keeps the board calm
}

function drawOutcomes(ctx: CanvasRenderingContext2D, s: GameState, cx: number, cy: number): void {
  for (const dir of DIRS) {
    const o = predict(s, dir);
    if (!o) continue;
    const { dx, dy } = DIR_DELTA[dir];
    // Straddle the tile edge so the chip never hides what it describes.
    const x = cx + dx * 25;
    const y = cy + dy * 25;
    ctx.font = 'bold 8.5px system-ui, sans-serif';
    const w = Math.max(15, ctx.measureText(o.label).width + (o.icon ? 16 : 8));
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 6.5, w, 13, 6.5);
    ctx.fillStyle = 'rgba(12,10,18,0.92)';
    ctx.fill();
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    let tx = x;
    if (o.icon) {
      const ix = x - w / 2 + 7.5;
      if (o.icon === 'heart') drawFace(ctx, 'Heart', ix, y, 8);
      else if (o.icon === 'check') {
        ctx.strokeStyle = o.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ix - 4, y);
        ctx.lineTo(ix - 1, y + 3);
        ctx.lineTo(ix + 4, y - 3);
        ctx.stroke();
      } else if (o.icon === 'skull') {
        ctx.fillStyle = C.skeleton;
        ctx.beginPath();
        ctx.arc(ix, y - 1, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(ix - 2.5, y + 1, 5, 3);
        ctx.fillStyle = '#231d2b';
        ctx.fillRect(ix - 2.5, y - 2, 1.8, 1.8);
        ctx.fillRect(ix + 0.7, y - 2, 1.8, 1.8);
      }
      tx = x + 4;
    }
    ctx.fillStyle = o.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.label, tx, y + 0.5);
  }
}

// ---------- rendering ----------
function renderBoard(variant: 'current' | 'cube' | 'cube+outcomes'): HTMLCanvasElement {
  const k = 4;
  const c = document.createElement('canvas');
  c.width = 340 * k;
  c.height = 480 * k;
  const ctx = c.getContext('2d')!;
  ctx.scale(k, k);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, 340, 480);
  if (variant === 'current') {
    drawBoard(ctx, rules, state, V, fx);
  } else {
    // Board without the old die: draw it with the player parked in a corner wall, then repaint it.
    // Board without the old die: park the player far off-canvas.
    const hidden = { ...state, player: { ...state.player, x: -20, y: -20 } };
    drawBoard(ctx, rules, hidden, V, fx);
    const p = tileCenter(state.player.x, state.player.y);
    drawCube(ctx, state, p.x, p.y);
    if (variant === 'cube+outcomes') drawOutcomes(ctx, state, p.x, p.y);
  }
  return c;
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const PANEL = 360;
const panels: Array<['current' | 'cube' | 'cube+outcomes', string, string]> = [
  ['current', 'Today', 'Flat square + tiny badges'],
  ['cube', 'Idea 1', 'Cube seen from above'],
  ['cube+outcomes', 'Idea 1 + 2', 'Cube + what each move does'],
];
canvas.width = PANEL * 3 + 40;
canvas.height = PANEL + 90;
ctx.fillStyle = '#0b0a10';
ctx.fillRect(0, 0, canvas.width, canvas.height);
panels.forEach(([variant, title, sub], i) => {
  const board = renderBoard(variant);
  const p = tileCenter(state.player.x, state.player.y);
  const span = TILE * 3; // 3x3 tiles around the die
  const sx = (p.x - span / 2) * 4;
  const sy = (p.y - span / 2) * 4;
  const x0 = 10 + i * (PANEL + 10);
  ctx.drawImage(board, sx, sy, span * 4, span * 4, x0, 70, PANEL, PANEL);
  ctx.fillStyle = C.gold;
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, x0 + 4, 30);
  ctx.fillStyle = C.textDim;
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(sub, x0 + 4, 54);
});

// Expose full-board renders for the phone-size screenshot.
(window as unknown as { full: (v: string) => string }).full = (v: string) =>
  renderBoard(v as 'cube+outcomes').toDataURL();
