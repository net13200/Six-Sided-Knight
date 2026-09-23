import { DIR_DELTA } from '../../engine/types';
import type { FaceDef } from '../../engine/registry';

/** How far the hook reaches, counting the tile next to the die. */
export const HOOK_RANGE = 3;

/**
 * No damage. Leading toward an enemy or a gem 2-3 tiles away in a straight,
 * clear line pulls it in: an enemy lands next to the die, a gem is collected.
 * The die stays put. With nothing in reach the die just rolls. Walls, doors,
 * chests and enemies block the line.
 */
export const Hook: FaceDef = {
  id: 'Hook',
  name: 'Hook',
  glyph: 'J',
  tags: ['pull'],
  attack: 0,
  onLeadInto(ctx, { from, to, dir }) {
    const near = ctx.tileDefAt(to.x, to.y);
    if (!near?.passable || near.goal) return undefined;
    const { dx, dy } = DIR_DELTA[dir];
    for (let d = 2; d <= HOOK_RANGE; d++) {
      const x = from.x + dx * d;
      const y = from.y + dy * d;
      const tile = ctx.tileDefAt(x, y);
      if (!tile) return undefined;
      const enemy = ctx.enemyAt(x, y);
      if (enemy) {
        if (!near.enemyPassable) return undefined;
        ctx.pullEnemy(enemy.id, to);
        return 'stay';
      }
      if (!tile.passable) return undefined;
      if (tile.treasure) {
        ctx.emit({ type: 'pulled', from: { x, y }, to: from });
        tile.onLand?.(ctx, { x, y }, dir);
        return 'stay';
      }
    }
    return undefined;
  },
};
