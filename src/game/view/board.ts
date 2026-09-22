/** Draws the board, entities and effects from a GameState plus event-driven visuals. */
import { faceInSlot, getShape, type DieState, type GameState, type Rules } from '../../engine';
import { drawBadge, drawDieBody, drawEnemy, drawFace, drawTile } from './art';
import type { Fx, Visuals } from './fx';
import { BOARD_X, BOARD_Y, TILE, tileCenter } from './layout';
import { C } from './palette';

const SIDE_SLOTS = [
  ['north', 0, -1],
  ['east', 1, 0],
  ['south', 0, 1],
  ['west', -1, 0],
] as const;

export function facesOf(die: DieState, orient = die.orient): Record<string, string> {
  const shape = getShape(die.shape);
  const d = { ...die, orient };
  const out: Record<string, string> = {};
  shape.def.slots.forEach((name, slot) => (out[name] = faceInSlot(d, slot)));
  return out;
}

/** A wall with no non-wall tile around it (8-neighbourhood) is drawn as empty darkness. */
function isVoid(state: GameState, x: number, y: number): boolean {
  const wall = 'wall';
  if (state.tiles[y * state.width + x] !== wall) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      if (state.tiles[ny * state.width + nx] !== wall) return false;
    }
  }
  return true;
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  rules: Rules,
  state: GameState,
  v: Visuals,
  fx: Fx,
): void {
  const t = fx.time;
  ctx.save();
  ctx.translate(v.shakeX, v.shakeY);

  // Tiles
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const ghost = fx.tileGhosts.find((g) => g.x === x && g.y === y);
      const id = ghost ? ghost.tile : state.tiles[y * state.width + x]!;
      if (isVoid(state, x, y)) continue; // solid rock nobody can see into
      drawTile(ctx, rules.tiles.get(id), BOARD_X + x * TILE, BOARD_Y + y * TILE, TILE, x, y, t);
    }
  }

  const p = state.player;
  const pc = tileCenter(p.x, p.y);
  const px = pc.x + v.player.dx;
  const py = pc.y + v.player.dy;

  // Enemies
  for (const e of state.enemies) {
    const ev = v.enemies.get(e.id);
    const c = tileCenter(e.x, e.y);
    const ex = c.x + (ev?.dx ?? 0);
    const ey = c.y + (ev?.dy ?? 0);
    const len = Math.hypot(px - ex, py - ey) || 1;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(ev?.sx ?? 1, ev?.sy ?? 1);
    drawEnemy(ctx, rules.enemies.get(e.kind), e, 0, 0, {
      lookX: (px - ex) / len,
      lookY: (py - ey) / len,
      flash: ev?.flash ?? 0,
      t,
    });
    ctx.restore();
  }
  for (const g of fx.ghosts) {
    const dying = t >= g.dieAt;
    const k = dying ? Math.max(0, 1 - (t - g.dieAt) / (g.end - g.dieAt)) : 1;
    const ev = v.enemies.get(g.enemy.id);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(g.x, g.y);
    ctx.scale(k, k);
    drawEnemy(
      ctx,
      rules.enemies.get(g.enemy.kind),
      g.enemy,
      0,
      0,
      { lookX: 0, lookY: 1, flash: dying ? 1 : (ev?.flash ?? 0), t },
      !dying,
    );
    ctx.restore();
  }

  // The die
  const orient = v.player.orient ?? p.die.orient;
  const faces = facesOf(p.die, orient);
  const w = 32 * v.player.sx;
  const h = 32 * v.player.sy;
  drawDieBody(ctx, px, py, w, h);
  drawFace(ctx, faces.top ?? '', px, py - 1, 21 * Math.min(v.player.sx, v.player.sy));
  if (v.player.flash > 0) {
    ctx.save();
    ctx.globalAlpha = v.player.flash * 0.6;
    ctx.fillStyle = C.hurt;
    ctx.beginPath();
    ctx.roundRect(px - w / 2, py - h / 2, w, h, 6);
    ctx.fill();
    ctx.restore();
  }
  // Leading-face badges: which face hits in each direction.
  const moving = v.player.orient !== null;
  if (!moving && state.status === 'playing') {
    for (const [slot, dx, dy] of SIDE_SLOTS) {
      drawBadge(ctx, faces[slot] ?? '', px + dx * 19, py + dy * 19, 6.5);
    }
  }

  fx.drawParticles(ctx);
  fx.drawFloaters(ctx);
  ctx.restore();

  if (v.screenFlash > 0) {
    ctx.save();
    ctx.globalAlpha = v.screenFlash;
    ctx.fillStyle = v.screenColor;
    ctx.fillRect(BOARD_X, BOARD_Y, 8 * TILE, 9 * TILE);
    ctx.restore();
  }
}

/** The "compass": top face in the middle, the leading face for each direction around it. */
export function drawCompass(
  ctx: CanvasRenderingContext2D,
  die: DieState,
  cx: number,
  cy: number,
): void {
  const faces = facesOf(die);
  const gap = 23;
  drawDieBody(ctx, cx, cy, 24, 24);
  drawFace(ctx, faces.top ?? '', cx, cy - 1, 16);
  for (const [slot, dx, dy] of SIDE_SLOTS) {
    drawBadge(ctx, faces[slot] ?? '', cx + dx * gap, cy + dy * gap, 10);
  }
}
