import { describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_KEY,
  EVENTS,
  LocalAnalytics,
  RING_CAPACITY,
  validateEvent,
} from '../../src/meta/analytics';
import { MemoryStorage } from '../../src/platform/memory';

function setup(storage = new MemoryStorage()) {
  let t = 1000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const a = new LocalAnalytics(storage, clock.now, () => 'install-1');
  return { a, storage, clock };
}

describe('event schema', () => {
  it('every event has a version and typed props', () => {
    for (const [name, def] of Object.entries(EVENTS)) {
      expect(def.v, name).toBeGreaterThanOrEqual(1);
      for (const type of Object.values(def.props))
        expect(['number', 'string', 'boolean']).toContain(type);
    }
  });

  it('covers every event the KPI plan needs', () => {
    expect(Object.keys(EVENTS).sort()).toEqual(
      [
        'session_start',
        'session_end',
        'tutorial_step_complete',
        'level_start',
        'level_complete',
        'level_fail',
        'level_quit',
        'undo_used',
        'retry_used',
        'daily_started',
        'daily_completed',
        'streak_length',
        'share_clicked',
        'mode_selected',
        'inspect_opened',
        'face_bought',
        'die_changed',
        'crowns_earned',
      ].sort(),
    );
  });

  it('rejects unknown events, missing props, wrong types and extra props', () => {
    expect(validateEvent('nope', {})).toHaveLength(1);
    expect(validateEvent('level_start', { level: 'a' })).toEqual([
      'level_start.mode must be a string',
    ]);
    expect(validateEvent('session_end', { duration_ms: '5' })).toHaveLength(1);
    expect(validateEvent('session_start', { app_version: '1', email: 'x@y.z' })).toHaveLength(1);
  });
});

describe('local analytics', () => {
  it('records events with version, time and session number', () => {
    const { a } = setup();
    a.startSession();
    a.track('level_start', { level: 'c1-01', mode: 'campaign' });
    expect(a.events.map((e) => [e.n, e.v, e.s])).toEqual([
      ['session_start', 2, 1],
      ['level_start', 1, 1],
    ]);
  });

  it('persists and reloads', () => {
    const { a, storage } = setup();
    a.startSession();
    const b = new LocalAnalytics(
      storage,
      () => 0,
      () => 'other',
    );
    expect(b.events).toHaveLength(1);
    expect(b.sessionNumber).toBe(1);
  });

  it('drops invalid events', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { a } = setup();
    // @ts-expect-error deliberately wrong props
    a.track('level_start', { level: 3 });
    expect(a.events).toHaveLength(0);
    warn.mockRestore();
  });

  it('is a capped ring buffer', () => {
    const { a } = setup();
    for (let i = 0; i < RING_CAPACITY + 25; i++) a.track('undo_used', { level: 'x', turn: i });
    expect(a.events).toHaveLength(RING_CAPACITY);
    expect(a.events[0]!.p.turn).toBe(25);
  });

  it('measures session length and merges quick returns', () => {
    const { a, clock } = setup();
    a.startSession();
    clock.advance(60_000);
    a.endSession();
    a.resumeSession(); // back after a quick app switch: same session
    clock.advance(30_000);
    a.endSession();
    const ends = a.events.filter((e) => e.n === 'session_end');
    expect(ends).toHaveLength(1);
    expect(ends[0]!.p.duration_ms).toBe(90_000);
  });

  it('a reload shortly after leaving continues the same session', () => {
    const { a, storage, clock } = setup();
    a.startSession(30 * 60_000);
    clock.advance(10_000);
    a.endSession();
    clock.advance(5_000); // page reloads 5 s later
    const b = new LocalAnalytics(storage, clock.now, () => 'x');
    b.startSession(30 * 60_000);
    expect(b.sessionNumber).toBe(1);
    clock.advance(60_000);
    b.endSession();
    clock.advance(40 * 60_000);
    const c = new LocalAnalytics(storage, clock.now, () => 'x');
    c.startSession(30 * 60_000); // back after 40 minutes: new session
    expect(c.sessionNumber).toBe(2);
    expect(c.events.filter((e) => e.n === 'session_start')).toHaveLength(2);
  });

  it('opting out stops recording and deletes stored events', () => {
    const { a, storage } = setup();
    a.startSession();
    a.setOptOut(true);
    expect(storage.get(ANALYTICS_KEY)).toBeNull();
    a.track('level_start', { level: 'x', mode: 'campaign' });
    expect(a.events).toHaveLength(0);
  });

  it('survives a full store by dropping the oldest events', () => {
    const { a, storage } = setup();
    for (let i = 0; i < 10; i++) a.track('undo_used', { level: 'x', turn: i });
    storage.failWrites = true;
    expect(() => a.track('undo_used', { level: 'x', turn: 99 })).not.toThrow();
  });
});

describe('app version', () => {
  it('session_start records the app version', () => {
    const a = new LocalAnalytics(
      new MemoryStorage(),
      () => 0,
      () => 'id',
      '9.9.9',
    );
    a.startSession();
    expect(a.events[0]!.p).toEqual({ app_version: '9.9.9' });
  });
});
