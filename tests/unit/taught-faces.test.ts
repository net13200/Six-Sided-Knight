import { describe, expect, it } from 'vitest';
import { defaultRules } from '../../src/content/register';
import { levelFiles, loadLevelFile } from '../../tools/lib/files';

/** The level whose lesson introduces each face. Plain faces (pips) need no lesson. */
const TAUGHT_AT: Readonly<Record<string, string>> = {
  Sword: 'c1-02',
  Shield: 'c1-04',
  Key: 'c1-05',
  Coin: 'c1-06',
  Heart: 'c1-08',
  Bomb: 'c1-10',
  Freeze: 'c5-01',
  Hook: 'c6-01',
};

const rules = defaultRules();
const campaign = levelFiles(['src/levels/data']).map(loadLevelFile);
const floors = levelFiles(['src/levels/gauntlets']).map(loadLevelFile);

describe('the die only shows faces the player has been taught', () => {
  it('knows when every face is taught', () => {
    const ids = new Set(campaign.map((l) => l.id));
    for (const at of Object.values(TAUGHT_AT)) expect(ids.has(at)).toBe(true);
  });

  for (const [i, level] of campaign.entries()) {
    it(`${level.id}: every face is taught by now`, () => {
      const dice = [level, ...floors.filter((f) => f.id.startsWith(`${level.id}-`))];
      for (const l of dice) {
        const loadout = l.loadout ?? rules.config.defaultLoadout;
        for (const face of loadout) {
          if (face.startsWith('Pip')) continue;
          const at = TAUGHT_AT[face];
          expect(at, `${l.id}: ${face} is never taught`).toBeDefined();
          const taught = campaign.findIndex((c) => c.id === at);
          expect(taught, `${l.id} shows ${face} before ${at} teaches it`).toBeLessThanOrEqual(i);
        }
      }
    });
  }
});
