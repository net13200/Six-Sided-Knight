/**
 * Die geometry. A die shape is data: named slots, which slot is top/bottom,
 * which slot leads in each direction, and how each roll permutes the slots.
 * Shapes are compiled once into an orientation table so the simulation and
 * the solver work with small integers (orientation index) instead of objects.
 */
import { DIRS, type Dir, type DieState, type FaceId } from './types';

export interface DieShapeDef {
  readonly id: string;
  /** Slot names, e.g. ['top', 'bottom', 'north', ...]. */
  readonly slots: readonly string[];
  readonly top: number;
  /** Slot touching the floor, if the shape has one. */
  readonly bottom: number | null;
  /** Slot that leads when moving in each direction. */
  readonly leading: Readonly<Record<Dir, number>>;
  /** For each direction: `roll[dir][newSlot] = oldSlot`. */
  readonly roll: Readonly<Record<Dir, readonly number[]>>;
}

export interface CompiledShape {
  readonly def: DieShapeDef;
  /** All orientations reachable from the identity, as slot → home-slot permutations. */
  readonly perms: readonly (readonly number[])[];
  /** next[orient * 4 + dirIndex] = orientation after rolling. */
  readonly next: Int16Array;
}

const DIR_INDEX: Readonly<Record<Dir, number>> = { N: 0, E: 1, S: 2, W: 3 };

export function compileShape(def: DieShapeDef): CompiledShape {
  const n = def.slots.length;
  const identity = Array.from({ length: n }, (_, i) => i);
  const perms: number[][] = [identity];
  const index = new Map<string, number>([[identity.join(','), 0]]);
  const edges: number[] = [];
  for (let i = 0; i < perms.length; i++) {
    const p = perms[i]!;
    for (const dir of DIRS) {
      const r = def.roll[dir];
      const q = r.map((oldSlot) => p[oldSlot]!);
      const key = q.join(',');
      let j = index.get(key);
      if (j === undefined) {
        j = perms.length;
        perms.push(q);
        index.set(key, j);
      }
      edges[i * 4 + DIR_INDEX[dir]] = j;
    }
  }
  return { def, perms, next: Int16Array.from(edges) };
}

// Slot order for the d6: top, bottom, north, south, east, west.
const T = 0,
  B = 1,
  N = 2,
  S = 3,
  E = 4,
  W = 5;

/** Builds a roll table from "new <- old" assignments; unlisted slots stay put. */
function rollTable(n: number, assign: Readonly<Record<number, number>>): number[] {
  return Array.from({ length: n }, (_, slot) => assign[slot] ?? slot);
}

export const D6: DieShapeDef = {
  id: 'd6',
  slots: ['top', 'bottom', 'north', 'south', 'east', 'west'],
  top: T,
  bottom: B,
  leading: { N, E, S, W },
  roll: {
    // East: e=t, b=e, w=b, t=w
    E: rollTable(6, { [E]: T, [B]: E, [W]: B, [T]: W }),
    // West: w=t, b=w, e=b, t=e
    W: rollTable(6, { [W]: T, [B]: W, [E]: B, [T]: E }),
    // North: n=t, b=n, s=b, t=s
    N: rollTable(6, { [N]: T, [B]: N, [S]: B, [T]: S }),
    // South: s=t, b=s, n=b, t=n
    S: rollTable(6, { [S]: T, [B]: S, [N]: B, [T]: N }),
  },
};

const compiled = new Map<string, CompiledShape>();

export function registerShape(def: DieShapeDef): void {
  compiled.set(def.id, compileShape(def));
}
registerShape(D6);

export function getShape(id: string): CompiledShape {
  const s = compiled.get(id);
  if (!s) throw new Error(`Unknown die shape: ${id}`);
  return s;
}

export function dirIndex(dir: Dir): number {
  return DIR_INDEX[dir];
}

export function rollDie(die: DieState, dir: Dir): DieState {
  const shape = getShape(die.shape);
  return { ...die, orient: shape.next[die.orient * 4 + DIR_INDEX[dir]]! };
}

/** Face currently in the given slot. */
export function faceInSlot(die: DieState, slot: number): FaceId {
  const shape = getShape(die.shape);
  return die.loadout[shape.perms[die.orient]![slot]!]!;
}

export function topFace(die: DieState): FaceId {
  return faceInSlot(die, getShape(die.shape).def.top);
}

export function bottomFace(die: DieState): FaceId | null {
  const b = getShape(die.shape).def.bottom;
  return b === null ? null : faceInSlot(die, b);
}

export function leadingFace(die: DieState, dir: Dir): FaceId {
  return faceInSlot(die, getShape(die.shape).def.leading[dir]);
}

/** Face in every slot, keyed by slot name. Handy for UI and debugging. */
export function describeDie(die: DieState): Record<string, FaceId> {
  const shape = getShape(die.shape);
  const out: Record<string, FaceId> = {};
  shape.def.slots.forEach((name, slot) => (out[name] = faceInSlot(die, slot)));
  return out;
}

/**
 * Finds the orientation that puts the given faces in the given slots
 * (by slot name). Returns -1 if no reachable orientation matches.
 */
export function findOrientation(
  shapeId: string,
  loadout: readonly FaceId[],
  want: Readonly<Record<string, FaceId>>,
): number {
  const shape = getShape(shapeId);
  const wanted = Object.entries(want).map(([name, face]) => {
    const slot = shape.def.slots.indexOf(name);
    if (slot < 0) throw new Error(`Unknown slot '${name}' for shape ${shapeId}`);
    return [slot, face] as const;
  });
  return shape.perms.findIndex((p) => wanted.every(([slot, face]) => loadout[p[slot]!] === face));
}
