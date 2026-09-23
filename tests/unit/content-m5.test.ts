/** Rules for ice, Freeze, Hook, Archer and Golem (SPEC sections 4, 5 and 7). */
import { describe, expect, it } from 'vitest';
import { TurnContext, validateLevel, type GameEvent } from '../../src/engine';
import { die, level, rules, run, start } from './helpers';

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
/** Default die with the west face (Coin) swapped for `face`. */
const withWest = (face: string) => ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', face];

describe('ice', () => {
  it('the die slides over ice without rolling and stops on the first normal tile', () => {
    const s = start(['#@==.>##']);
    const [r] = run(s, 'E');
    expect(r!.state.player).toMatchObject({ x: 4, y: 0 });
    expect(types(r!.events).slice(0, 3)).toEqual(['moved', 'slid', 'slid']);
    // Same faces as after one plain roll east.
    const plain = run(start(['#@..>###']), 'E')[0]!.state;
    expect(die(r!.state)).toEqual(die(plain));
  });

  it('stops on the last ice tile before a wall, door, chest or enemy', () => {
    for (const blocker of ['#', '|', '$', 'k']) {
      const s = start([`#@==${blocker}###`, '#.....>#']);
      expect(run(s, 'E')[0]!.state.player.x).toBe(3);
    }
  });

  it('stops at the board edge', () => {
    const s = start(['...>....', '@=======']);
    expect(run(s, 'E')[0]!.state.player.x).toBe(7);
  });

  it('sliding onto the exit wins; onto spikes hurts (bottom face unchanged)', () => {
    expect(run(start(['#@==>###']), 'E')[0]!.state.status).toBe('won');
    const hurt = run(start(['#@=^###>']), 'E')[0]!.state;
    expect(hurt.player).toMatchObject({ x: 3, hp: 4 });
  });

  it('enemies walk on ice normally (one step, no slide)', () => {
    const w = run(start(['#.@==k>#']), 'W')[0]!.state;
    expect(w.enemies[0]).toMatchObject({ x: 4 });
  });
});

describe('Freeze face', () => {
  it('deals no damage and the enemy skips its next 2 turns', () => {
    const s = start(['.......>', 'k@......'], { loadout: withWest('Freeze') });
    const [r1, r2, r3] = run(s, 'WEW');
    expect(r1!.state.enemies[0]).toMatchObject({ hp: 2, effects: [{ id: 'frozen', turns: 1 }] });
    expect(r1!.events.some((e) => e.type === 'effectApplied')).toBe(true);
    expect(r2!.state.enemies[0]).toMatchObject({ x: 0, y: 1 }); // didn't chase
    expect(r3!.events.some((e) => e.type === 'enemyAttacked')).toBe(true); // thawed
  });
});

describe('Hook face', () => {
  const hook = { loadout: withWest('Hook') };

  it('pulls an enemy 2-3 tiles away next to the die; the die stays', () => {
    const s = start(['#k..@..>'], hook);
    const r = run(s, 'W')[0]!;
    expect(r.consumed).toBe(true);
    expect(r.state.player).toMatchObject({ x: 4, y: 0 });
    expect(r.state.player.die.orient).toBe(s.player.die.orient);
    expect(r.state.enemies[0]).toMatchObject({ x: 3, y: 0 });
    expect(r.events[0]).toMatchObject({ type: 'pulled', from: { x: 1, y: 0 }, to: { x: 3, y: 0 } });
  });

  it('pulls in a gem and collects it', () => {
    const s = start(['#..*.@.>'], hook);
    const r = run(s, 'W')[0]!;
    expect(r.state.player.x).toBe(5);
    expect(r.state.gold).toBe(10);
    expect(r.state.stats.treasuresCollected).toBe(1);
    expect(r.state.tiles[3]).toBe('floor');
  });

  it('with nothing in reach, or the line blocked, the die just rolls', () => {
    expect(run(start(['k...#.@>'], hook), 'W')[0]!.state.player.x).toBe(5);
    expect(run(start(['.k....@>'], hook), 'W')[0]!.state.player.x).toBe(5); // 5 tiles: out of reach
    expect(run(start(['#k$.@..>'], hook), 'W')[0]!.state.player.x).toBe(3);
  });

  it('never pulls an enemy onto spikes, and rolling onto the exit still wins', () => {
    const spikes = run(start(['#.k^@..>'], hook), 'W')[0]!.state;
    expect(spikes.enemies[0]!.x).toBe(2);
    expect(run(start(['#k.>@...'], hook), 'W')[0]!.state.status).toBe('won');
  });
});

describe('Archer', () => {
  it('never moves and shoots along a clear line', () => {
    // Rolling east puts Coin on top, so the arrow is not blocked.
    const r = run(start(['#@...a.>']), 'E')[0]!;
    expect(r.state.enemies[0]).toMatchObject({ x: 5 });
    expect(r.state.player.hp).toBe(4);
  });

  it('walls and other enemies block arrows; Shield on top blocks the hit', () => {
    expect(run(start(['#@..#a.>', '#......#']), 'E')[0]!.state.player.hp).toBe(5);
    expect(run(start(['#@...ka>']), 'E')[0]!.state.player.hp).toBeGreaterThanOrEqual(4);
    // Shield on top after rolling east = Shield was on the west.
    const shielded = start(['#@...a.>'], { start: { west: 'Shield' } });
    expect(run(shielded, 'E')[0]!.state.player.hp).toBe(5);
  });

  it('reports its danger lanes for the UI, stopping at walls and the die', () => {
    const s = start(['#..a..>#', '#..#...#', '#.@....#']);
    const ctx = new TurnContext(rules, s);
    const tiles = rules.enemies.get('archer').dangerTiles!(ctx, s.enemies[0]!);
    const key = (t: { x: number; y: number }) => `${t.x},${t.y}`;
    expect(tiles.map(key).sort()).toEqual(['1,0', '2,0', '4,0', '5,0', '6,0'].sort());
  });
});

describe('Golem', () => {
  it('only Bombs hurt it', () => {
    const sword = run(start(['#@g...>#']), 'E')[0]!;
    expect(sword.state.enemies[0]!.hp).toBe(4);
    expect(sword.events.find((e) => e.type === 'attacked')).toMatchObject({ damage: 0 });
    const bomb = run(start(['#@g...>#'], { start: { east: 'Bomb' } }), 'EE');
    expect(bomb[0]!.state.enemies[0]!.hp).toBe(2);
    expect(bomb[1]!.state.enemies).toHaveLength(0);
    expect(bomb[1]!.state.gold).toBe(20);
  });

  it('Bomb splash chips it too', () => {
    const s = start(['#......>', '#@kg...#'], { start: { east: 'Bomb' } });
    expect(run(s, 'E')[0]!.state.enemies.find((e) => e.kind === 'golem')!.hp).toBe(3);
  });

  it('acts every other turn', () => {
    const moves = run(start(['#@....g>', '#......#']), 'SE');
    expect(moves[0]!.state.enemies[0]).toMatchObject({ x: 6, y: 0 });
    expect(moves[1]!.state.enemies[0]).toMatchObject({ x: 6, y: 1 });
  });
});

describe('level loadout', () => {
  it('is validated', () => {
    expect(validateLevel(rules, level(['#@...>##'], { loadout: withWest('Nope') }))).toContain(
      "loadout has unknown face 'Nope'",
    );
    expect(validateLevel(rules, level(['#@...>##'], { loadout: ['Sword'] }))).toContain(
      'loadout must list 6 faces',
    );
    expect(validateLevel(rules, level(['#@...>##'], { loadout: withWest('Hook') }))).toEqual([]);
  });

  it('start constraints use the level loadout', () => {
    const lv = level(['#@...>##'], { loadout: withWest('Freeze'), start: { top: 'Freeze' } });
    expect(validateLevel(rules, lv)).toEqual([]);
    expect(validateLevel(rules, level(['#@...>##'], { start: { top: 'Freeze' } }))).toContain(
      'start orientation is impossible',
    );
  });
});
