import type { FaceDef } from '../../engine/registry';

/** No attack. Leading into a locked door opens it. */
export const Key: FaceDef = {
  id: 'Key',
  name: 'Key',
  glyph: 'K',
  tags: ['unlock'],
  attack: 0,
};
