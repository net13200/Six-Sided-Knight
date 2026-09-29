/**
 * The static Poki thumbnail (1080x1080), drawn with the game's own art: a
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

const canvas = document.getElementById('thumb') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const S = 1080;
/** The room is 9x9 tiles of 40 logical units, drawn at 3x. */
const K = S / 360;
const T = 40;

const TILES: Record<string, TileDef> = { '#': Wall, '.': Floor, '^': Spikes, '*': Gem, E: Exit };
const ROOM = [
  '#########',
  '#.......#',
  '#.......#',
  '#..*....#',
  '#.......#',
  '#^.....^#',
  '#.......#',
  '#^.....^#',
  '####E####',
];
const DIE = { x: 180, y: 222 };
const FOES: ReadonlyArray<[EnemyDef, number, number]> = [
  [Skeleton, 1, 4],
  [Archer, 7, 3],
  [Slime, 2, 7],
  [Golem, 6, 7],
];

function main(): void {
  ctx.save();
  ctx.scale(K, K);
  ROOM.forEach((row, ty) =>
    [...row].forEach((ch, tx) => drawTile(ctx, TILES[ch]!, tx * T, ty * T, T, tx, ty, 0.3)),
  );
  // Darken the top for the title, and the edges.
  const top = ctx.createLinearGradient(0, 0, 0, 170);
  top.addColorStop(0, 'rgba(12,10,18,0.92)');
  top.addColorStop(1, 'rgba(12,10,18,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, 360, 170);
  const v = ctx.createRadialGradient(DIE.x, DIE.y, 60, DIE.x, DIE.y, 260);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 360, 360);

  // Enemies, a little larger than on the board, all eyes on the die.
  FOES.forEach(([def, tx, ty], id) => {
    const cx = tx * T + T / 2;
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
  ctx.fillRect(0, 0, 360, 360);
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
  ctx.font = '900 128px system-ui, sans-serif';
  ctx.fillText('Six Sided', S / 2, 130);
  ctx.fillStyle = '#ffd75e';
  ctx.font = '900 150px system-ui, sans-serif';
  ctx.fillText('Knight', S / 2, 262);
  ctx.shadowBlur = 0;
  (window as unknown as { thumbReady: boolean }).thumbReady = true;
}
main();
