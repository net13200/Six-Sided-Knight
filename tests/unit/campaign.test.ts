/**
 * Every campaign level must load, be proven solvable by the solver, have a
 * par equal to the solver's minimum, and have all three stars achievable.
 */
import { describe, expect, it } from 'vitest';
import { createState } from '../../src/engine';
import { loadCampaign } from '../../src/levels/campaign';
import { analyze } from '../../src/solver/solve';
import { rules } from './helpers';

const levels = loadCampaign(rules);

describe('campaign', () => {
  it('has at least 10 levels with unique ids', () => {
    expect(levels.length).toBeGreaterThanOrEqual(10);
    expect(new Set(levels.map((l) => l.id)).size).toBe(levels.length);
  });

  it('level 1 is quick (a new player should finish in well under 90 seconds)', () => {
    expect(levels[0]!.par).toBeLessThanOrEqual(8);
    expect(levels[0]!.grid.join('')).not.toMatch(/[ks]/); // no enemies on the very first level
  });

  for (const level of levels) {
    it(`${level.id} is solvable, par is the minimum, and every star is achievable`, () => {
      const a = analyze(rules, createState(rules, level));
      expect(a.any.status).toBe('solved');
      expect(level.par).toBe(a.any.moves);
      expect(a.noDamage.status, 'no-damage star').toBe('solved');
      expect(a.allGold.status, 'all-gold star').toBe('solved');
    });
  }
});
