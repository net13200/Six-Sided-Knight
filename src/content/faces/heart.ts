import type { FaceDef } from '../../engine/registry';

/** No attack. On the bottom it drinks from healing pools. */
export const Heart: FaceDef = {
  id: 'Heart',
  name: 'Heart',
  glyph: 'H',
  tags: ['heal'],
  attack: 0,
};
