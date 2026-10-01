import { describe, expect, it } from 'vitest';
import { freshSave } from '../../src/meta/save';
import {
  buySolution,
  OFFER_AGAIN_AFTER,
  shouldOffer,
  SOLVE_PRICE,
  STUCK_AFTER,
} from '../../src/meta/solve-offer';

describe('the "Stuck?" solution offer', () => {
  it('comes after a few struggles, and not again too soon', () => {
    expect(shouldOffer(STUCK_AFTER - 1, null)).toBe(false);
    expect(shouldOffer(STUCK_AFTER, null)).toBe(true);
    expect(shouldOffer(STUCK_AFTER + 1, STUCK_AFTER)).toBe(false);
    expect(shouldOffer(STUCK_AFTER + OFFER_AGAIN_AFTER, STUCK_AFTER)).toBe(true);
  });

  it('costs crowns, and only if the player has them', () => {
    const save = freshSave(1);
    save.wallet.crowns = SOLVE_PRICE - 1;
    expect(buySolution(save)).toBe(false);
    expect(save.wallet.crowns).toBe(SOLVE_PRICE - 1);
    save.wallet.crowns = SOLVE_PRICE + 5;
    expect(buySolution(save)).toBe(true);
    expect(save.wallet.crowns).toBe(5);
    expect(save.wallet.spent).toBe(SOLVE_PRICE);
  });
});
