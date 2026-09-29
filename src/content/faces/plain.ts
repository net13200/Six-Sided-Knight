import type { FaceDef } from '../../engine/registry';

/**
 * Plain faces: ordinary dice pips that do nothing. The first levels use them
 * for the faces the player hasn't learned yet, so every tool on the die is
 * one they know. One per home slot (top 1, bottom 6, north 2, south 5,
 * east 3, west 4: opposite sides add up to 7, like a real die).
 */
function plain(pips: number): FaceDef {
  return { id: `Pip${pips}`, name: 'Plain', glyph: String(pips), tags: ['plain'], attack: 0 };
}

export const PLAIN_FACES: readonly FaceDef[] = [1, 2, 3, 4, 5, 6].map(plain);

/** The plain face for each home slot (top, bottom, north, south, east, west). */
export const PLAIN_BY_SLOT = ['Pip1', 'Pip6', 'Pip2', 'Pip5', 'Pip3', 'Pip4'] as const;
