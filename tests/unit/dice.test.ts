import { describe, expect, it } from 'vitest';
import {
  DIRS,
  OPPOSITE,
  describeDie,
  findOrientation,
  getShape,
  leadingFace,
  rollDie,
  type DieState,
  type Dir,
} from '../../src/engine';
import { CORE_CONFIG } from '../../src/content/register';

const START: DieState = { shape: 'd6', loadout: CORE_CONFIG.defaultLoadout, orient: 0 };

describe('d6 orientation', () => {
  it('starts as specified', () => {
    expect(describeDie(START)).toEqual({
      top: 'Shield',
      bottom: 'Heart',
      north: 'Bomb',
      south: 'Key',
      east: 'Sword',
      west: 'Coin',
    });
  });

  it.each([
    // [dir, expected after one roll from start]
    [
      'E',
      { top: 'Coin', bottom: 'Sword', north: 'Bomb', south: 'Key', east: 'Shield', west: 'Heart' },
    ],
    [
      'W',
      { top: 'Sword', bottom: 'Coin', north: 'Bomb', south: 'Key', east: 'Heart', west: 'Shield' },
    ],
    [
      'N',
      { top: 'Key', bottom: 'Bomb', north: 'Shield', south: 'Heart', east: 'Sword', west: 'Coin' },
    ],
    [
      'S',
      { top: 'Bomb', bottom: 'Key', north: 'Heart', south: 'Shield', east: 'Sword', west: 'Coin' },
    ],
  ] as const)('rolls %s per the spec transform', (dir, expected) => {
    expect(describeDie(rollDie(START, dir))).toEqual(expected);
  });

  it('reaches exactly 24 orientations', () => {
    expect(getShape('d6').perms.length).toBe(24);
  });

  it('roll then inverse roll returns to the original, for every orientation', () => {
    for (let o = 0; o < 24; o++) {
      for (const d of DIRS) {
        const die = { ...START, orient: o };
        expect(rollDie(rollDie(die, d), OPPOSITE[d]).orient).toBe(o);
      }
    }
  });

  it('four rolls in one direction are the identity', () => {
    for (let o = 0; o < 24; o++) {
      for (const d of DIRS) {
        let die: DieState = { ...START, orient: o };
        for (let i = 0; i < 4; i++) die = rollDie(die, d);
        expect(die.orient).toBe(o);
      }
    }
  });

  it('opposite faces stay opposite', () => {
    const pair = (a?: string, b?: string) => [a, b].sort().join('|');
    const pairs = new Set([pair('Shield', 'Heart'), pair('Bomb', 'Key'), pair('Sword', 'Coin')]);
    for (let o = 0; o < 24; o++) {
      const d = describeDie({ ...START, orient: o });
      expect(pairs.has(pair(d.top, d.bottom))).toBe(true);
      expect(pairs.has(pair(d.north, d.south))).toBe(true);
      expect(pairs.has(pair(d.east, d.west))).toBe(true);
    }
  });

  it('findOrientation locates constrained orientations', () => {
    const o = findOrientation('d6', START.loadout, { top: 'Key', east: 'Coin' });
    expect(o).toBeGreaterThanOrEqual(0);
    const d = describeDie({ ...START, orient: o });
    expect(d.top).toBe('Key');
    expect(d.east).toBe('Coin');
    expect(findOrientation('d6', START.loadout, { top: 'Shield', bottom: 'Shield' })).toBe(-1);
  });
});

describe('reachability on an open board (why levels need a solver)', () => {
  // BFS over (tile, orientation) on an open 8x9 floor.
  const W = 8;
  const H = 9;
  const seen = new Set<number>();
  const queue: Array<[number, number, number]> = [[0, 0, 0]];
  seen.add(0);
  while (queue.length) {
    const [x, y, o] = queue.shift()!;
    for (const d of DIRS) {
      const dx = d === 'E' ? 1 : d === 'W' ? -1 : 0;
      const dy = d === 'S' ? 1 : d === 'N' ? -1 : 0;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const no = rollDie({ ...START, orient: o }, d).orient;
      const k = (ny * W + nx) * 24 + no;
      if (!seen.has(k)) {
        seen.add(k);
        queue.push([nx, ny, no]);
      }
    }
  }

  it('only 12 of 24 orientations are reachable at each tile (parity)', () => {
    for (let t = 0; t < W * H; t++) {
      let count = 0;
      for (let o = 0; o < 24; o++) if (seen.has(t * 24 + o)) count++;
      expect(count).toBe(12);
    }
  });

  it('yet any single face can lead in any direction at any tile', () => {
    const faces = START.loadout;
    for (let t = 0; t < W * H; t++) {
      for (const face of faces) {
        for (const d of DIRS as Dir[]) {
          let ok = false;
          for (let o = 0; o < 24 && !ok; o++) {
            if (seen.has(t * 24 + o) && leadingFace({ ...START, orient: o }, d) === face) ok = true;
          }
          expect(ok, `tile ${t} face ${face} dir ${d}`).toBe(true);
        }
      }
    }
  });
});
