import { describe, expect, it } from 'vitest';
import { LESSONS, lessonFor } from '../../src/game/lessons';
import { HOW_TO_PLAY } from '../../src/game/how-to-play';
import { loadCampaign } from '../../src/levels/campaign';
import { rules } from './helpers';

const levels = loadCampaign(rules);

describe('lessons', () => {
  it('every lesson belongs to a real level, and every tutorial level has one', () => {
    const ids = new Set(levels.map((l) => l.id));
    for (const id of Object.keys(LESSONS)) expect(ids.has(id), id).toBe(true);
    for (const l of levels.slice(0, 10)) expect(LESSONS[l.id], l.id).toBeDefined();
  });

  it('levels without their own lesson show their hint; no hint, no lesson', () => {
    const hinted = levels.find((l) => l.hint && !LESSONS[l.id])!;
    expect(lessonFor(hinted)).toEqual({ title: hinted.name, text: hinted.hint });
    const plain = levels.find((l) => !l.hint && !LESSONS[l.id])!;
    expect(lessonFor(plain)).toBeNull();
  });

  it('lessons stay short enough to read on the board', () => {
    for (const [id, l] of Object.entries(LESSONS))
      expect(l.text.length, id).toBeLessThanOrEqual(190);
  });

  it('how to play covers every section', () => {
    expect(HOW_TO_PLAY.map((s) => s.heading)).toEqual([
      'Rolling',
      'Faces',
      'Tiles',
      'Enemies',
      'Stars and crowns',
      'Modes',
      'Keys',
    ]);
  });
});
