/**
 * KPI summaries computed from the local event log. Pure functions: pass the
 * events, the campaign order and a clock. The numbers are *local proxies*
 * (one device), meant for playtesting and for validating the hypotheses
 * below once real multi-player data exists.
 */
import type { StoredEvent } from './analytics';

const DAY = 86_400_000;

/** Calendar day number of a timestamp, in the player's time zone. */
export function dayNumber(t: number, tzOffsetMin = 0): number {
  return Math.floor((t - tzOffsetMin * 60_000) / DAY);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface LevelKpi {
  level: string;
  attempts: number;
  completes: number;
  fails: number;
  quits: number;
  /** completes / attempts (attempt = a start or a retry). Null with no attempts. */
  winRate: number | null;
  /** undos / attempts. */
  undoRate: number | null;
  medianTimeMs: number | null;
  /** Outside the 60-90% win-rate band (only once there are enough attempts). */
  flag: 'too hard' | 'too easy' | null;
}

export interface Retention {
  firstDay: number | null;
  daysActive: number;
  /** Active exactly N days after the first session. Null = that day hasn't come yet. */
  d1: boolean | null;
  d7: boolean | null;
  d30: boolean | null;
  /** Active on any day at least N days after the first session. */
  d1Rolling: boolean | null;
  d7Rolling: boolean | null;
  d30Rolling: boolean | null;
}

export interface Hypothesis {
  name: string;
  target: string;
  value: string;
  status: 'pass' | 'fail' | 'not enough data';
}

export interface KpiReport {
  sessions: {
    count: number;
    perDay: Array<{ day: number; count: number }>;
    avgLengthMs: number | null;
    avgLevelsPerSession: number | null;
  };
  levels: LevelKpi[];
  failHeatmap: Array<{ level: string; turn: number; count: number }>;
  tutorial: Array<{ step: number; level: string; completed: boolean }>;
  retention: Retention;
  dailyParticipation: number | null;
  hypotheses: Hypothesis[];
}

export const WIN_BAND = { min: 0.6, max: 0.9 } as const;
/** Minimum attempts before a level's win rate is flagged. */
export const MIN_ATTEMPTS_FOR_FLAG = 5;

export function computeKpis(
  events: readonly StoredEvent[],
  levelOrder: readonly string[],
  tutorialLevels: readonly string[],
  now: number,
  tzOffsetMin = 0,
): KpiReport {
  const day = (t: number) => dayNumber(t, tzOffsetMin);

  // ----- sessions -----
  const sessionStarts = events.filter((e) => e.n === 'session_start');
  const sessionEnds = events.filter((e) => e.n === 'session_end');
  const perDayMap = new Map<number, number>();
  for (const e of sessionStarts) perDayMap.set(day(e.t), (perDayMap.get(day(e.t)) ?? 0) + 1);
  const lengths = sessionEnds.map((e) => Number(e.p.duration_ms));
  const completesBySession = new Map<number, number>();
  for (const e of events) {
    if (e.n === 'level_complete')
      completesBySession.set(e.s, (completesBySession.get(e.s) ?? 0) + 1);
  }
  const sessionIds = new Set(sessionStarts.map((e) => e.s));
  const levelsPerSession = [...sessionIds].map((s) => completesBySession.get(s) ?? 0);

  // ----- levels -----
  // Campaign levels only: generated floors (daily/depths) are one-offs.
  const levelIds = [...levelOrder];
  const levels: LevelKpi[] = levelIds.map((level) => {
    const of = (n: StoredEvent['n']) => events.filter((e) => e.n === n && e.p.level === level);
    const attempts = of('level_start').length + of('retry_used').length;
    const completes = of('level_complete');
    const winRate = attempts ? completes.length / attempts : null;
    let flag: LevelKpi['flag'] = null;
    if (winRate !== null && attempts >= MIN_ATTEMPTS_FOR_FLAG) {
      if (winRate < WIN_BAND.min) flag = 'too hard';
      else if (winRate > WIN_BAND.max) flag = 'too easy';
    }
    return {
      level,
      attempts,
      completes: completes.length,
      fails: of('level_fail').length,
      quits: of('level_quit').length,
      winRate,
      undoRate: attempts ? of('undo_used').length / attempts : null,
      medianTimeMs: median(completes.map((e) => Number(e.p.time_ms))),
      flag,
    };
  });

  // ----- fail heatmap -----
  const heat = new Map<string, { level: string; turn: number; count: number }>();
  for (const e of events) {
    if (e.n !== 'level_fail') continue;
    const key = `${String(e.p.level)}@${String(e.p.turn)}`;
    const cell = heat.get(key) ?? { level: String(e.p.level), turn: Number(e.p.turn), count: 0 };
    cell.count++;
    heat.set(key, cell);
  }
  const failHeatmap = [...heat.values()].sort((a, b) => b.count - a.count || a.turn - b.turn);

  // ----- tutorial funnel -----
  const done = new Set(
    events.filter((e) => e.n === 'tutorial_step_complete').map((e) => Number(e.p.step)),
  );
  const tutorial = tutorialLevels.map((level, i) => ({
    step: i + 1,
    level,
    completed: done.has(i + 1),
  }));

  // ----- retention -----
  const activeDays = new Set(sessionStarts.map((e) => day(e.t)));
  const firstDay = activeDays.size ? Math.min(...activeDays) : null;
  const today = day(now);
  const exact = (n: number) =>
    firstDay === null || today < firstDay + n ? null : activeDays.has(firstDay + n);
  const rolling = (n: number) =>
    firstDay === null || today < firstDay + n
      ? null
      : [...activeDays].some((d) => d >= firstDay + n);
  const retention: Retention = {
    firstDay,
    daysActive: activeDays.size,
    d1: exact(1),
    d7: exact(7),
    d30: exact(30),
    d1Rolling: rolling(1),
    d7Rolling: rolling(7),
    d30Rolling: rolling(30),
  };

  // ----- daily participation among returning sessions -----
  const returning = firstDay === null ? [] : sessionStarts.filter((e) => day(e.t) > firstDay);
  const dailySessions = new Set(events.filter((e) => e.n === 'daily_started').map((e) => e.s));
  const dailyParticipation = returning.length
    ? returning.filter((e) => dailySessions.has(e.s)).length / returning.length
    : null;

  // ----- hypotheses (targets, not facts) -----
  const avgLevels = levelsPerSession.length
    ? levelsPerSession.reduce((a, b) => a + b, 0) / levelsPerSession.length
    : null;
  const tutorialRate = tutorial.length
    ? tutorial.filter((s) => s.completed).length / tutorial.length
    : 0;
  const tutorialStarted = events.some(
    (e) => e.n === 'level_start' && tutorialLevels.includes(String(e.p.level)),
  );
  const flagged = levels.filter((l) => l.flag);
  const rated = levels.filter((l) => l.attempts >= MIN_ATTEMPTS_FOR_FLAG);
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  const hypotheses: Hypothesis[] = [
    {
      name: 'Tutorial completion',
      target: '> 85%',
      value: tutorialStarted ? pct(tutorialRate) : '-',
      status: !tutorialStarted ? 'not enough data' : tutorialRate > 0.85 ? 'pass' : 'fail',
    },
    {
      name: 'Levels per session',
      target: '>= 3',
      value: avgLevels === null ? '-' : avgLevels.toFixed(1),
      status: avgLevels === null ? 'not enough data' : avgLevels >= 3 ? 'pass' : 'fail',
    },
    {
      name: 'D1 return',
      target: 'as high as possible',
      value: retention.d1 === null ? '-' : retention.d1 ? 'returned' : 'did not return',
      status: retention.d1 === null ? 'not enough data' : retention.d1 ? 'pass' : 'fail',
    },
    {
      name: 'Daily mode among returning sessions',
      target: 'most returning sessions',
      value: dailyParticipation === null ? '-' : pct(dailyParticipation),
      status:
        dailyParticipation === null
          ? 'not enough data'
          : dailyParticipation >= 0.5
            ? 'pass'
            : 'fail',
    },
    {
      name: 'Levels in the 60-90% win band',
      target: 'all levels',
      value: rated.length
        ? `${rated.length - flagged.length}/${rated.length} (flagged: ${flagged.map((l) => l.level).join(', ') || 'none'})`
        : '-',
      status: rated.length === 0 ? 'not enough data' : flagged.length === 0 ? 'pass' : 'fail',
    },
  ];

  return {
    sessions: {
      count: sessionStarts.length,
      perDay: [...perDayMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([d, count]) => ({ day: d, count })),
      avgLengthMs: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null,
      avgLevelsPerSession: avgLevels,
    },
    levels,
    failHeatmap,
    tutorial,
    retention,
    dailyParticipation,
    hypotheses,
  };
}
