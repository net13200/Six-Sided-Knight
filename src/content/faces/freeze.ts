import type { FaceDef } from '../../engine/registry';

/** No damage. Leading into an enemy freezes it: it skips its next 2 turns. */
export const Freeze: FaceDef = {
  id: 'Freeze',
  name: 'Freeze',
  glyph: 'F',
  tags: ['chill'],
  attack: 0,
  onAttack(ctx, target) {
    ctx.damageEnemy(target.id, 0, 'Freeze');
    ctx.applyEffect(target.id, 'frozen', 2);
    return false;
  },
};
