import type { FaceDef } from '../../engine/registry';

/** 1 damage when leading. On top it blocks enemy hits; on the bottom it guards against spikes. */
export const Shield: FaceDef = {
  id: 'Shield',
  name: 'Shield',
  glyph: 'D',
  tags: ['guard'],
  attack: 1,
  modifyIncomingDamage: (amount, slot) => (slot === 'top' ? 0 : amount),
};
