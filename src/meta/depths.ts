/** Depths: endless generated floors with rising difficulty. Pure functions. */
import { seedFrom } from '../engine';
import type { GenParams } from '../gen/generate';
import { MIN_ARRIVAL_HP, START_HP } from './daily';
import type { SaveData } from './save';

/**
 * Difficulty band for a floor: starts at medium (a Daily Roll's last floor),
 * climbs 4 points a floor, and plateaus at the hardest band from floor 10.
 */
export function depthsBand(floor: number): [number, number] {
  // Capped at what the generator reliably reaches (higher bands just cost time; see PERFORMANCE.md).
  const center = Math.min(64, 30 + (floor - 1) * 4);
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
    hp: floor === 1 ? START_HP : MIN_ARRIVAL_HP,
  };
}

/**
 * Ends a Depths run (knocked out, or ended from the hub): no Undo, no Retry,
 * no second chances. The high score was already raised floor by floor; this
 * records the run's result and clears it. Returns the floors cleared.
 */
export function endDepthsRun(d: SaveData): number {
  const run = d.depths.inProgress;
  if (!run) return 0;
  const cleared = run.floor - 1;
  d.depths.lastFloor = cleared;
  d.depths.bestFloor = Math.max(d.depths.bestFloor, cleared);
  d.depths.inProgress = null;
  return cleared;
}
