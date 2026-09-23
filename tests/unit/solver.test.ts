import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DIRS, createState, hashState, step, type GameState } from '../../src/engine';
import { loadCampaign } from '../../src/levels/campaign';
import { StateEncoder, goalDistance, solve } from '../../src/solver/solve';
import { exactLog2, rate } from '../../src/solver/rate';
import { rules, start } from './helpers';

const campaign = loadCampaign(rules);

describe('solver', () => {
  it('BFS and IDA* agree on the optimal length of every campaign level', () => {
    for (const level of campaign) {
      const s = createState(rules, level);
      const bfs = solve(rules, s);
      const ida = solve(rules, s, { algorithm: 'idastar' });
      expect(bfs.status, level.id).toBe('solved');
      expect(ida.moves, level.id).toBe(bfs.moves);
    }
  }, 60_000);

  it('returned paths actually win', () => {
    for (const level of campaign) {
      for (const algorithm of ['bfs', 'idastar'] as const) {
        let s = createState(rules, level);
        for (const dir of solve(rules, s, { algorithm }).path)
          s = step(rules, s, { type: 'move', dir }).state;
        expect(s.status, `${level.id} ${algorithm}`).toBe('won');
      }
    }
  }, 60_000);

  it('proves a sealed-off exit unsolvable', () => {
    const s = start(['#@..#>##']);
    expect(solve(rules, s).status).toBe('unsolvable');
    expect(solve(rules, s, { algorithm: 'idastar' }).status).toBe('unsolvable');
  });

  it('respects the node budget', () => {
    const s = createState(
      rules,
      campaign.find((l) => l.id === 'c1-04')!,
    );
    const r = solve(rules, s, { maxNodes: 50 });
    expect(r.status).toBe('budget');
    expect(r.nodes).toBeLessThanOrEqual(51);
  });

  it('honours constraints (no damage, all gold)', () => {
    const s = start(['#@^.>###', '#......#', '#.*....#']);
    const any = solve(rules, s);
    const safe = solve(rules, s, { allow: (x) => x.stats.damageTaken === 0 });
    const gold = solve(rules, s, {
      accept: (x) => x.stats.treasuresCollected === x.stats.treasuresTotal,
      keyExtra: (x) => x.stats.treasuresCollected,
    });
    expect(safe.moves).toBeGreaterThanOrEqual(any.moves);
    expect(gold.moves).toBeGreaterThan(any.moves);
  });

  it('the heuristic never overestimates (admissible)', () => {
    for (const level of campaign.slice(0, 6)) {
      const s = createState(rules, level);
      expect(goalDistance(rules, s)).toBeLessThanOrEqual(solve(rules, s).moves);
    }
  });
});

describe('state keys', () => {
  // Random walks through a busy level: equal keys must mean equal futures.
  const level = campaign.find((l) => l.id === 'c1-10')!;
  const initial = createState(rules, level);
  const enc = new StateEncoder(rules, initial);
  const relevant = (s: GameState) =>
    hashState({
      ...s,
      turn: 0,
      gold: 0,
      stats: { ...s.stats, moves: 0, kills: 0, damageTaken: 0, treasuresCollected: 0 },
    });

  it('equal keys only for states that play out identically', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...DIRS), { maxLength: 25 }),
        fc.array(fc.constantFrom(...DIRS), { maxLength: 25 }),
        (a, b) => {
          const walk = (dirs: readonly (typeof DIRS)[number][]) =>
            dirs.reduce((s, dir) => step(rules, s, { type: 'move', dir }).state, initial);
          const sa = walk(a);
          const sb = walk(b);
          if (enc.key(sa) === enc.key(sb)) expect(relevant(sa)).toBe(relevant(sb));
          else expect(relevant(sa)).not.toBe(relevant(sb));
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('difficulty rater', () => {
  const score = (id: string) =>
    rate(
      rules,
      createState(
        rules,
        campaign.find((l) => l.id === id)!,
      ),
    ).score;

  it('scores are in 0-100 and deterministic', () => {
    const s = createState(rules, campaign[3]!);
    const a = rate(rules, s);
    expect(a).toEqual(rate(rules, s));
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
  });

  it('ranks the first level easier than the combat and key levels', () => {
    expect(score('c1-01')).toBeLessThan(score('c1-04'));
    expect(score('c1-01')).toBeLessThan(score('c1-05'));
    expect(score('c1-02')).toBeLessThan(score('c1-10'));
  });

  it('uses an engine-independent log2', () => {
    expect(exactLog2(1)).toBe(0);
    expect(exactLog2(8)).toBe(3);
    expect(exactLog2(12)).toBe(3.5);
    expect(Math.abs(exactLog2(1000) - Math.log2(1000))).toBeLessThan(0.1);
  });

  it('rates unsolvable levels as not solvable', () => {
    expect(rate(rules, start(['#@..#>##'])).solvable).toBe(false);
  });

  it('keeps the tutorial in the easy half of the scale', () => {
    for (const level of campaign.slice(0, 10)) {
      expect(rate(rules, createState(rules, level)).score, level.id).toBeLessThanOrEqual(65);
    }
  });
});
