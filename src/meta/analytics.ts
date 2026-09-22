/**
 * Privacy-respecting local analytics. Events carry no personal data: only a
 * random per-install id (never sent anywhere), game facts and timestamps.
 * Events are logged to the console (debug mode) and kept in a capped ring
 * buffer in local storage for the on-device KPI panel. Opting out stops
 * recording and deletes what was stored.
 */
import type { KeyValueStorage } from '../platform/platform';

export const ANALYTICS_KEY = 'ssk.analytics';
export const ANALYTICS_SCHEMA = 1;
export const RING_CAPACITY = 3000;

type PropType = 'number' | 'string' | 'boolean';

/**
 * Event schema. Each event has a version; changing an event's meaning or
 * props means bumping its version so old and new data are never mixed.
 */
export const EVENTS = {
  session_start: { v: 1, props: {} },
  session_end: { v: 1, props: { duration_ms: 'number' } },
  tutorial_step_complete: { v: 1, props: { step: 'number', level: 'string' } },
  level_start: { v: 1, props: { level: 'string', mode: 'string' } },
  level_complete: {
    v: 1,
    props: { level: 'string', moves: 'number', hp: 'number', stars: 'number', time_ms: 'number' },
  },
  level_fail: { v: 1, props: { level: 'string', turn: 'number', time_ms: 'number' } },
  level_quit: { v: 1, props: { level: 'string', moves: 'number', time_ms: 'number' } },
  undo_used: { v: 1, props: { level: 'string', turn: 'number' } },
  retry_used: { v: 1, props: { level: 'string', turn: 'number' } },
  daily_started: { v: 1, props: { date: 'string' } },
  daily_completed: { v: 1, props: { date: 'string', moves: 'number', hp: 'number' } },
  streak_length: { v: 1, props: { days: 'number' } },
  share_clicked: { v: 1, props: { mode: 'string', result: 'string' } },
  mode_selected: { v: 1, props: { mode: 'string' } },
} as const satisfies Record<string, { v: number; props: Record<string, PropType> }>;

export type EventName = keyof typeof EVENTS;

type PropsOf<N extends EventName> = {
  [K in keyof (typeof EVENTS)[N]['props']]: (typeof EVENTS)[N]['props'][K] extends 'number'
    ? number
    : (typeof EVENTS)[N]['props'][K] extends 'boolean'
      ? boolean
      : string;
};

export interface StoredEvent {
  /** Event name. */
  n: EventName;
  /** Event schema version. */
  v: number;
  /** Timestamp (ms since epoch). */
  t: number;
  /** Session number on this device. */
  s: number;
  /** Props. */
  p: Record<string, string | number | boolean>;
}

interface Stored {
  schema: number;
  installId: string;
  sessionCount: number;
  events: StoredEvent[];
}

/** Checks props against the schema. Returns a list of problems (empty = valid). */
export function validateEvent(name: string, props: Record<string, unknown>): string[] {
  const def = (EVENTS as Record<string, { props: Record<string, PropType> }>)[name];
  if (!def) return [`unknown event '${name}'`];
  const problems: string[] = [];
  for (const [key, type] of Object.entries(def.props)) {
    if (typeof props[key] !== type) problems.push(`${name}.${key} must be a ${type}`);
  }
  for (const key of Object.keys(props)) {
    if (!(key in def.props)) problems.push(`${name}.${key} is not in the schema`);
  }
  return problems;
}

export class LocalAnalytics {
  private data: Stored;
  private sessionStart = 0;
  private inSession = false;
  optedOut = false;
  /** Log each event to the console. */
  verbose = false;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly now: () => number,
    private readonly randomId: () => string,
  ) {
    this.data = this.read();
  }

  get events(): readonly StoredEvent[] {
    return this.data.events;
  }

  get sessionNumber(): number {
    return this.data.sessionCount;
  }

  track<N extends EventName>(name: N, props: PropsOf<N>): void {
    if (this.optedOut) return;
    const p = props as Record<string, string | number | boolean>;
    const problems = validateEvent(name, p);
    if (problems.length) {
      console.warn('[analytics] dropped invalid event', problems);
      return;
    }
    const e: StoredEvent = {
      n: name,
      v: EVENTS[name].v,
      t: this.now(),
      s: this.data.sessionCount,
      p,
    };
    this.data.events.push(e);
    if (this.data.events.length > RING_CAPACITY) {
      this.data.events.splice(0, this.data.events.length - RING_CAPACITY);
    }
    if (this.verbose) console.info('[analytics]', name, p);
    this.write();
  }

  /**
   * Starts a session (on load, or on return after being away a long time).
   * If the previous session ended less than `resumeWithinMs` ago (a reload,
   * a quick app switch), it is continued instead.
   */
  startSession(resumeWithinMs = 0): void {
    if (this.inSession) return;
    const last = this.data.events[this.data.events.length - 1];
    if (
      resumeWithinMs > 0 &&
      last?.n === 'session_end' &&
      last.s === this.data.sessionCount &&
      this.now() - last.t < resumeWithinMs
    ) {
      this.sessionStart = this.now() - Number(last.p.duration_ms);
      this.resumeSession();
      return;
    }
    this.inSession = true;
    this.sessionStart = this.now();
    if (this.optedOut) return;
    this.data.sessionCount++;
    this.track('session_start', {});
  }

  /**
   * Re-opens the current session after a short absence: removes the
   * session_end written when the page was hidden, so one sitting with a
   * quick app switch counts as one session.
   */
  resumeSession(): void {
    if (this.inSession) return;
    const last = this.data.events[this.data.events.length - 1];
    if (last && last.n === 'session_end' && last.s === this.data.sessionCount) {
      this.data.events.pop();
      this.write();
    }
    this.inSession = true;
  }

  endSession(): void {
    if (!this.inSession) return;
    this.inSession = false;
    this.track('session_end', { duration_ms: Math.max(0, this.now() - this.sessionStart) });
  }

  setOptOut(optOut: boolean): void {
    this.optedOut = optOut;
    if (optOut) {
      this.data.events = [];
      this.storage.remove(ANALYTICS_KEY);
    }
  }

  clear(): void {
    this.data = { ...this.data, events: [] };
    this.write();
  }

  export(): string {
    return JSON.stringify(this.data, null, 2);
  }

  private read(): Stored {
    try {
      const raw = this.storage.get(ANALYTICS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Stored>;
        if (parsed.schema === ANALYTICS_SCHEMA && Array.isArray(parsed.events)) {
          return {
            schema: ANALYTICS_SCHEMA,
            installId: String(parsed.installId ?? this.randomId()),
            sessionCount: Number(parsed.sessionCount ?? 0),
            events: parsed.events,
          };
        }
      }
    } catch {
      // unreadable: start over (analytics is best-effort)
    }
    return { schema: ANALYTICS_SCHEMA, installId: this.randomId(), sessionCount: 0, events: [] };
  }

  private write(): void {
    if (this.optedOut) return;
    if (!this.storage.set(ANALYTICS_KEY, JSON.stringify(this.data))) {
      // Storage full: drop the oldest half and try once more.
      this.data.events.splice(0, Math.ceil(this.data.events.length / 2));
      this.storage.set(ANALYTICS_KEY, JSON.stringify(this.data));
    }
  }
}
