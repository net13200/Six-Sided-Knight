import { chase } from '../../engine/ai';
import type { EnemyDef } from '../../engine/registry';

/** 2 HP, acts every turn. */
export const Skeleton: EnemyDef = {
  kind: 'skeleton',
  name: 'Skeleton',
  glyph: 'k',
  hp: 2,
  bounty: 10,
  onEnemyTurn: (ctx, self) => chase(ctx, self),
  willAct: () => true,
};
