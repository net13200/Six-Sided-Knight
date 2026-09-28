/**
 * Star rating for a finished level (SPEC section 9). Stars are about moves
 * only: ★★★ at par or better, ★★ within a few moves of par, ★ for finishing.
 * Pure.
 */
import type { GameState, LevelData } from '../engine';

export interface StarResult {
  /** 0 (not won) to 3. */
  readonly count: number;
  readonly moves: number;
  /** Most moves for ★★★ (the par), if the level has one. */
  readonly par?: number;
  /** Most moves for ★★. */
  readonly twoStar?: number;
}

/** Most moves that still earn ★★: par plus a quarter (at least 2 extra moves). */
export function twoStarLimit(par: number): number {
  return par + Math.max(2, Math.ceil(par / 4));
}

export function computeStars(level: LevelData, state: GameState): StarResult {
  const moves = state.stats.moves;
  if (state.status !== 'won') return { count: 0, moves };
  if (level.par === undefined) return { count: 3, moves };
  const par = level.par;
  const twoStar = twoStarLimit(par);
  const count = moves <= par ? 3 : moves <= twoStar ? 2 : 1;
  return { count, moves, par, twoStar };
}
