/**
 * Every campaign level must load, be proven winnable from the starting HP, and
 * have a par equal to the solver's minimum (stars are about moves only).
 * Gauntlets (chapter finales, several floors with HP carried over and no
 * healing between floors) must be winnable floor by floor from 1 HP, and
 * ★★★ (the summed par) must be reachable over the whole run.
 */
import { describe, expect, it } from 'vitest';
import { createState, step, type GameState, type LevelData } from '../../src/engine';
import { MIN_ARRIVAL_HP, START_HP } from '../../src/meta/daily';
import { CHAPTER_SIZE } from '../../src/meta/progress';
import { loadCampaign, loadGauntletFloors } from '../../src/levels/campaign';
import { solve, type SolveOptions } from '../../src/solver/solve';
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
    it(`${level.id} is winnable from ${START_HP} HP and par is the minimum`, () => {
      const r = solve(rules, createState(rules, level), { maxNodes: 400_000 });
      expect(r.status).toBe('solved');
      expect(level.par).toBe(r.moves);
    }, 30_000);
  }
});

/** Plays each floor with `opts`, carrying HP like the game does. Returns false if a floor can't be won. */
function chain(floors: readonly LevelData[], opts: SolveOptions, checkPar = false): boolean {
  let hp = START_HP;
  for (const floor of floors) {
    let s: GameState = createState(rules, floor, { hp });
    const r = solve(rules, s, { maxNodes: 400_000, ...opts });
    if (r.status !== 'solved') return false;
    if (checkPar && r.moves !== floor.par) return false;
    for (const dir of r.path) s = step(rules, s, { type: 'move', dir }).state;
    hp = s.player.hp; // no healing between floors
  }
  return true;
}

describe('gauntlets', () => {
  for (const [id, extra] of gauntlets) {
    const floors = [levels.find((l) => l.id === id)!, ...extra];
    it(`${id}: ${floors.length} floors, each winnable at ${MIN_ARRIVAL_HP} HP, par is the minimum`, () => {
      floors.forEach((floor, i) => {
        const r = solve(rules, createState(rules, floor), { maxNodes: 400_000 });
        expect(r.status, floor.id).toBe('solved');
        expect(floor.par, floor.id).toBe(r.moves);
        if (i > 0) {
          const low = solve(rules, createState(rules, floor, { hp: MIN_ARRIVAL_HP }), {
            maxNodes: 400_000,
          });
          expect(low.status, `${floor.id} at ${MIN_ARRIVAL_HP} HP`).toBe('solved');
        }
      });
    }, 30_000);

    it(`${id}: ★★★ (the summed par) is reachable over the whole run`, () => {
      expect(chain(floors, {}, true)).toBe(true);
    }, 30_000);
  }
});
