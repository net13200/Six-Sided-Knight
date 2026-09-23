/**
 * Every campaign level must load, be proven solvable by the solver, have a
 * par equal to the solver's minimum, and have all three stars achievable.
 * Gauntlets (chapter finales, several floors with HP carried over) must be
 * winnable floor by floor at the lowest arrival HP, and each of their stars
 * must be achievable across the whole run.
 */
import { describe, expect, it } from 'vitest';
import { createState, step, type GameState, type LevelData } from '../../src/engine';
import { healBetweenFloors, MIN_ARRIVAL_HP } from '../../src/meta/daily';
import { CHAPTER_SIZE } from '../../src/meta/progress';
import { loadCampaign, loadGauntletFloors } from '../../src/levels/campaign';
import { analyze, solve, type SolveOptions } from '../../src/solver/solve';
import { rules } from './helpers';

const levels = loadCampaign(rules);
const gauntlets = loadGauntletFloors(rules);

describe('campaign', () => {
  it('has 60 levels in chapters of 10, with unique ids', () => {
    expect(levels.length).toBeGreaterThanOrEqual(60);
    expect(levels.length % CHAPTER_SIZE).toBe(0);
    expect(new Set(levels.map((l) => l.id)).size).toBe(levels.length);
  });

  it('level 1 is quick (a new player should finish in well under 90 seconds)', () => {
    expect(levels[0]!.par).toBeLessThanOrEqual(8);
    expect(levels[0]!.grid.join('')).not.toMatch(/[ks]/); // no enemies on the very first level
  });

  it('every chapter from 2 on ends in a gauntlet', () => {
    for (let c = 1; c < levels.length / CHAPTER_SIZE; c++) {
      const finale = levels[c * CHAPTER_SIZE + CHAPTER_SIZE - 1]!;
      expect(gauntlets.get(finale.id)?.length, finale.id).toBeGreaterThanOrEqual(2);
    }
    for (const id of gauntlets.keys())
      expect(
        levels.some((l) => l.id === id),
        id,
      ).toBe(true);
  });

  for (const level of levels) {
    it(`${level.id} is solvable, par is the minimum, and every star is achievable`, () => {
      const a = analyze(rules, createState(rules, level));
      expect(a.any.status).toBe('solved');
      expect(level.par).toBe(a.any.moves);
      expect(a.noDamage.status, 'no-damage star').toBe('solved');
      expect(a.allGold.status, 'all-gold star').toBe('solved');
    }, 30_000);
  }
});

/** Plays each floor with `opts`, carrying HP like the game does. Returns false if a floor can't be won. */
function chain(floors: readonly LevelData[], opts: SolveOptions, checkPar = false): boolean {
  let hp = 5;
  for (const floor of floors) {
    let s: GameState = createState(rules, floor, { hp });
    const r = solve(rules, s, { maxNodes: 400_000, ...opts });
    if (r.status !== 'solved') return false;
    if (checkPar && r.moves !== floor.par) return false;
    for (const dir of r.path) s = step(rules, s, { type: 'move', dir }).state;
    hp = healBetweenFloors(s.player.hp);
  }
  return true;
}

describe('gauntlets', () => {
  for (const [id, extra] of gauntlets) {
    const floors = [levels.find((l) => l.id === id)!, ...extra];
    it(`${id}: ${floors.length} floors, each winnable at ${MIN_ARRIVAL_HP} HP, par is the minimum`, () => {
      floors.forEach((floor, i) => {
        const a = analyze(rules, createState(rules, floor));
        expect(a.any.status, floor.id).toBe('solved');
        expect(floor.par, floor.id).toBe(a.any.moves);
        if (i > 0) {
          const low = solve(rules, createState(rules, floor, { hp: MIN_ARRIVAL_HP }), {
            maxNodes: 400_000,
          });
          expect(low.status, `${floor.id} at ${MIN_ARRIVAL_HP} HP`).toBe('solved');
        }
      });
    }, 30_000);

    it(`${id}: every star is achievable over the whole gauntlet`, () => {
      expect(chain(floors, {}, true), 'par star').toBe(true);
      expect(chain(floors, { allow: (s) => s.stats.damageTaken === 0 }), 'no-damage star').toBe(
        true,
      );
      expect(
        chain(floors, {
          accept: (s) => s.stats.treasuresCollected === s.stats.treasuresTotal,
          keyExtra: (s) => s.stats.treasuresCollected,
        }),
        'all-gold star',
      ).toBe(true);
    }, 30_000);
  }
});
