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
  // Most levels: take no damage. Healing lessons: finish at full HP.
  const noDamage = level.healStar
    ? state.player.hp >= state.player.maxHp
    : state.stats.damageTaken === 0;
  const allGold = state.stats.treasuresCollected >= state.stats.treasuresTotal;
  return { par, noDamage, allGold, count: Number(par) + Number(noDamage) + Number(allGold) };
}

/** The star bitmask for a result (bit 1 par, 2 no damage, 4 all gold). */
export function starMask(r: StarResult): number {
  return (r.par ? 1 : 0) | (r.noDamage ? 2 : 0) | (r.allGold ? 4 : 0);
}
