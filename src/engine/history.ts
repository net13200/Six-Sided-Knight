/**
 * Undo history for one level attempt. A persistent linked list of states, so
 * pushing and undoing are O(1) and nothing is ever mutated.
 */
import type { Rules } from './registry';
import { step } from './step';
import type { Action, GameState, StepResult } from './types';

export interface History {
  readonly state: GameState;
  readonly prev: History | null;
  /** Number of states below this one (0 = initial state). */
  readonly depth: number;
}

export function newHistory(initial: GameState): History {
  return { state: initial, prev: null, depth: 0 };
}

export function initialOf(h: History): GameState {
  let cur = h;
  while (cur.prev) cur = cur.prev;
  return cur.state;
}

/** Applies an action. Invalid bumps do not add a history entry. */
export function play(
  rules: Rules,
  h: History,
  action: Action,
): { history: History; result: StepResult } {
  const result = step(rules, h.state, action);
  if (!result.consumed) return { history: h, result };
  return { history: { state: result.state, prev: h, depth: h.depth + 1 }, result };
}

/** Steps back one action (also out of a lost state). No-op at the start. */
export function undo(h: History): History {
  return h.prev ?? h;
}

/** Back to the level's initial state. */
export function retry(h: History): History {
  return newHistory(initialOf(h));
}
