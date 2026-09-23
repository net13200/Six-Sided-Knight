import { chase } from '../../engine/ai';
import type { EnemyDef } from '../../engine/registry';

/**
 * 4 HP, stone armour: only 'blast' faces (Bomb) hurt it. Slow like a slime:
 * acts every other turn (level data may set { ready: true } or { wait: 0 }).
 */
export const Golem: EnemyDef = {
  kind: 'golem',
  name: 'Golem',
  glyph: 'g',
  hp: 4,
  bounty: 20,
  initData: (o) => ({ wait: typeof o.wait === 'number' ? o.wait : o.ready === true ? 0 : 1 }),
  modifyDamage: (ctx, _self, amount, face) => (ctx.faceHasTag(face, 'blast') ? amount : 0),
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
