import { describe, expect, it } from 'vitest';
import { createState } from '../../src/engine';
import { LevelService } from '../../src/gen/service';
import { loadCampaign } from '../../src/levels/campaign';
import { rules } from './helpers';

describe('level service: solving (dev tool)', () => {
  it('finds the par solution from a level start', async () => {
    const service = new LevelService(rules, false); // inline (no worker in tests)
    const level = loadCampaign(rules)[2]!;
    const r = await service.solve(createState(rules, level));
    expect(r.status).toBe('solved');
    expect(r.moves).toBe(level.par);
  });
});
