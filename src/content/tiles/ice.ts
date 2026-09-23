import { DIR_DELTA } from '../../engine/types';
import type { TileDef } from '../../engine/registry';

/**
 * The die slides on without rolling (same faces) until it reaches a tile
 * that isn't ice, or something stops it: a wall, a door, a chest, an enemy
 * or the board edge. Enemies walk on ice normally.
 */
export const Ice: TileDef = {
  id: 'ice',
  name: 'Ice',
  glyph: '=',
  passable: true,
  enemyPassable: true,
  onLand(ctx, at, dir) {
    const nx = at.x + DIR_DELTA[dir].dx;
    const ny = at.y + DIR_DELTA[dir].dy;
    const next = ctx.tileDefAt(nx, ny);
    if (!next?.passable || ctx.enemyAt(nx, ny)) return;
    ctx.slidePlayer(dir);
  },
};
