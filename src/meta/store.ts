/**
 * Crowns, the face store and the player's custom die. Pure functions over
 * the save data.
 *
 * - Every star earned for the first time pays CROWNS_PER_STAR crowns
 *   (campaign stars, the day's first Daily Roll, and Depths floors past your
 *   record). Replaying for the same stars pays nothing.
 * - Crowns buy new faces. A face changes what the
 *   die can do in Daily Roll and Depths, where the player builds their own die.
 *   Campaign levels always use their fixed die.
 */
import { CORE_CONFIG } from '../content/register';
import { CROWNS_PER_STAR, type SaveData } from './save';

export { CROWNS_PER_STAR };

/** The faces every player starts with, in their default home slots. */
export const STARTING_FACES: readonly string[] = CORE_CONFIG.defaultLoadout;

export interface StoreItem {
  readonly face: string;
  readonly price: number;
}

/** Faces for sale, in shelf order. New faces are added here. */
export const STORE: readonly StoreItem[] = [
  { face: 'Freeze', price: 200 },
  { face: 'Hook', price: 300 },
];

export function priceOf(face: string): number | null {
  return STORE.find((i) => i.face === face)?.price ?? null;
}

export function earnCrowns(save: SaveData, amount: number): number {
  const n = Math.max(0, Math.floor(amount));
  save.wallet.crowns += n;
  save.wallet.earned += n;
  return n;
}

/** Crowns for stars earned for the first time. */
export function crownsForStars(newStars: number): number {
  return Math.max(0, newStars) * CROWNS_PER_STAR;
}

export function ownsFace(save: SaveData, face: string): boolean {
  return STARTING_FACES.includes(face) || save.owned.includes(face);
}

/** Every face the player can put on their die: the starting six, then purchases in shelf order. */
export function ownedFaces(save: SaveData): string[] {
  return [
    ...STARTING_FACES,
    ...STORE.filter((i) => save.owned.includes(i.face)).map((i) => i.face),
  ];
}

export type BuyResult = 'bought' | 'owned' | 'too-poor' | 'not-for-sale';

export function buyFace(save: SaveData, face: string): BuyResult {
  const price = priceOf(face);
  if (price === null) return 'not-for-sale';
  if (ownsFace(save, face)) return 'owned';
  if (save.wallet.crowns < price) return 'too-poor';
  save.wallet.crowns -= price;
  save.wallet.spent += price;
  save.owned.push(face);
  return 'bought';
}

/** A die is valid with one face per slot, no duplicates, all owned. */
export function isValidLoadout(save: SaveData, loadout: readonly string[]): boolean {
  return (
    loadout.length === STARTING_FACES.length &&
    new Set(loadout).size === loadout.length &&
    loadout.every((f) => ownsFace(save, f))
  );
}

/** The die the player takes into Daily Roll and Depths. */
export function playerLoadout(save: SaveData): string[] {
  return save.die && isValidLoadout(save, save.die) ? [...save.die] : [...STARTING_FACES];
}

/**
 * Puts `face` into `slot`. If the face is already on the die, the two slots
 * swap; otherwise the face in that slot goes back to the shelf.
 */
export function placeFace(loadout: readonly string[], slot: number, face: string): string[] {
  const next = [...loadout];
  const from = next.indexOf(face);
  if (from >= 0) next[from] = next[slot]!;
  next[slot] = face;
  return next;
}
