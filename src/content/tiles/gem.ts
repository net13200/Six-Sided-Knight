import type { TileDef } from '../../engine/registry';

export const Gem: TileDef = {
  id: 'gem',
  name: 'Gem',
  glyph: '*',
  passable: true,
  enemyPassable: true,
  treasure: true,
  onLand(ctx, at) {
    ctx.setTile(at.x, at.y, 'floor');
    ctx.addGold(10, 'gem');
    ctx.collectTreasure();
  },
};
