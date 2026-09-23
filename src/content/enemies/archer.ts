import type { TurnContext } from '../../engine/context';
import type { EnemyDef } from '../../engine/registry';
import { DIR_DELTA, DIRS, type EnemyState, type Pos } from '../../engine/types';

/** Tiles an arrow flies over from `self` in each direction, until something blocks it. */
function lanes(ctx: TurnContext, self: EnemyState): Pos[][] {
  return DIRS.map((dir) => {
    const lane: Pos[] = [];
    let x = self.x + DIR_DELTA[dir].dx;
    let y = self.y + DIR_DELTA[dir].dy;
    while (ctx.tileDefAt(x, y)?.passable) {
      lane.push({ x, y });
      if (ctx.enemyAt(x, y) || (ctx.player.x === x && ctx.player.y === y)) break;
      x += DIR_DELTA[dir].dx;
      y += DIR_DELTA[dir].dy;
    }
    return lane;
  });
}

/**
 * 1 HP. Never moves. Every turn it shoots along its row and column: if the
 * die is in a clear straight line (walls, doors, chests and enemies block
 * arrows), it hits for 1. Shield on top blocks the arrow.
 */
export const Archer: EnemyDef = {
  kind: 'archer',
  name: 'Archer',
  glyph: 'a',
  hp: 1,
  bounty: 10,
  onEnemyTurn(ctx, self) {
    const p = ctx.player;
    const seen = lanes(ctx, self).some((lane) => lane.some((t) => t.x === p.x && t.y === p.y));
    if (seen) ctx.enemyAttack(self, 1);
  },
  dangerTiles(ctx, self) {
    return lanes(ctx, self)
      .flat()
      .filter((t) => !ctx.enemyAt(t.x, t.y));
  },
};
