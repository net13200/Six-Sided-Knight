import type { TileDef } from '../../engine/registry';

/** Landing with a 'heal' face (Heart) on the bottom, while hurt, heals 2 and dries the pool. */
export const Pool: TileDef = {
  id: 'pool',
  name: 'Healing Pool',
  glyph: '~',
  passable: true,
  enemyPassable: true,
  onLand(ctx, at) {
    if (!ctx.faceHasTag(ctx.bottomFace(), 'heal')) return;
    if (ctx.player.hp >= ctx.player.maxHp) return;
    ctx.healPlayer(2);
    ctx.setTile(at.x, at.y, 'floor');
  },
};
