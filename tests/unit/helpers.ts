import { defaultRules } from '../../src/content/register';
import {
  createState,
  describeDie,
  step,
  type CreateOptions,
  type Dir,
  type GameState,
  type LevelData,
  type Rules,
  type StepResult,
} from '../../src/engine';

export const rules = defaultRules();

/**
 * Builds a level from up to 9 rows; rows are padded to 8 wide with walls and
 * missing rows are filled with walls. An exit is required somewhere.
 */
export function level(rows: string[], extra: Partial<LevelData> = {}): LevelData {
  const grid = Array.from({ length: 9 }, (_, y) => (rows[y] ?? '').padEnd(8, '#').slice(0, 8));
  return { schema: 1, id: 'test', name: 'Test', grid, ...extra };
}

export function start(
  rows: string[],
  extra: Partial<LevelData> = {},
  opts: CreateOptions = {},
  r: Rules = rules,
): GameState {
  return createState(r, level(rows, extra), opts);
}

/** Applies moves in order, returning every step result. */
export function run(state: GameState, dirs: string, r: Rules = rules): StepResult[] {
  const out: StepResult[] = [];
  let s = state;
  for (const d of dirs) {
    const res = step(r, s, { type: 'move', dir: d as Dir });
    out.push(res);
    s = res.state;
  }
  return out;
}

export function last(results: StepResult[]): GameState {
  return results[results.length - 1]!.state;
}

export function die(state: GameState): Record<string, string> {
  return describeDie(state.player.die);
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
