import type { FaceDef } from '../../engine/registry';

/** No attack. Leading into a chest opens it. */
export const Coin: FaceDef = {
  id: 'Coin',
  name: 'Coin',
  glyph: 'C',
  tags: ['loot'],
  attack: 0,
};
