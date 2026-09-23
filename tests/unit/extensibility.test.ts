/**
 * Proves new content plugs in through the registries alone: these definitions
 * live only in this test, and the core engine is untouched.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_CONFIG, registerCoreContent } from '../../src/content/register';
import {
  createRules,
  type EffectDef,
  type EnemyDef,
  type FaceDef,
  type TileDef,
} from '../../src/engine';
import { run, start } from './helpers';

const Stunned: EffectDef = {
  id: 'stunned',
  name: 'Stunned',
  onEnemyTurn: () => true, // skip the enemy's turn
};

const Stun: FaceDef = {
  id: 'Stun',
  name: 'Stun',
  glyph: 'X',
  tags: [],
  attack: 0,
  onAttack(ctx, target) {
    ctx.damageEnemy(target.id, 0, 'Stun');
    ctx.applyEffect(target.id, 'stunned', 2);
    return false;
  },
};

/** Pushes the die one extra tile on landing (a conveyor), via a face-agnostic tile hook. */
const Conveyor: TileDef = {
  id: 'conveyor',
  name: 'Conveyor',
  glyph: '%',
  passable: true,
  enemyPassable: true,
  onLand(ctx, at) {
    const next = ctx.tileDefAt(at.x + 1, at.y);
    if (next?.passable && !ctx.enemyAt(at.x + 1, at.y)) ctx.rollPlayer('E');
  },
};

/** Never moves; hits for 2 when adjacent. */
const Turret: EnemyDef = {
  kind: 'turret',
  name: 'Turret',
  glyph: 't',
  hp: 1,
  bounty: 5,
  onEnemyTurn(ctx, self) {
    if (Math.abs(self.x - ctx.player.x) + Math.abs(self.y - ctx.player.y) === 1)
      ctx.enemyAttack(self, 2);
  },
};

function extendedRules() {
  const rules = registerCoreContent(
    createRules({
      ...CORE_CONFIG,
      defaultLoadout: ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Stun'],
    }),
  );
  rules.faces.register(Stun);
  rules.effects.register(Stunned);
  rules.tiles.register(Conveyor);
  rules.enemies.register(Turret);
  return rules;
}

describe('adding content through registries only', () => {
  const rules = extendedRules();

  it('a new face and effect: Stun stops an enemy for 2 turns', () => {
    // Stun replaces Coin in the west slot. The skeleton is adjacent to the west.
    const s = start(['.......>', 'k@......'], {}, {}, rules);
    const [frozen] = run(s, 'W', rules);
    expect(frozen!.state.enemies[0]!.effects).toEqual([{ id: 'stunned', turns: 1 }]);
    // Adjacent but frozen: no attack this turn or next, then it thaws and attacks.
    let state = frozen!.state;
    const attacked = [frozen!.events.some((e) => e.type === 'enemyAttacked')];
    // Step away (still frozen: stays put), then step back (thawed: attacks).
    for (const r of run(state, 'EW', rules)) {
      state = r.state;
      attacked.push(r.events.some((e) => e.type === 'enemyAttacked'));
    }
    expect(attacked).toEqual([false, false, true]);
    expect(state.enemies[0]).toMatchObject({ x: 0, y: 1, effects: [] });
  });

  it('a new tile: a conveyor pushes the die one extra tile', () => {
    const s = start(['#@%...>#'], {}, {}, rules);
    expect(run(s, 'E', rules)[0]!.state.player.x).toBe(3);
  });

  it('a new enemy: turret hits for 2 and never moves', () => {
    // Rolling east brings the west face to the top; make sure it isn't Shield.
    const s = start(['#@.t..>#'], { start: { west: 'Heart' } }, {}, rules);
    const r = run(s, 'E', rules)[0]!;
    expect(r.state.player.hp).toBe(3);
    expect(r.state.enemies[0]).toMatchObject({ x: 3, y: 0 });
  });
});

describe('core engine names no content', () => {
  const ids = [
    ...['Sword', 'Shield', 'Bomb', 'Heart', 'Key', 'Coin'],
    ...['floor', 'wall', 'spikes', 'pool', 'door', 'chest', 'gem', 'exit', 'ice'],
    ...['skeleton', 'slime', 'archer', 'golem', 'Freeze', 'Hook', 'frozen'],
  ];
  const dir = join(__dirname, '../../src/engine');
  for (const file of readdirSync(dir)) {
    it(`${file} has no content id string literals`, () => {
      const src = readFileSync(join(dir, file), 'utf8');
      for (const id of ids) expect(src).not.toMatch(new RegExp(`['"\`]${id}['"\`]`));
    });
  }
});
