import { describe, expect, it } from 'vitest';
import { createState, parseTextLevel, step } from '../../src/engine';
import { LESSONS } from '../../src/game/lessons';
import { CLIPS, clipFor } from '../../src/game/lesson-clips';
import { loadCampaign } from '../../src/levels/campaign';
import { rules } from './helpers';

describe('lesson clips', () => {
  it('each clip replaces a real lesson of a real campaign level', () => {
    const ids = new Set(loadCampaign(rules).map((l) => l.id));
    for (const c of CLIPS) {
      expect(ids.has(c.levelId), c.id).toBe(true);
      expect(LESSONS[c.levelId], c.id).toBeDefined();
      expect(clipFor(c.levelId)).toBe(c);
    }
  });

  it('every move plays, nothing hurts, and the checked move does what it shows', () => {
    for (const c of CLIPS) {
      let s = createState(rules, parseTextLevel(c.level));
      expect(s.width, c.id).toBe(8);
      expect(s.height, c.id).toBe(9);
      c.moves.forEach((dir, i) => {
        const r = step(rules, s, { type: 'move', dir });
        expect(r.consumed, `${c.id} move ${i}`).toBe(true);
        expect(
          r.events.some((e) => e.type === 'hurt'),
          `${c.id} move ${i}`,
        ).toBe(false);
        if (i === c.check.after && c.check.at === 'event')
          expect(
            r.events.some((e) => e.type === 'killed' || e.type === 'unlocked'),
            c.id,
          ).toBe(true);
        s = r.state;
      });
      expect(c.check.after).toBeLessThan(c.moves.length);
      if (c.focus) expect(c.focus.move).toBeLessThan(c.moves.length);
    }
  });

  it('the view stays on the board', () => {
    for (const c of CLIPS) {
      const [x, y, w, h] = c.view;
      expect(x >= 0 && y >= 0 && x + w <= 8 && y + h <= 9, c.id).toBe(true);
    }
  });
});
