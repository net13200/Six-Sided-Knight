import { describe, expect, it } from 'vitest';
import { freshSave } from '../../src/meta/save';
import {
  STARTING_FACES,
  buyFace,
  crownsForStars,
  earnCrowns,
  isValidLoadout,
  ownedFaces,
  placeFace,
  playerLoadout,
} from '../../src/meta/store';

describe('crowns and the store', () => {
  it('stars pay 10 crowns each; buying spends them once', () => {
    const s = freshSave(0);
    earnCrowns(s, crownsForStars(35));
    expect(s.wallet).toEqual({ crowns: 350, earned: 350, spent: 0 });
    expect(buyFace(s, 'Hook')).toBe('bought');
    expect(buyFace(s, 'Hook')).toBe('owned');
    expect(buyFace(s, 'Freeze')).toBe('too-poor');
    expect(buyFace(s, 'Sword')).toBe('not-for-sale');
    expect(s.wallet).toEqual({ crowns: 50, earned: 350, spent: 300 });
    expect(ownedFaces(s)).toEqual([...STARTING_FACES, 'Hook']);
  });

  it('builds a die from owned faces only, without duplicates', () => {
    const s = freshSave(0);
    expect(playerLoadout(s)).toEqual([...STARTING_FACES]);
    const withHook = placeFace(STARTING_FACES, 5, 'Hook');
    expect(isValidLoadout(s, withHook)).toBe(false); // not owned yet
    s.owned.push('Hook');
    expect(isValidLoadout(s, withHook)).toBe(true);
    s.die = withHook;
    expect(playerLoadout(s)).toEqual(withHook);
    // Invalid saved dice fall back to the default.
    s.die = ['Sword', 'Sword', 'Bomb', 'Key', 'Heart', 'Coin'];
    expect(playerLoadout(s)).toEqual([...STARTING_FACES]);
  });

  it('placing a face already on the die swaps the two slots', () => {
    const d = placeFace(STARTING_FACES, 0, 'Sword'); // Sword was east (slot 4)
    expect(d[0]).toBe('Sword');
    expect(d[4]).toBe(STARTING_FACES[0]);
    expect(new Set(d).size).toBe(6);
  });
});
