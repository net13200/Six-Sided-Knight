/** Depths: endless generated floors with rising difficulty. Pure functions. */
import { seedFrom } from '../engine';
import type { GenParams } from '../gen/generate';
import { MIN_ARRIVAL_HP } from './daily';

/** Difficulty band for a floor: starts easy, climbs, then plateaus near the top. */
export function depthsBand(floor: number): [number, number] {
  // Capped at what the generator reliably reaches (higher bands just cost time; see PERFORMANCE.md).
  const center = Math.min(64, 14 + (floor - 1) * 4);
  return [Math.max(0, center - 8), center + 8];
}

export function depthsFloorParams(
  runSeed: number,
  floor: number,
  loadout?: readonly string[],
): GenParams {
  return {
    features: 2,
    ...(loadout ? { loadout } : {}),
    seed: seedFrom(`ssk-depths:${runSeed}:${floor}`),
    band: depthsBand(floor),
    id: `depths-${floor}`,
    name: `Depths · floor ${floor}`,
    hp: floor === 1 ? 5 : MIN_ARRIVAL_HP,
  };
}
