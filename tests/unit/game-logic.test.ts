/** Pure pieces of the game layer: stars, gestures, the fixed-step loop, scene transitions. */
import { describe, expect, it } from 'vitest';
import { keyCommand, swipeDirection, tapDirection, SWIPE_THRESHOLD } from '../../src/game/input';
import { MAX_FRAME, STEP, accumulate } from '../../src/game/loop';
import { TRANSITIONS, canTransition } from '../../src/game/scenes/scene';
import { computeStars } from '../../src/game/stars';
import { tileAt, tileCenter } from '../../src/game/view/layout';
import { level, run, start } from './helpers';

describe('stars', () => {
  const lvl = level(['#@*..>##'], { par: 4 });

  it('awards all three for a clean, fast, complete run', () => {
    const s = run(start(['#@*..>##'], { par: 4 }), 'EEEE');
    const final = s[s.length - 1]!.state;
    expect(final.status).toBe('won');
    expect(computeStars(lvl, final)).toEqual({
      par: true,
      noDamage: true,
      allGold: true,
      count: 3,
    });
  });

  it('withholds each star independently', () => {
    const won = run(start(['#@*..>##'], { par: 4 }), 'EEEE').at(-1)!.state;
    const slow = { ...won, stats: { ...won.stats, moves: 5 } };
    const hurt = { ...won, stats: { ...won.stats, damageTaken: 1 } };
    const poor = { ...won, stats: { ...won.stats, treasuresCollected: 0 } };
    expect(computeStars(lvl, slow)).toMatchObject({ par: false, count: 2 });
    expect(computeStars(lvl, hurt)).toMatchObject({ noDamage: false, count: 2 });
    expect(computeStars(lvl, poor)).toMatchObject({ allGold: false, count: 2 });
  });

  it('on a healing lesson the second star is for finishing at full HP', () => {
    const won = run(start(['#@*..>##'], { par: 4 }), 'EEEE').at(-1)!.state;
    const heal = { ...lvl, healStar: true };
    const healed = { ...won, stats: { ...won.stats, damageTaken: 3 } };
    const hurt = { ...healed, player: { ...won.player, hp: 4 } };
    expect(computeStars(heal, healed)).toMatchObject({ noDamage: true, count: 3 });
    expect(computeStars(heal, hurt)).toMatchObject({ noDamage: false, count: 2 });
  });

  it('gives nothing for an unfinished level', () => {
    expect(computeStars(lvl, start(['#@*..>##'])).count).toBe(0);
  });
});

describe('gestures', () => {
  it('ignores tiny movements (taps)', () => {
    expect(swipeDirection(5, 5)).toBeNull();
    expect(swipeDirection(SWIPE_THRESHOLD - 1, 0)).toBeNull();
  });

  it('uses the dominant axis', () => {
    expect(swipeDirection(40, 10)).toBe('E');
    expect(swipeDirection(-40, 30)).toBe('W');
    expect(swipeDirection(10, 40)).toBe('S');
    expect(swipeDirection(-10, -40)).toBe('N');
  });

  it('taps roll toward the tapped tile along the dominant axis', () => {
    const die = { x: 3, y: 4 };
    expect(tapDirection(die, { x: 3, y: 4 })).toBeNull();
    expect(tapDirection(die, { x: 7, y: 5 })).toBe('E');
    expect(tapDirection(die, { x: 2, y: 0 })).toBe('N');
    expect(tapDirection(die, { x: 0, y: 4 })).toBe('W');
    expect(tapDirection(die, { x: 4, y: 8 })).toBe('S');
  });

  it('maps arrows, WASD and shortcuts', () => {
    expect(keyCommand('ArrowUp')).toEqual({ type: 'move', dir: 'N' });
    expect(keyCommand('D')).toEqual({ type: 'move', dir: 'E' });
    expect(keyCommand('z')).toEqual({ type: 'undo' });
    expect(keyCommand('r')).toEqual({ type: 'retry' });
    expect(keyCommand('q')).toBeNull();
  });

  it('converts between tiles and board coordinates', () => {
    for (const [x, y] of [
      [0, 0],
      [7, 8],
      [3, 4],
    ] as const) {
      const c = tileCenter(x, y);
      expect(tileAt(c.x, c.y)).toEqual({ x, y });
    }
    expect(tileAt(0, 0)).toBeNull();
    expect(tileAt(200, 470)).toBeNull();
  });
});

describe('fixed-step loop', () => {
  it('runs whole 60 Hz steps and carries the remainder', () => {
    const [steps, rest] = accumulate(0, STEP * 2.5);
    expect(steps).toBe(2);
    expect(rest).toBeCloseTo(STEP * 0.5, 9);
  });

  it('caps long frames to avoid a spiral of death', () => {
    const [steps] = accumulate(0, 5);
    expect(steps).toBe(Math.floor(MAX_FRAME / STEP + 1e-9));
  });

  it('ignores negative frame times', () => {
    expect(accumulate(0, -1)).toEqual([0, 0]);
  });
});

describe('scene machine', () => {
  it('only allows listed transitions', () => {
    expect(canTransition('menu', 'play')).toBe(true);
    expect(canTransition('play', 'results')).toBe(true);
    expect(canTransition('results', 'play')).toBe(true);
    expect(canTransition('boot', 'results')).toBe(false);
    expect(canTransition('levels', 'levels')).toBe(true); // changing chapter on the map
  });

  it('every scene is reachable from boot and can get back to the menu', () => {
    const reach = (from: keyof typeof TRANSITIONS) => {
      const seen = new Set([from]);
      const queue = [from];
      while (queue.length) {
        for (const n of TRANSITIONS[queue.shift()!]) {
          if (seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      return seen;
    };
    const fromBoot = reach('boot');
    for (const s of Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>) {
      if (s === 'boot') continue;
      expect(fromBoot.has(s), `${s} reachable`).toBe(true);
      expect(reach(s).has('menu'), `${s} returns to menu`).toBe(true);
    }
  });
});
