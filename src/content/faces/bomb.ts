import { DIR_DELTA, DIRS } from '../../engine/types';
import type { FaceDef } from '../../engine/registry';

/** 2 damage to the target plus 1 splash to enemies orthogonally adjacent to it. */
export const Bomb: FaceDef = {
  id: 'Bomb',
  name: 'Bomb',
  glyph: 'B',
  tags: ['blast'],
  attack: 2,
  onAttack(ctx, target) {
    const neighbours = DIRS.map((d) =>
      ctx.enemyAt(target.x + DIR_DELTA[d].dx, target.y + DIR_DELTA[d].dy),
    )
      .filter((e) => e !== undefined)
      .map((e) => e.id);
    const killed = ctx.damageEnemy(target.id, 2, 'Bomb');
    for (const id of neighbours) ctx.damageEnemy(id, 1, 'Bomb', true);
    return killed;
  },
};
