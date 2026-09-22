/** Star rating for a finished campaign level (SPEC section 9). Pure. */
import type { GameState, LevelData } from '../engine';

export interface StarResult {
  readonly par: boolean;
  readonly noDamage: boolean;
  readonly allGold: boolean;
  readonly count: number;
}

export function computeStars(level: LevelData, state: GameState): StarResult {
  if (state.status !== 'won') return { par: false, noDamage: false, allGold: false, count: 0 };
  const par = level.par === undefined || state.stats.moves <= level.par;
  const noDamage = state.stats.damageTaken === 0;
  const allGold = state.stats.treasuresCollected >= state.stats.treasuresTotal;
  return { par, noDamage, allGold, count: Number(par) + Number(noDamage) + Number(allGold) };
}
