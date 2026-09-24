import { describe, expect, it } from 'vitest';
import {
  LevelError,
  createState,
  describeDie,
  parseTextLevel,
  validateLevel,
} from '../../src/engine';
import { level, rules } from './helpers';

describe('text level format', () => {
  it('parses metadata and grid', () => {
    const lvl = parseTextLevel(`id: c1-01
name: First Roll
par: 6
start: top=Shield east=Sword
---
########
#@...>.#
#......#
#......#
#......#
#......#
#......#
#......#
########
`);
    expect(lvl).toMatchObject({ schema: 1, id: 'c1-01', name: 'First Roll', par: 6 });
    expect(lvl.grid).toHaveLength(9);
    expect(lvl.start).toEqual({ top: 'Shield', east: 'Sword' });
    expect(validateLevel(rules, lvl)).toEqual([]);
  });

  it('parses wounded enemies and the full-HP star', () => {
    const lvl = parseTextLevel(`id: t
name: T
star: full-hp
enemies: 2,1 hp=1; 4,1 ready
---
########
#.k.s.>#
#@.....#
#......#
#......#
#......#
#......#
#......#
########
`);
    expect(lvl.healStar).toBe(true);
    expect(lvl.enemies).toEqual([
      { x: 2, y: 1, hp: 1 },
      { x: 4, y: 1, data: { ready: true } },
    ]);
    const s = createState(rules, lvl);
    expect(s.enemies.map((e) => e.hp)).toEqual([1, 3]);
  });
});

describe('validation', () => {
  it('accepts a good level', () => {
    expect(validateLevel(rules, level(['#@....>#']))).toEqual([]);
  });

  it.each([
    ['wrong schema', { ...level(['#@...>#']), schema: 0 }, /schema/],
    ['bad id', { ...level(['#@...>#']), id: 'Bad Id' }, /slug/],
    ['no player', level(['#....>#']), /exactly one '@'/],
    ['two players', level(['#@@..>#']), /exactly one '@'/],
    ['no exit', level(['#@....#']), /goal/],
    ['unknown glyph', level(['#@..?>#']), /unknown glyph/],
    ['short row', { ...level(['#@..>#']), grid: ['#@>', ...level([]).grid.slice(1)] }, /row 0/],
    ['too few rows', { ...level(['#@..>#']), grid: ['#@....>#'] }, /9 rows/],
    ['bad par', { ...level(['#@..>#']), par: 0 }, /par/],
    [
      'impossible start',
      { ...level(['#@..>#']), start: { top: 'Sword', bottom: 'Sword' } },
      /impossible/,
    ],
    ['override without enemy', { ...level(['#@..>#']), enemies: [{ x: 3, y: 0 }] }, /override/],
    [
      'enemy hp above its maximum',
      { ...level(['#@.k>#']), enemies: [{ x: 3, y: 0, hp: 3 }] },
      /hp/,
    ],
  ])('rejects %s', (_name, lvl, pattern) => {
    const problems = validateLevel(rules, lvl);
    expect(problems.join('\n')).toMatch(pattern);
    expect(() => createState(rules, lvl)).toThrow(LevelError);
  });

  it('rejects non-objects', () => {
    expect(validateLevel(rules, null)).toEqual(['level is not an object']);
  });
});

describe('createState', () => {
  it('places the player, enemies and counts treasures', () => {
    const s = createState(rules, level(['#@k*$s>#']), { hp: 3, seed: 42 });
    expect(s.player).toMatchObject({ x: 1, y: 0, hp: 3, maxHp: 5 });
    expect(s.enemies.map((e) => [e.kind, e.x, e.hp])).toEqual([
      ['skeleton', 2, 2],
      ['slime', 5, 3],
    ]);
    expect(s.tiles.slice(0, 8)).toEqual([
      'wall',
      'floor',
      'floor',
      'gem',
      'chest',
      'floor',
      'exit',
      'wall',
    ]);
    expect(s.stats.treasuresTotal).toBe(2);
    expect(s.rng).toBe(42);
  });

  it('applies start orientation constraints', () => {
    const s = createState(rules, level(['#@...>#'], { start: { top: 'Key', east: 'Coin' } }));
    expect(describeDie(s.player.die)).toMatchObject({ top: 'Key', east: 'Coin' });
  });
});
