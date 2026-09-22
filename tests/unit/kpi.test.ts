import { describe, expect, it } from 'vitest';
import type { EventName, StoredEvent } from '../../src/meta/analytics';
import { computeKpis, dayNumber, median } from '../../src/meta/kpi';

const DAY = 86_400_000;
const T0 = 100 * DAY; // day 100, midnight UTC

function ev(n: EventName, t: number, s: number, p: StoredEvent['p'] = {}): StoredEvent {
  return { n, v: 1, t, s, p };
}

function sessionWith(
  s: number,
  start: number,
  lengthMs: number,
  body: StoredEvent[] = [],
): StoredEvent[] {
  return [
    ev('session_start', start, s),
    ...body,
    ev('session_end', start + lengthMs, s, { duration_ms: lengthMs }),
  ];
}

describe('helpers', () => {
  it('median', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('dayNumber respects the time zone', () => {
    expect(dayNumber(T0 + 1000)).toBe(100);
    // 01:00 UTC is still the previous day in UTC-5 (offset +300 minutes).
    expect(dayNumber(T0 + 3_600_000, 300)).toBe(99);
  });
});

describe('computeKpis', () => {
  const win = (s: number, t: number, level: string, time: number) =>
    ev('level_complete', t, s, { level, moves: 5, hp: 5, stars: 3, time_ms: time });
  const start = (s: number, t: number, level: string) =>
    ev('level_start', t, s, { level, mode: 'campaign' });

  const events: StoredEvent[] = [
    ...sessionWith(1, T0 + 1000, 300_000, [
      start(1, T0 + 2000, 'a'),
      win(1, T0 + 3000, 'a', 20_000),
      ev('tutorial_step_complete', T0 + 3000, 1, { step: 1, level: 'a' }),
      start(1, T0 + 4000, 'b'),
      ev('undo_used', T0 + 5000, 1, { level: 'b', turn: 3 }),
      ev('level_fail', T0 + 6000, 1, { level: 'b', turn: 4, time_ms: 9000 }),
      ev('retry_used', T0 + 7000, 1, { level: 'b', turn: 4 }),
      win(1, T0 + 8000, 'b', 40_000),
    ]),
    // Day 1: came back and played the daily.
    ...sessionWith(2, T0 + DAY + 1000, 120_000, [
      ev('daily_started', T0 + DAY + 2000, 2, { date: '1970-04-11' }),
      start(2, T0 + DAY + 3000, 'b'),
      win(2, T0 + DAY + 4000, 'b', 30_000),
    ]),
  ];

  const r = computeKpis(events, ['a', 'b', 'c'], ['a', 'b'], T0 + 3 * DAY);

  it('summarizes sessions', () => {
    expect(r.sessions.count).toBe(2);
    expect(r.sessions.perDay).toEqual([
      { day: 100, count: 1 },
      { day: 101, count: 1 },
    ]);
    expect(r.sessions.avgLengthMs).toBe(210_000);
    expect(r.sessions.avgLevelsPerSession).toBe(1.5);
  });

  it('computes per-level rates and times', () => {
    const b = r.levels.find((l) => l.level === 'b')!;
    expect(b.attempts).toBe(3); // two starts + one retry
    expect(b.completes).toBe(2);
    expect(b.winRate).toBeCloseTo(2 / 3);
    expect(b.undoRate).toBeCloseTo(1 / 3);
    expect(b.medianTimeMs).toBe(35_000);
    expect(r.levels.find((l) => l.level === 'c')).toMatchObject({ attempts: 0, winRate: null });
  });

  it('builds the fail heatmap and tutorial funnel', () => {
    expect(r.failHeatmap).toEqual([{ level: 'b', turn: 4, count: 1 }]);
    expect(r.tutorial).toEqual([
      { step: 1, level: 'a', completed: true },
      { step: 2, level: 'b', completed: false },
    ]);
  });

  it('computes return proxies, leaving future days open', () => {
    expect(r.retention).toMatchObject({
      firstDay: 100,
      daysActive: 2,
      d1: true,
      d7: null,
      d30: null,
    });
    const later = computeKpis(events, [], [], T0 + 10 * DAY);
    expect(later.retention).toMatchObject({ d7: false, d7Rolling: false, d30: null });
  });

  it('measures daily participation among returning sessions', () => {
    expect(r.dailyParticipation).toBe(1);
  });

  it('flags levels outside the win band once there is enough data', () => {
    const many: StoredEvent[] = [];
    for (let i = 0; i < 6; i++) {
      many.push(start(1, T0 + i, 'hard'));
      many.push(start(1, T0 + i, 'easy'), win(1, T0 + i, 'easy', 1000));
    }
    many.push(win(1, T0 + 99, 'hard', 1000));
    const k = computeKpis(many, ['hard', 'easy'], [], T0);
    expect(k.levels.map((l) => l.flag)).toEqual(['too hard', 'too easy']);
    expect(k.hypotheses.find((h) => h.name.includes('win band'))!.status).toBe('fail');
  });

  it('reports hypotheses with honest "not enough data"', () => {
    const empty = computeKpis([], ['a'], ['a'], T0);
    expect(empty.hypotheses.every((h) => h.status === 'not enough data')).toBe(true);
  });
});
