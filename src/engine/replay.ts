/**
 * Deterministic replays. A replay is the level id, the creation options and the
 * raw input sequence (including bumps, undos and retries). Replaying it
 * reproduces exactly the same final state and event stream.
 *
 * Input tokens: N E S W (moves), u (undo), r (retry).
 */
import { hashState } from './hash';
import { newHistory, play, retry, undo, type History } from './history';
import { createState, type CreateOptions, type LevelData } from './level';
import type { Rules } from './registry';
import type { Dir, GameEvent, GameState } from './types';

export const REPLAY_VERSION = 1;

export type InputToken = Dir | 'u' | 'r';

export interface Replay {
  readonly version: number;
  readonly level: string;
  readonly options?: CreateOptions;
  /** Tokens as a compact string, e.g. "EENuS". */
  readonly inputs: string;
  /** Optional expectations, checked by verifyReplay. */
  readonly expect?: {
    readonly status?: GameState['status'];
    readonly moves?: number;
    readonly hp?: number;
    readonly gold?: number;
    readonly hash?: string;
  };
}

export interface ReplayResult {
  readonly final: GameState;
  readonly history: History;
  /** Events emitted per input token (empty for undo/retry and ignored input). */
  readonly events: readonly (readonly GameEvent[])[];
  readonly hash: string;
}

export function parseInputs(inputs: string): InputToken[] {
  const out: InputToken[] = [];
  for (const ch of inputs.replace(/\s+/g, '')) {
    if (ch === 'N' || ch === 'E' || ch === 'S' || ch === 'W' || ch === 'u' || ch === 'r') {
      out.push(ch);
    } else {
      throw new Error(`Bad replay input '${ch}'`);
    }
  }
  return out;
}

export function runReplay(rules: Rules, level: LevelData, replay: Replay): ReplayResult {
  if (replay.version !== REPLAY_VERSION) {
    throw new Error(`Unsupported replay version ${replay.version}`);
  }
  if (replay.level !== level.id) {
    throw new Error(`Replay is for level '${replay.level}', not '${level.id}'`);
  }
  let history = newHistory(createState(rules, level, replay.options));
  const events: GameEvent[][] = [];
  for (const token of parseInputs(replay.inputs)) {
    if (token === 'u') {
      history = undo(history);
      events.push([]);
    } else if (token === 'r') {
      history = retry(history);
      events.push([]);
    } else {
      const r = play(rules, history, { type: 'move', dir: token });
      history = r.history;
      events.push([...r.result.events]);
    }
  }
  return { final: history.state, history, events, hash: hashState(history.state) };
}

/** Returns the list of mismatches between the replay's expectations and its result. */
export function verifyReplay(rules: Rules, level: LevelData, replay: Replay): string[] {
  const { final, hash } = runReplay(rules, level, replay);
  const e = replay.expect ?? {};
  const bad: string[] = [];
  const check = (name: string, want: unknown, got: unknown) => {
    if (want !== undefined && want !== got)
      bad.push(`${name}: expected ${String(want)}, got ${String(got)}`);
  };
  check('status', e.status, final.status);
  check('moves', e.moves, final.stats.moves);
  check('hp', e.hp, final.player.hp);
  check('gold', e.gold, final.gold);
  check('hash', e.hash, hash);
  return bad;
}

/** Records inputs as they happen during play, producing a Replay at any time. */
export class ReplayRecorder {
  private tokens = '';
  constructor(
    private readonly level: string,
    private readonly options?: CreateOptions,
  ) {}
  record(token: InputToken): void {
    this.tokens += token;
  }
  toReplay(): Replay {
    return {
      version: REPLAY_VERSION,
      level: this.level,
      ...(this.options ? { options: this.options } : {}),
      inputs: this.tokens,
    };
  }
}
