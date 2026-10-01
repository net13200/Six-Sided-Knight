/**
 * "Stuck? See the solution": offered to a player who keeps failing a level,
 * never on the play screen itself (portal ad rules). They can pay crowns,
 * earned in play, or (where there are ads) watch a rewarded ad instead.
 */
import type { SaveData } from './save';

/** Crowns for one solution. */
export const SOLVE_PRICE = 100;

/** Knock-outs plus retries on this visit to the level before the offer shows up. */
export const STUCK_AFTER = 3;
/** After the offer was shown, this many more struggles before it comes back. */
export const OFFER_AGAIN_AFTER = 4;

/**
 * Whether to offer the solution now: once the player has struggled enough,
 * and not again too soon after the last offer.
 */
export function shouldOffer(struggles: number, lastOfferedAt: number | null): boolean {
  if (struggles < STUCK_AFTER) return false;
  return lastOfferedAt === null || struggles - lastOfferedAt >= OFFER_AGAIN_AFTER;
}

export function canAffordSolution(save: SaveData): boolean {
  return save.wallet.crowns >= SOLVE_PRICE;
}

/** Pays for a solution. Returns false (and changes nothing) if the player can't afford it. */
export function buySolution(save: SaveData): boolean {
  if (!canAffordSolution(save)) return false;
  save.wallet.crowns -= SOLVE_PRICE;
  save.wallet.spent += SOLVE_PRICE;
  return true;
}
