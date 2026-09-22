import { describe, expect, it } from 'vitest';
import { step, type GameEvent } from '../../src/engine';
import { deepFreeze, die, last, rules, run, start } from './helpers';

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);

describe('attacking with the leading face', () => {
  it('Sword deals 3: kills a skeleton and the die rolls onto its tile', () => {
    const s = start(['#@k...>#']);
    const [r] = run(s, 'E');
    expect(r!.consumed).toBe(true);
    expect(r!.state.enemies).toHaveLength(0);
    expect(r!.state.player).toMatchObject({ x: 2, y: 0 });
    expect(r!.state.gold).toBe(10);
    expect(r!.state.stats.kills).toBe(1);
    expect(types(r!.events)).toEqual(['attacked', 'killed', 'gold', 'moved', 'turnEnd']);
  });

  it('a surviving target keeps the die in place and orientation unchanged', () => {
    const s = start(['#@s...>#']); // slime 3 HP, Sword kills it
    const shielded = start(['#@k...>#'], { start: { east: 'Shield', top: 'Sword' } });
    const r = run(shielded, 'E')[0]!;
    expect(r.state.player).toMatchObject({ x: 1, y: 0 });
    expect(r.state.player.die.orient).toBe(shielded.player.die.orient);
    expect(r.state.enemies[0]!.hp).toBe(1);
    // Sword on a 3 HP slime: dies.
    expect(run(s, 'E')[0]!.state.enemies).toHaveLength(0);
  });

  it('Bomb deals 2 plus 1 splash to orthogonal neighbours of the target only', () => {
    const s = start(
      [
        '#.....>#',
        '#.kk...#', // (2,1) above target, (3,1) diagonal
        '#@kk...#', // target (2,2), neighbour (3,2)
        '#.k....#', // (2,3) below target
      ],
      { start: { east: 'Bomb' } },
    );
    const r = run(s, 'E')[0]!;
    // Target killed and die rolled in.
    expect(r.state.player).toMatchObject({ x: 2, y: 2 });
    expect(r.events.filter((e) => e.type === 'attacked' && e.splash)).toHaveLength(3);
    const hp = (id: number) => r.state.enemies.find((e) => e.id === id)!.hp;
    expect([hp(1), hp(4), hp(5)]).toEqual([1, 1, 1]);
    expect(hp(2)).toBe(2); // diagonal: untouched
  });

  it('Bomb splash can kill and pays bounty', () => {
    const base = start(['#......>', '#@kk...#'], { start: { east: 'Bomb' } });
    // Wound the second skeleton so the splash finishes it.
    const s = { ...base, enemies: base.enemies.map((e) => (e.id === 2 ? { ...e, hp: 1 } : e)) };
    const r = run(s, 'E')[0]!;
    expect(r.state.enemies).toHaveLength(0);
    expect(r.state.gold).toBe(20);
    expect(r.state.stats.kills).toBe(2);
  });

  it('Key/Coin/Heart clunk for 0 but still use the turn', () => {
    const s = start(['#@k...>#'], { start: { east: 'Heart', top: 'Sword' } });
    const r = run(s, 'E')[0]!;
    expect(r.consumed).toBe(true);
    expect(r.state.enemies[0]!.hp).toBe(2);
    expect(r.state.stats.moves).toBe(1);
    // The skeleton hits back (Sword on top does not block).
    expect(r.state.player.hp).toBe(4);
  });
});

describe('Shield on top', () => {
  it('blocks enemy hits', () => {
    const s = start(['#@k...>#'], { start: { top: 'Shield', east: 'Key' } });
    const r = run(s, 'E')[0]!;
    expect(r.state.player.hp).toBe(5);
    const hit = r.events.find((e) => e.type === 'enemyAttacked');
    expect(hit).toMatchObject({ damage: 0, blocked: true });
    expect(r.state.stats.damageTaken).toBe(0);
  });
});

describe('invalid bumps', () => {
  it.each([
    ['wall', ['#@#...>#'], 'E'],
    ['edge', ['@.....>#'], 'W'],
    ['door without Key', ['#@|...>#'], 'E'],
    ['chest without Coin', ['#@$...>#'], 'E'],
  ])('%s consumes no turn and enemies do not act', (_name, rows, dir) => {
    const s = start([...rows, '#......#', '#k.....#']);
    const r = step(rules, s, { type: 'move', dir: dir as 'E' });
    expect(r.consumed).toBe(false);
    expect(r.state).toBe(s);
    expect(types(r.events)).toEqual(['bumped']);
  });
});

describe('tiles', () => {
  it('Key leading opens a door and the die rolls through in the same turn', () => {
    const s = start(['#@|...>#'], { start: { east: 'Key' } });
    const r = run(s, 'E')[0]!;
    expect(r.state.player).toMatchObject({ x: 2, y: 0 });
    expect(r.state.tiles[2]).toBe('floor');
    expect(types(r.events)).toContain('unlocked');
  });

  it('Coin leading opens a chest for 30 gold', () => {
    const s = start(['#$@...>#']); // start west = Coin
    const r = run(s, 'W')[0]!;
    expect(r.state.gold).toBe(30);
    expect(r.state.player).toMatchObject({ x: 1, y: 0 });
    expect(r.state.stats.treasuresCollected).toBe(1);
    expect(r.state.stats.treasuresTotal).toBe(1);
  });

  it('spikes hurt 1 unless Shield lands on the bottom', () => {
    // Rolling east puts the old east face on the bottom.
    const hurt = run(start(['#@^...>#']), 'E')[0]!; // Sword to bottom
    expect(hurt.state.player.hp).toBe(4);
    const safe = run(start(['#@^...>#'], { start: { east: 'Shield' } }), 'E')[0]!;
    expect(safe.state.player.hp).toBe(5);
  });

  it('pool heals 2 and dries only with Heart on the bottom while hurt', () => {
    const s = start(['#@~...>#'], { start: { east: 'Heart' } }, { hp: 2 });
    const r = run(s, 'E')[0]!;
    expect(r.state.player.hp).toBe(4);
    expect(r.state.tiles[2]).toBe('floor');

    const full = run(start(['#@~...>#'], { start: { east: 'Heart' } }), 'E')[0]!;
    expect(full.state.tiles[2]).toBe('pool');

    const wrongFace = run(start(['#@~...>#'], {}, { hp: 2 }), 'E')[0]!;
    expect(wrongFace.state.player.hp).toBe(2);
    expect(wrongFace.state.tiles[2]).toBe('pool');
  });

  it('heal is capped at max HP', () => {
    const s = start(['#@~...>#'], { start: { east: 'Heart' } }, { hp: 4 });
    expect(run(s, 'E')[0]!.state.player.hp).toBe(5);
  });

  it('gems give 10 gold and vanish', () => {
    const r = run(start(['#@*...>#']), 'E')[0]!;
    expect(r.state.gold).toBe(10);
    expect(r.state.tiles[2]).toBe('floor');
  });

  it('landing on the exit wins before enemies act', () => {
    const s = start(['#@>....#', '#.k....#']);
    const r = run(s, 'E')[0]!;
    expect(r.state.status).toBe('won');
    expect(r.state.player.hp).toBe(5);
    expect(types(r.events)).toContain('won');
    expect(types(r.events)).not.toContain('enemyAttacked');
    // No further actions once won.
    expect(step(rules, r.state, { type: 'move', dir: 'W' }).consumed).toBe(false);
  });

  it('dying ends the level', () => {
    const r = run(start(['#@^...>#'], {}, { hp: 1 }), 'E')[0]!;
    expect(r.state.status).toBe('lost');
    expect(r.state.player.hp).toBe(0);
    expect(types(r.events)).toContain('lost');
  });
});

describe('purity', () => {
  it('never mutates the input state', () => {
    const s = deepFreeze(
      start(['#@k*^~$>', '#..|...#', '#s.....#'], { start: { east: 'Bomb' } }, { hp: 3 }),
    );
    expect(() => run(s, 'ESSEEWNNEE')).not.toThrow();
  });

  it('counts moves only for consumed actions', () => {
    const s = start(['#@....>#']);
    expect(last(run(s, 'WWEN')).stats.moves).toBe(1);
    expect(die(last(run(s, 'E'))).top).toBe('Coin');
  });
});
