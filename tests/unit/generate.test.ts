/** Property tests: the generator's solvability guarantee, across many seeds. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createState, step, validateLevel } from '../../src/engine';
import { generateLevel } from '../../src/gen/generate';
import { solve } from '../../src/solver/solve';
import { rules } from './helpers';

const seeds = fc.integer({ min: 1, max: 2 ** 31 - 1 });

describe('level generator', () => {
  it('always produces valid levels that the solver proves winnable', () => {
    fc.assert(
      fc.property(
        seeds,
        fc.constantFrom<[number, number]>([10, 25], [25, 45], [40, 60]),
        (seed, band) => {
          const g = generateLevel(rules, { seed, band, id: 'gen', name: 'Gen', maxAttempts: 8 });
          expect(validateLevel(rules, g.level)).toEqual([]);
          let s = createState(rules, g.level);
          const r = solve(rules, s, { algorithm: 'idastar', maxNodes: 300_000 });
          expect(r.status).toBe('solved');
          for (const dir of r.path) s = step(rules, s, { type: 'move', dir }).state;
          expect(s.status).toBe('won');
          expect(g.level.par).toBe(r.moves);
        },
      ),
      { numRuns: 40 },
    );
  }, 120_000);

  it('levels stay winnable when entered with low HP', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const g = generateLevel(rules, {
          seed,
          band: [35, 55],
          id: 'gen',
          name: 'Gen',
          hp: 2,
          maxAttempts: 8,
        });
        const r = solve(rules, createState(rules, g.level, { hp: 2 }), {
          algorithm: 'idastar',
          maxNodes: 300_000,
        });
        expect(r.status).toBe('solved');
      }),
      { numRuns: 20 },
    );
  }, 120_000);

  it('is deterministic: same seed, same level', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const p = {
          seed,
          band: [20, 40] as [number, number],
          id: 'gen',
          name: 'Gen',
          maxAttempts: 6,
        };
        expect(generateLevel(rules, p).level).toEqual(generateLevel(rules, p).level);
      }),
      { numRuns: 15 },
    );
  }, 60_000);

  it('different seeds give different levels', () => {
    const grids = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      grids.add(
        generateLevel(rules, {
          seed,
          band: [20, 40],
          id: 'g',
          name: 'G',
          maxAttempts: 6,
        }).level.grid.join(''),
      );
    }
    expect(grids.size).toBeGreaterThanOrEqual(11);
  }, 60_000);

  it('usually lands in the requested band', () => {
    let hits = 0;
    const n = 20;
    for (let seed = 100; seed < 100 + n; seed++) {
      if (generateLevel(rules, { seed, band: [25, 45], id: 'g', name: 'G' }).inBand) hits++;
    }
    expect(hits / n).toBeGreaterThanOrEqual(0.85);
  }, 120_000);
});
