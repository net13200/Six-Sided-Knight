/** Where a portal build may ask for an ad break. */
import { describe, expect, it } from 'vitest';
import { FIRST_AD_LEVEL, breakAllowed } from '../../src/meta/ad-policy';

describe('where ad breaks may come', () => {
  it('only after the tutorial, never heading into a tutorial level; how often is up to the portal', () => {
    expect(breakAllowed('daily-start', undefined, false)).toBe(false);
    expect(breakAllowed('next-level', 9, true)).toBe(false);
    expect(breakAllowed('next-level', FIRST_AD_LEVEL, true)).toBe(true);
    expect(breakAllowed('daily-start', undefined, true)).toBe(true);
    // No spacing of our own: back-to-back moments are all allowed.
    expect(breakAllowed('next-level', 20, true)).toBe(true);
    expect(breakAllowed('next-level', 21, true)).toBe(true);
  });
});
