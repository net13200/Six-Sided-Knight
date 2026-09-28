import { describe, expect, it } from 'vitest';
import { createState } from '../../src/engine';
import { LevelService } from '../../src/gen/service';
import { loadCampaign } from '../../src/levels/campaign';
import { rules } from './helpers';

describe('level service: solving (dev tool)', () => {
  it('solves all three stars from a level start, matching par', async () => {
    const service = new LevelService(rules, false); // inline (no worker in tests)
    const level = loadCampaign(rules).find((l) => l.id === 'c1-08')!; // a heal-star level
    const a = await service.solve(createState(rules, level), true);
    expect(a.any.status).toBe('solved');
    expect(a.any.moves).toBe(level.par);
    expect(a.noDamage.status).toBe('solved');
    expect(a.noDamage.moves).toBeGreaterThan(a.any.moves); // both pools: a longer route
    expect(a.allGold.status).toBe('solved');
  });
});
