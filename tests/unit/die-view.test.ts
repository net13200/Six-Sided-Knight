/** The die's view helpers: move outcomes and the 3D cube maths. */
import { describe, expect, it } from 'vitest';
import { DIRS, rollDie, type DieState } from '../../src/engine';
import { CORE_CONFIG } from '../../src/content/register';
import {
  SLOT_FRAMES,
  cameraMatrix,
  facesOf,
  mul,
  rollRotation,
  visibleSlots,
} from '../../src/game/view/cube';
import { predictOutcome } from '../../src/game/view/outcome';
import { rules, start } from './helpers';

describe('move outcomes (real rules)', () => {
  // Default die: N=Bomb, E=Sword, S=Key, W=Coin; skeleton N, door E, chest W, spikes S.
  const s = start(['########', '#..k...#', '#.$@|.>#', '#..^...#', '#......#']);
  const o = Object.fromEntries(DIRS.map((d) => [d, predictOutcome(rules, s, d)]));

  it('reports a knockout, a blocked door, an opened chest and spike damage', () => {
    expect(o.N!.kind).toBe('kill');
    expect(o.N!.chip?.label).toBe('KO');
    expect(o.N!.text).toBe('Knocks out the Skeleton');
    expect(o.E!.kind).toBe('blocked');
    expect(o.E!.chip?.label).toBe('✕');
    expect(o.E!.then).toBe('No turn used');
    expect(o.W!.kind).toBe('open');
    expect(o.W!.chip?.label).toBe('+30');
    expect(o.S!.kind).toBe('hurt');
    expect(o.S!.after.player.hp).toBe(4);
  });

  it('counts every knockout from a Bomb splash', () => {
    const crowd = start(['########', '#.kkk..#', '#..@..>#'], {
      enemies: [
        { x: 2, y: 1, hp: 1 },
        { x: 4, y: 1, hp: 1 },
      ],
    });
    const n = predictOutcome(rules, crowd, 'N');
    expect(n.chip?.label).toBe('KO×3');
    expect(n.text).toBe('Knocks out 3 enemies at once');
  });

  it('never changes the real state', () => {
    const snapshot = JSON.stringify(s);
    DIRS.forEach((d) => predictOutcome(rules, s, d));
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('stays quiet for walls and plain moves', () => {
    const open = start(['#@.....>']);
    expect(predictOutcome(rules, open, 'W').chip).toBeNull(); // wall
    expect(predictOutcome(rules, open, 'E').chip).toBeNull(); // plain move
  });

  it('warns about enemy hits that follow a move', () => {
    const next = start(['#@.....>', '#.......', '#k......'], { start: { top: 'Sword' } });
    // Rolling south next to a skeleton: it hits back unless Shield ends on top.
    const r = predictOutcome(rules, next, 'S');
    expect(r.then ?? '').toMatch(/Skeleton hits you/);
  });
});

describe('3D cube', () => {
  const base: DieState = { shape: 'd6', loadout: CORE_CONFIG.defaultLoadout, orient: 0 };

  it('the default camera shows the top, south and east faces', () => {
    expect(new Set(visibleSlots(cameraMatrix(-28, -38)))).toEqual(
      new Set(['top', 'south', 'east']),
    );
  });

  it('a quarter-turn animation lands on exactly what the rules say, for every orientation', () => {
    for (let orient = 0; orient < 24; orient++) {
      const die = { ...base, orient };
      for (const dir of DIRS) {
        const after = facesOf(rollDie(die, dir));
        const rot = rollRotation(dir, 1);
        // For every slot, the face now pointing that way must match the rolled die.
        for (const [target, frame] of Object.entries(SLOT_FRAMES)) {
          const from = Object.entries(SLOT_FRAMES).find(([, f]) => {
            const n = mul(rot, f.n);
            return n.every((c, i) => Math.abs(c - frame.n[i]!) < 1e-9);
          })![0];
          expect(facesOf(die)[from], `orient ${orient} roll ${dir} -> ${target}`).toBe(
            after[target],
          );
        }
      }
    }
  });
});
