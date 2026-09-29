/** Every Ranger stage: winnable at exactly its par, and it needs what it teaches. */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRangerLevel, startState } from '../../src/ranger/rules';
import { solveRanger } from '../../src/ranger/solve';
import { RANGER_TEACHES, checkRangerTeach, type RangerTeach } from '../../src/ranger/teaches';

const dir = 'src/ranger/data';
const levels = readdirSync(dir)
  .filter((f) => f.endsWith('.txt'))
  .sort()
  .map((f) => parseRangerLevel(readFileSync(`${dir}/${f}`, 'utf8')));

describe('Ranger stages', () => {
  it('there is a short bonus chapter', () => {
    expect(levels.length).toBeGreaterThanOrEqual(6);
  });

  for (const lv of levels) {
    it(`${lv.id} ${lv.name}: par is the fewest moves, and it teaches ${lv.teaches?.join(', ')}`, () => {
      const r = solveRanger(startState(lv), { maxNodes: 400_000 });
      expect(r.status).toBe('solved');
      expect(lv.par).toBe(r.moves);
      expect(lv.teaches?.length).toBeGreaterThan(0);
      for (const t of lv.teaches ?? []) {
        expect(RANGER_TEACHES).toContain(t);
        expect(checkRangerTeach(lv, r.path, t as RangerTeach)).toEqual([]);
      }
      if (lv.hint) expect(lv.hint.length).toBeLessThanOrEqual(40);
    });
  }
});
