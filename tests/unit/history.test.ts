import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ReplayRecorder,
  hashState,
  newHistory,
  play,
  retry,
  runReplay,
  undo,
  verifyReplay,
  type Replay,
} from '../../src/engine';
import { deepFreeze, level, rules, start } from './helpers';

const BUSY = level(['#@k*^~$#', '#..|...#', '#s..k..#', '#.*....#', '#....s.>'], {
  start: { east: 'Bomb' },
});

describe('undo and retry', () => {
  it('undo returns the exact previous state', () => {
    const h0 = newHistory(start(['#@....>#']));
    const { history: h1 } = play(rules, h0, { type: 'move', dir: 'E' });
    expect(h1.depth).toBe(1);
    expect(undo(h1).state).toBe(h0.state);
    expect(undo(h0)).toBe(h0); // no-op at the start
  });

  it('invalid bumps do not add history entries', () => {
    const h0 = newHistory(start(['#@....>#']));
    expect(play(rules, h0, { type: 'move', dir: 'W' }).history).toBe(h0);
  });

  it('undo steps back out of a loss', () => {
    const h0 = newHistory(start(['#@^...>#'], {}, { hp: 1 }));
    const { history: dead } = play(rules, h0, { type: 'move', dir: 'E' });
    expect(dead.state.status).toBe('lost');
    expect(undo(dead).state.status).toBe('playing');
  });

  it('retry returns to the initial state', () => {
    let h = newHistory(start(['#@....>#']));
    const initial = h.state;
    for (const dir of ['E', 'E', 'E'] as const) h = play(rules, h, { type: 'move', dir }).history;
    expect(retry(h).state).toBe(initial);
    expect(retry(h).depth).toBe(0);
  });
});

describe('replays', () => {
  const inputs = fc.stringMatching(/^[NESWur]{0,60}$/);

  it('are deterministic: same inputs, same state and events', () => {
    fc.assert(
      fc.property(inputs, fc.integer({ min: 0, max: 2 ** 32 - 1 }), (text, seed) => {
        const replay: Replay = { version: 1, level: 'test', options: { seed }, inputs: text };
        const a = runReplay(rules, BUSY, replay);
        const b = runReplay(rules, BUSY, replay);
        expect(a.hash).toBe(b.hash);
        expect(a.events).toEqual(b.events);
      }),
      { numRuns: 200 },
    );
  });

  it('never mutate earlier states', () => {
    fc.assert(
      fc.property(inputs, (text) => {
        const replay: Replay = { version: 1, level: 'test', inputs: text };
        const first = runReplay(rules, BUSY, replay);
        // Freeze every state in the history, then replay again from scratch:
        // if step mutated anything, a frozen object would throw on the next run.
        for (let h: typeof first.history | null = first.history; h; h = h.prev) deepFreeze(h.state);
        const again = runReplay(rules, BUSY, replay);
        expect(again.hash).toBe(first.hash);
      }),
      { numRuns: 100 },
    );
  });

  it('a consumed move followed by undo leaves no trace', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[NESW]{0,30}$/),
        fc.constantFrom('N', 'E', 'S', 'W'),
        (p, m) => {
          const base = runReplay(rules, BUSY, { version: 1, level: 'test', inputs: p });
          const withMove = runReplay(rules, BUSY, { version: 1, level: 'test', inputs: p + m });
          if (withMove.history.depth === base.history.depth) return; // bump or game over: nothing to undo
          const undone = runReplay(rules, BUSY, { version: 1, level: 'test', inputs: `${p}${m}u` });
          expect(undone.hash).toBe(base.hash);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('verifyReplay checks recorded expectations', () => {
    const rec = new ReplayRecorder('test');
    for (const t of ['E', 'u', 'S', 'S'] as const) rec.record(t);
    const replay = rec.toReplay();
    const result = runReplay(rules, BUSY, replay);
    const good: Replay = {
      ...replay,
      expect: {
        status: result.final.status,
        hp: result.final.player.hp,
        hash: hashState(result.final),
      },
    };
    expect(verifyReplay(rules, BUSY, good)).toEqual([]);
    expect(verifyReplay(rules, BUSY, { ...good, expect: { hp: 99 } })).toHaveLength(1);
  });

  it('reject unknown versions, wrong levels and bad tokens', () => {
    expect(() => runReplay(rules, BUSY, { version: 2, level: 'test', inputs: '' })).toThrow();
    expect(() => runReplay(rules, BUSY, { version: 1, level: 'other', inputs: '' })).toThrow();
    expect(() => runReplay(rules, BUSY, { version: 1, level: 'test', inputs: 'X' })).toThrow();
  });
});
