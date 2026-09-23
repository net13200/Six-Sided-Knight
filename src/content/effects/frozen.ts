import type { EffectDef } from '../../engine/registry';

/** A frozen enemy skips its turns until the effect runs out. */
export const Frozen: EffectDef = {
  id: 'frozen',
  name: 'Frozen',
  onEnemyTurn: () => true,
};
