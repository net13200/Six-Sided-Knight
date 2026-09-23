import { describe, expect, it } from 'vitest';
import { DIRS, step } from '../../src/engine';
import { describeBoard, describeTurn } from '../../src/game/view/describe';
import { predictOutcome } from '../../src/game/view/outcome';
import { rules, start } from './helpers';

const outcomes = (s: ReturnType<typeof start>) =>
  DIRS.map((d) => [d, predictOutcome(rules, s, d)] as const);

describe('screen-reader descriptions', () => {
  it('describes HP, faces, every move, the exit and enemies', () => {
    const s = start(['#......#', '#@k...>#']);
    const text = describeBoard(rules, s, outcomes(s));
    expect(text).toContain('HP 5 of 5');
    expect(text).toContain('Top face Shield, bottom Heart');
    expect(text).toContain('Right: Sword leads. Knocks out the Skeleton');
    expect(text).toContain('Exit: 5 right');
    expect(text).toContain('Skeleton, 2 HP: 1 right');
  });

  it('summarises a turn, including enemy hits and HP', () => {
    const s = start(['#......#', '#@.k..>#'], { start: { east: 'Heart' } });
    const o = predictOutcome(rules, s, 'E');
    const after = step(rules, s, { type: 'move', dir: 'E' }).state;
    const line = describeTurn(s, after, o);
    expect(line).toMatch(/^Rolls to the next tile\./);
    if (after.player.hp < 5) expect(line).toContain(`HP ${after.player.hp} of 5`);
  });
});
