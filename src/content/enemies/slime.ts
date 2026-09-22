import { chase } from '../../engine/ai';
import type { EnemyDef } from '../../engine/registry';

/**
 * 3 HP, acts every other turn. `wait` = enemy phases to skip before acting.
 * Default 1 (acts after turns 2, 4, ...). Level data may set { ready: true } or { wait: 0 }.
 */
export const Slime: EnemyDef = {
  kind: 'slime',
  name: 'Slime',
  glyph: 's',
  hp: 3,
  bounty: 10,
  initData: (o) => ({ wait: typeof o.wait === 'number' ? o.wait : o.ready === true ? 0 : 1 }),
  onEnemyTurn(ctx, self) {
    const wait = Number(self.data.wait ?? 0);
    if (wait > 0) {
      ctx.updateEnemyData(self.id, { wait: wait - 1 });
      ctx.emit({ type: 'enemyWaited', enemyId: self.id });
      return;
    }
    ctx.updateEnemyData(self.id, { wait: 1 });
    const current = ctx.enemyById(self.id);
    if (current) chase(ctx, current);
  },
  willAct: (self) => Number(self.data.wait ?? 0) === 0,
};
