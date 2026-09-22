import { describe, expect, it } from 'vitest';
import { createState } from '../../src/engine';
import { generateLevel } from '../../src/gen/generate';
import {
  DAILY_BANDS,
  MIN_ARRIVAL_HP,
  addDays,
  currentStreak,
  dailyFloorParams,
  healBetweenFloors,
  recordDaily,
  shareText,
  utcDate,
} from '../../src/meta/daily';
import { depthsBand, depthsFloorParams } from '../../src/meta/depths';
import { freshSave } from '../../src/meta/save';
import { solve } from '../../src/solver/solve';
import { rules } from './helpers';

const R = { moves: 30, hp: 4, stars: 7 };

describe('dates', () => {
  it('uses the UTC calendar date', () => {
    expect(utcDate(Date.parse('2026-09-22T23:59:59Z'))).toBe('2026-09-22');
    expect(utcDate(Date.parse('2026-09-23T00:00:01Z'))).toBe('2026-09-23');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('daily dungeon', () => {
  it('is the same for everyone on a date and differs between dates', () => {
    const a = dailyFloorParams('2026-09-22', 1);
    expect(a).toEqual(dailyFloorParams('2026-09-22', 1));
    expect(a.seed).not.toBe(dailyFloorParams('2026-09-23', 1).seed);
    expect(a.seed).not.toBe(dailyFloorParams('2026-09-22', 2).seed);
  });

  it('gets harder floor by floor', () => {
    for (let i = 1; i < DAILY_BANDS.length; i++) {
      expect(DAILY_BANDS[i]![0]).toBeGreaterThan(DAILY_BANDS[i - 1]![0]);
    }
  });

  it('later floors are winnable when arriving with the minimum HP', () => {
    for (const date of ['2026-09-22', '2026-12-25']) {
      for (const floor of [2, 3]) {
        const p = dailyFloorParams(date, floor);
        expect(p.hp).toBe(MIN_ARRIVAL_HP);
        const g = generateLevel(rules, p);
        const r = solve(rules, createState(rules, g.level, { hp: MIN_ARRIVAL_HP }), {
          algorithm: 'idastar',
        });
        expect(r.status, `${date} floor ${floor}`).toBe('solved');
      }
    }
  }, 60_000);

  it('heals 1 HP between floors, up to the cap', () => {
    expect(healBetweenFloors(2)).toBe(3);
    expect(healBetweenFloors(5)).toBe(5);
  });
});

describe('streaks', () => {
  it('counts consecutive days and resets after a gap', () => {
    const save = freshSave(0);
    expect(recordDaily(save, '2026-09-20', R)).toBe(true);
    expect(recordDaily(save, '2026-09-21', R)).toBe(true);
    expect(save.daily.streak).toBe(2);
    expect(recordDaily(save, '2026-09-23', R)).toBe(true); // skipped the 22nd
    expect(save.daily.streak).toBe(1);
    expect(save.daily.bestStreak).toBe(2);
  });

  it('only the first completion of a day counts', () => {
    const save = freshSave(0);
    recordDaily(save, '2026-09-20', R);
    expect(recordDaily(save, '2026-09-20', { moves: 1, hp: 5, stars: 9 })).toBe(false);
    expect(save.daily.results['2026-09-20']).toEqual(R);
    expect(save.daily.streak).toBe(1);
  });

  it('shows the streak through yesterday, and 0 once a day is missed', () => {
    const save = freshSave(0);
    recordDaily(save, '2026-09-20', R);
    recordDaily(save, '2026-09-21', R);
    expect(currentStreak(save, '2026-09-21')).toBe(2);
    expect(currentStreak(save, '2026-09-22')).toBe(2); // still alive today
    expect(currentStreak(save, '2026-09-23')).toBe(0); // missed the 22nd
  });

  it('keeps a bounded history', () => {
    const save = freshSave(0);
    let date = '2026-01-01';
    for (let i = 0; i < 120; i++) {
      recordDaily(save, date, R);
      date = addDays(date, 1);
    }
    expect(Object.keys(save.daily.results)).toHaveLength(90);
    expect(save.daily.streak).toBe(120);
  });
});

describe('share text', () => {
  it('has the date, stars, moves, HP, streak and link, with no personal data', () => {
    const text = shareText('2026-09-22', R, 3, 'https://example.test/game/');
    expect(text).toBe(
      [
        'Six Sided Knight · Daily Roll 2026-09-22',
        '★★★★★★★☆☆ 7/9',
        '30 moves · 4/5 HP left',
        '3-day streak',
        'https://example.test/game/',
      ].join('\n'),
    );
    expect(shareText('2026-09-22', R, 1, 'u')).not.toContain('streak');
  });
});

describe('depths', () => {
  it('bands climb with depth, then plateau', () => {
    expect(depthsBand(1)[0]).toBeLessThan(depthsBand(5)[0]);
    expect(depthsBand(30)).toEqual(depthsBand(40));
  });

  it('floors are seeded per run', () => {
    expect(depthsFloorParams(1, 3).seed).toBe(depthsFloorParams(1, 3).seed);
    expect(depthsFloorParams(1, 3).seed).not.toBe(depthsFloorParams(2, 3).seed);
    expect(depthsFloorParams(1, 3).hp).toBe(MIN_ARRIVAL_HP);
  });
});

describe('golden daily', () => {
  // If this fails, a code change altered an existing date's dungeon for
  // everyone. That should only happen deliberately (with a changelog note).
  it('2026-09-22 generates the same three floors as when it was released', () => {
    const grids = [1, 2, 3].map(
      (f) => generateLevel(rules, dailyFloorParams('2026-09-22', f)).level.grid,
    );
    expect(grids).toEqual([
      [
        '########',
        '#....>.#',
        '#....k.#',
        '#......#',
        '#.#~.*.#',
        '#......#',
        '#.#...@#',
        '#.#^...#',
        '########',
      ],
      [
        '########',
        '#...>..#',
        '#k.#..##',
        '#......#',
        '#...*..#',
        '#......#',
        '#....#.#',
        '#.*@...#',
        '########',
      ],
      [
        '########',
        '#.#....#',
        '#..#s>##',
        '#..#..##',
        '#..#|#.#',
        '#....#.#',
        '#..@..*#',
        '#.*....#',
        '########',
      ],
    ]);
  }, 30_000);
});
