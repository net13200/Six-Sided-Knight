/**
 * "Does this Ranger stage teach what it says?" Like the Knight's check: the
 * par route must use the face, and the stage can't be won without it (the
 * face swapped for a blank Leaf). Used by tests and tools, not the game.
 */
import type { Dir } from '../engine/types';
import { hidden, startState, step, type REvent, type RLevel, type RState } from './rules';
import { solveRanger } from './solve';

export const RANGER_TEACHES = [
  'roll',
  'bow',
  'knife',
  'trap',
  'rope',
  'boots',
  'cloak',
  'herb',
] as const;
export type RangerTeach = (typeof RANGER_TEACHES)[number];

const FACE: Readonly<Record<Exclude<RangerTeach, 'roll'>, string>> = {
  bow: 'Bow',
  knife: 'Knife',
  trap: 'Trap',
  rope: 'Rope',
  boots: 'Boots',
  cloak: 'Cloak',
  herb: 'Herb',
};

/** What the route does. */
export function rangerFacts(level: RLevel, path: readonly Dir[]) {
  const f = { shots: 0, stabs: 0, snares: 0, swings: 0, leaps: 0, cloaked: 0, heals: 0 };
  let s: RState = startState(level);
  for (const d of path) {
    const r = step(s, d);
    const ev: readonly REvent[] = r.events;
    for (const e of ev) {
      if (e.type === 'shot') f.shots++;
      if (e.type === 'stabbed') f.stabs++;
      if (e.type === 'snared') f.snares++;
      if (e.type === 'moved' && e.swing) f.swings++;
      if (e.type === 'moved' && e.leap) f.leaps++;
      if (e.type === 'healed') f.heals++;
    }
    // Hidden while an enemy that could act is around.
    if (
      r.state.status === 'playing' &&
      hidden(r.state) &&
      r.state.enemies.some((e) => e.snared === 0)
    )
      f.cloaked++;
    s = r.state;
  }
  return f;
}

/** The level with one face swapped for a blank Leaf. */
export function withoutFace(level: RLevel, face: string): RLevel {
  return { ...level, loadout: level.loadout.map((f) => (f === face ? 'Leaf' : f)) };
}

export function checkRangerTeach(
  level: RLevel,
  path: readonly Dir[],
  teach: RangerTeach,
): string[] {
  if (teach === 'roll') return [];
  const f = rangerFacts(level, path);
  const used = {
    bow: f.shots,
    knife: f.stabs,
    trap: f.snares,
    rope: f.swings,
    boots: f.leaps,
    cloak: f.cloaked,
    herb: f.heals,
  }[teach];
  const out: string[] = [];
  if (!used) out.push(`par route doesn't use the ${FACE[teach]}`);
  else {
    const r = solveRanger(startState(withoutFace(level, FACE[teach])), { maxNodes: 400_000 });
    if (r.status !== 'unsolvable')
      out.push(
        r.status === 'solved'
          ? `winnable without the ${FACE[teach]} (${r.moves} moves)`
          : `couldn't prove it needs the ${FACE[teach]}`,
      );
  }
  return out;
}
