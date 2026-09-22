import { describe, expect, it } from 'vitest';
import { TurnContext, chaseIntent, type GameState } from '../../src/engine';
import { rules, run, start } from './helpers';

function intentOf(state: GameState, enemyId: number) {
  const ctx = new TurnContext(rules, state);
  return chaseIntent(ctx, ctx.enemyById(enemyId)!);
}

const OPEN = ['........', '.@......', '........', '........', '........', '.......>'];

describe('chase intent', () => {
  it('attacks when orthogonally adjacent', () => {
    const s = start(['........', '.@k.....', '.......>']);
    expect(intentOf(s, 1)).toEqual({ kind: 'attack', dir: 'W' });
  });

  it('steps toward the player along BFS distance', () => {
    const s = start(['........', '.@...k..', '.......>']);
    expect(intentOf(s, 1)).toMatchObject({ kind: 'move', dir: 'W', to: { x: 4, y: 1 } });
  });

  it('breaks ties N, E, S, W', () => {
    const rows = [...OPEN];
    rows[3] = '...k....';
    const s = start(rows); // skeleton (3,3), player (1,1): N and W are equally good
    expect(intentOf(s, 1)).toMatchObject({ kind: 'move', dir: 'N' });
  });

  it('paths around walls', () => {
    const s = start(['........', '.@#k....', '........', '.......>']);
    expect(intentOf(s, 1)).toMatchObject({ kind: 'move', dir: 'N' });
  });

  it.each([
    ['spikes', '^'],
    ['door', '|'],
    ['chest', '$'],
  ])('never enters %s (waits if that is the only way)', (_n, glyph) => {
    const s = start(['########', `#@${glyph}k..>#`]);
    expect(intentOf(s, 1)).toEqual({ kind: 'idle' });
  });

  it('does not step onto another enemy', () => {
    const s = start(['########', '#.kk..>#', '#@######']);
    // enemy 2 at (3,1) wants (2,1), which is occupied.
    expect(intentOf(s, 2)).toEqual({ kind: 'idle' });
  });
});

describe('enemy phase', () => {
  it('resolves in reading order so the upper enemy claims a contested tile', () => {
    const s = start(['.......>', 's@.k....', '..k.....']);
    const r = run(s, 'W')[0]!; // Coin clunks the slime: a valid turn
    const moves = r.events.filter((e) => e.type === 'enemyMoved');
    expect(moves).toEqual([
      { type: 'enemyMoved', enemyId: 2, from: { x: 3, y: 1 }, to: { x: 2, y: 1 } },
      { type: 'enemyMoved', enemyId: 3, from: { x: 2, y: 2 }, to: { x: 1, y: 2 } },
    ]);
  });

  it('slimes act every other turn, and show when they will act', () => {
    // Player clunks the slime below with Key every turn; Shield on top blocks the hits.
    const s = start(['.......>', '.@......', '.s......']);
    const slime = rules.enemies.get('slime');
    expect(slime.willAct!(s.enemies[0]!)).toBe(false);
    const results = run(s, 'SSSS');
    const acted = results.map((r) => r.events.some((e) => e.type === 'enemyAttacked'));
    expect(acted).toEqual([false, true, false, true]);
    expect(slime.willAct!(results[0]!.state.enemies[0]!)).toBe(true);
  });

  it('a ready slime acts on the first turn', () => {
    const s = start(['.......>', '.@......', '.s......'], {
      enemies: [{ x: 1, y: 2, data: { ready: true } }],
    });
    const acted = run(s, 'SSS').map((r) => r.events.some((e) => e.type === 'enemyAttacked'));
    expect(acted).toEqual([true, false, true]);
  });

  it('skeletons act every turn and hit for 1', () => {
    const s = start(['.......>', '.@k.....'], { start: { east: 'Key', top: 'Sword' } });
    const hp = run(s, 'EEE').map((r) => r.state.player.hp);
    expect(hp).toEqual([4, 3, 2]);
  });
});
