import { describe, expect, it } from 'vitest';
import {
  createState,
  parseTextLevel,
  step,
  type GameEvent,
  type GameState,
} from '../../src/engine';
import { lessonFor } from '../../src/game/lessons';
import { CLIPS, clipFor, type Reel } from '../../src/game/lesson-clips';
import { loadCampaign } from '../../src/levels/campaign';
import { rules } from './helpers';

/** Plays a reel (all its floors, HP carried over): the events of each move. */
function play(name: string, reel: Reel): GameEvent[][] {
  const out: GameEvent[][] = [];
  let hp = reel.hp;
  for (const floor of [{ level: reel.level, moves: reel.moves }, ...(reel.floors ?? [])]) {
    let s: GameState = createState(rules, parseTextLevel(floor.level));
    expect(s.width, name).toBe(8);
    expect(s.height, name).toBe(9);
    if (hp !== undefined) s = { ...s, player: { ...s.player, hp } };
    floor.moves.forEach((dir, i) => {
      const r = step(rules, s, { type: 'move', dir });
      expect(r.consumed, `${name} move ${i}`).toBe(true);
      out.push([...r.events]);
      s = r.state;
    });
    expect(s.status, name).not.toBe('lost');
    hp = s.player.hp;
  }
  return out;
}

const DONE = new Set(['killed', 'unlocked', 'opened', 'pulled', 'effectApplied']);

describe('lesson clips', () => {
  it('each clip replaces the lesson of real campaign levels', () => {
    const levels = new Map(loadCampaign(rules).map((l) => [l.id, l]));
    const seen = new Set<string>();
    for (const c of CLIPS) {
      for (const id of c.levels) {
        expect(levels.has(id), `${c.id}: ${id}`).toBe(true);
        expect(lessonFor(levels.get(id)!), `${c.id}: ${id}`).not.toBeNull();
        expect(clipFor(id)).toBe(c);
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
    }
  });

  it('every move plays, nothing hurts, and the checked move does what it shows', () => {
    for (const c of CLIPS) {
      const moves = play(c.id, c);
      // hurting is the point only where HP is shown (a gauntlet)
      if (!c.hearts)
        expect(
          moves.flat().some((e) => e.type === 'hurt'),
          c.id,
        ).toBe(false);
      expect(c.check.after).toBeLessThan(moves.length);
      if (c.check.at === 'event')
        expect(
          moves[c.check.after]!.some((e) => DONE.has(e.type)),
          c.id,
        ).toBe(true);
      for (const f of c.focus ?? []) expect(f.move, c.id).toBeLessThan(moves.length);
    }
  });

  it('the wrong way, beside, fails: it hurts, or the hit does nothing', () => {
    for (const c of CLIPS) {
      if (!c.beside) continue;
      const moves = play(`${c.id} (beside)`, c.beside);
      const marked = moves[c.beside.check!.after]!;
      const failed =
        marked.some((e) => e.type === 'hurt') ||
        marked.some((e) => e.type === 'attacked' && e.damage === 0);
      expect(failed, c.id).toBe(true);
      expect(
        marked.some((e) => DONE.has(e.type)),
        c.id,
      ).toBe(false);
    }
  });

  it('the view stays on the board', () => {
    for (const c of CLIPS) {
      const [x, y, w, h] = c.view;
      expect(x >= 0 && y >= 0 && x + w <= 8 && y + h <= 9, c.id).toBe(true);
    }
  });
});
