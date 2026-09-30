/**
 * The static thumbnails and covers (Poki's 1080x1080 square, CrazyGames'
 * landscape, portrait and square covers), drawn with the game's own art: a
 * dungeon room with enemies closing in, the title, and the die burning in the
 * Ember skin. Rendered by tools/thumbnails/make.mjs; not part of the game.
 */
import '../../src/content/register';
import { Archer } from '../../src/content/enemies/archer';
import { Golem } from '../../src/content/enemies/golem';
import { Skeleton } from '../../src/content/enemies/skeleton';
import { Slime } from '../../src/content/enemies/slime';
import { Floor, Wall } from '../../src/content/tiles/basic';
import { Exit } from '../../src/content/tiles/exit';
import { Gem } from '../../src/content/tiles/gem';
import { Spikes } from '../../src/content/tiles/spikes';
import type { EnemyDef, TileDef } from '../../src/engine/registry';
import { drawEnemy, drawTile } from '../../src/game/view/art';
import { drawDieCube } from '../../src/game/view/cube';
import { SKINS } from '../../src/meta/skins';

/** Size in pixels: ?w=&h= (default 1080x1080, Poki's square). */
const params = new URLSearchParams(location.search);
const W = Number(params.get('w')) || 1080;
const H = Number(params.get('h')) || 1080;
const canvas = document.getElementById('thumb') as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
const ctx = canvas.getContext('2d')!;
/**
 * The shorter side is 360 logical units (9 tiles of 40), or 300 on a tall
 * cover so the die stays big; the room fills the rest.
 */
const K = Math.min(W, H) / (H > W * 1.3 ? 300 : 360);
const T = 40;
const LW = W / K;
const LH = H / K;

const TILES: Record<string, TileDef> = { '#': Wall, '.': Floor, '^': Spikes, '*': Gem, E: Exit };
/** Room size in tiles (odd, so there's a middle column), centred on the canvas. */
const COLS = Math.ceil(LW / T / 2) * 2 + 1;
const ROWS = Math.ceil(LH / T);
const OX = (LW - COLS * T) / 2;
const MID = (COLS - 1) / 2;
/** The die: in the middle, a little below centre (under the title). */
const DIE = { x: LW / 2, y: LH * (H > W ? 0.6 : 0.62) };
const DIE_TY = Math.floor(DIE.y / T);
/** Things around the die, as [column, row] offsets from its tile. */
const SPIKES: ReadonlyArray<[number, number]> = [
  [-3, 0],
  [3, 0],
  [-3, 2],
  [3, 2],
];
const GEM: [number, number] = [-1, -2];
type Foe = readonly [EnemyDef, number, number];
const FOES: readonly Foe[] = [
  [Skeleton, -3, -1],
  [Archer, 3, -2],
  [Slime, -2, 2],
  [Golem, 2, 2],
  // Wider or taller covers: more of the dungeon closing in.
  ...(W > H * 1.3
    ? ([
        [Skeleton, 6, 0],
        [Slime, -6, 1],
      ] satisfies Foe[])
    : []),
  ...(H > W * 1.3
    ? ([
        [Skeleton, 2, 4],
        [Archer, -2, 4],
      ] satisfies Foe[])
    : []),
];

function roomChar(tx: number, ty: number): string {
  if (ty === ROWS - 1) return tx === MID ? 'E' : '#';
  if (tx === 0 || tx === COLS - 1 || ty === 0) return '#';
  const d = [tx - MID, ty - DIE_TY];
  if (SPIKES.some(([a, b]) => a === d[0] && b === d[1])) return '^';
  if (GEM[0] === d[0] && GEM[1] === d[1]) return '*';
  return '.';
}

function main(): void {
  ctx.save();
  ctx.scale(K, K);
  ctx.translate(OX, 0);
  for (let ty = 0; ty < ROWS; ty++)
    for (let tx = 0; tx < COLS; tx++)
      drawTile(ctx, TILES[roomChar(tx, ty)]!, tx * T, ty * T, T, tx, ty, 0.3);
  ctx.translate(-OX, 0);
  // Darken the top for the title, and the edges.
  const top = ctx.createLinearGradient(0, 0, 0, 170);
  top.addColorStop(0, 'rgba(12,10,18,0.92)');
  top.addColorStop(1, 'rgba(12,10,18,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, LW, 170);
  const v = ctx.createRadialGradient(DIE.x, DIE.y, 60, DIE.x, DIE.y, Math.max(LW, LH) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, LW, LH);

  // Enemies, a little larger than on the board, all eyes on the die.
  FOES.forEach(([def, dx, dy], id) => {
    const tx = MID + dx;
    const ty = DIE_TY + dy;
    const cx = OX + tx * T + T / 2;
    const cy = ty * T + T / 2;
    const d = Math.hypot(DIE.x - cx, DIE.y - cy);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.5, 1.5);
    drawEnemy(
      ctx,
      def,
      { id, kind: def.kind, x: tx, y: ty, hp: def.hp, data: {}, effects: [] },
      0,
      0,
      { lookX: (DIE.x - cx) / d, lookY: (DIE.y - cy) / d, flash: 0, t: 0.4 + id },
      false,
    );
    ctx.restore();
  });

  // The die, big, in the Ember skin, with a warm glow under it.
  const glow = ctx.createRadialGradient(DIE.x, DIE.y, 5, DIE.x, DIE.y, 120);
  glow.addColorStop(0, 'rgba(255,150,60,0.45)');
  glow.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, LW, LH);
  ctx.save();
  ctx.translate(DIE.x, DIE.y);
  ctx.scale(2, 2);
  const ember = SKINS.find((s) => s.id === 'ember')!;
  drawDieCube(
    ctx,
    { shape: 'd6', loadout: ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Coin'], orient: 4 },
    4,
    0,
    0,
    { sx: 1, sy: 1, flash: 0 },
    false,
    ember,
  );
  ctx.restore();
  ctx.restore();

  // Title.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 28;
  ctx.fillStyle = '#f3ead2';
  // Sized in logical units: 128 and 150 px on Poki's 1080 square.
  ctx.font = `900 ${(128 / 3) * K}px system-ui, sans-serif`;
  ctx.fillText('Six Sided', W / 2, (130 / 3) * K);
  ctx.fillStyle = '#ffd75e';
  ctx.font = `900 ${(150 / 3) * K}px system-ui, sans-serif`;
  ctx.fillText('Knight', W / 2, (262 / 3) * K);
  ctx.shadowBlur = 0;
  (window as unknown as { thumbReady: boolean }).thumbReady = true;
}
main();
