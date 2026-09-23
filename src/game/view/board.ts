/** Draws the board, entities and effects from a GameState plus event-driven visuals. */
import { TurnContext, type Dir, type GameState, type Pos, type Rules } from '../../engine';
import { ANIMATED_TILES, drawEnemy, drawTile } from './art';
import { drawDieCube } from './cube';
import type { Fx, Visuals } from './fx';
import { BOARD_X, BOARD_Y, TILE, tileCenter } from './layout';
import { drawOutcomeChips, type Outcome } from './outcome';
import { C } from './palette';

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
  outcomes?: ReadonlyArray<readonly [Dir, Outcome]>,
): void {
  const t = fx.time;
  ctx.save();
  ctx.translate(v.shakeX, v.shakeY);

  // Tiles: the static ones come from a cached image (redrawn only when tiles
  // change); animated tiles and tiles still showing their old look are drawn on top.
  ctx.drawImage(boardLayer(ctx, rules, state), BOARD_X, BOARD_Y, 8 * TILE, 9 * TILE);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const ghost = fx.tileGhosts.find((g) => g.x === x && g.y === y);
      const id = ghost ? ghost.tile : state.tiles[y * state.width + x]!;
      if (!ghost && !ANIMATED_TILES.has(id)) continue;
      if (isVoid(state, x, y)) continue;
      drawTile(ctx, rules.tiles.get(id), BOARD_X + x * TILE, BOARD_Y + y * TILE, TILE, x, y, t);
    }
  }

  if (state.status === 'playing') drawDangerLanes(ctx, rules, state, t);

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

  // The die, as a cube seen from above, with what each move would do.
  const orient = v.player.orient ?? p.die.orient;
  const moving = v.player.orient !== null;
  drawDieCube(
    ctx,
    p.die,
    orient,
    px,
    py,
    { sx: v.player.sx, sy: v.player.sy, flash: v.player.flash },
    !moving,
  );
  if (outcomes && !moving && state.status === 'playing') drawOutcomeChips(ctx, outcomes, px, py);

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

/** Cached image of the board's tiles at the current pixel density. */
let layer: { tiles: readonly string[]; k: number; canvas: HTMLCanvasElement } | null = null;

function boardLayer(
  ctx: CanvasRenderingContext2D,
  rules: Rules,
  state: GameState,
): HTMLCanvasElement {
  const k = ctx.getTransform().a; // device pixels per logical pixel
  if (layer && layer.tiles === state.tiles && layer.k === k) return layer.canvas;
  const canvas = layer?.canvas ?? document.createElement('canvas');
  canvas.width = Math.round(8 * TILE * k);
  canvas.height = Math.round(9 * TILE * k);
  const c = canvas.getContext('2d')!;
  c.setTransform(k, 0, 0, k, -BOARD_X * k, -BOARD_Y * k);
  c.clearRect(BOARD_X, BOARD_Y, 8 * TILE, 9 * TILE);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const id = state.tiles[y * state.width + x]!;
      if (isVoid(state, x, y)) continue; // solid rock nobody can see into
      drawTile(c, rules.tiles.get(id), BOARD_X + x * TILE, BOARD_Y + y * TILE, TILE, x, y, 0);
    }
  }
  layer = { tiles: state.tiles, k, canvas };
  return canvas;
}

/** Tiles ranged enemies (archers) will shoot next turn: a red wash with arrow ticks. */
let dangerCache: { state: GameState; tiles: Pos[] } | null = null;

export function dangerTiles(rules: Rules, state: GameState): Pos[] {
  if (dangerCache?.state === state) return dangerCache.tiles;
  const out: Pos[] = [];
  let ctx: TurnContext | null = null;
  for (const e of state.enemies) {
    const def = rules.enemies.get(e.kind);
    if (!def.dangerTiles) continue;
    // An enemy under a turn-skipping effect (frozen) won't shoot.
    if (e.effects.some((f) => rules.effects.get(f.id).onEnemyTurn)) continue;
    ctx ??= new TurnContext(rules, state);
    out.push(...def.dangerTiles(ctx, e));
  }
  dangerCache = { state, tiles: out };
  return out;
}

function drawDangerLanes(ctx: CanvasRenderingContext2D, rules: Rules, s: GameState, t: number) {
  const tiles = dangerTiles(rules, s);
  if (tiles.length === 0) return;
  ctx.save();
  ctx.fillStyle = C.danger;
  ctx.strokeStyle = `rgba(255,90,106,${0.35 + 0.15 * Math.sin(t * 4)})`;
  ctx.lineWidth = 1.2;
  for (const p of tiles) {
    const x = BOARD_X + p.x * TILE;
    const y = BOARD_Y + p.y * TILE;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.beginPath();
    ctx.moveTo(x + TILE / 2 - 4, y + TILE / 2);
    ctx.lineTo(x + TILE / 2 + 4, y + TILE / 2);
    ctx.moveTo(x + TILE / 2, y + TILE / 2 - 4);
    ctx.lineTo(x + TILE / 2, y + TILE / 2 + 4);
    ctx.stroke();
  }
  ctx.restore();
}

export { drawCompass, facesOf } from './cube';
