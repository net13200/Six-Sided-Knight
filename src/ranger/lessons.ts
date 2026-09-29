/** The Ranger's lessons (one per stage, on first play) and face descriptions. */
import type { Lesson } from '../game/lessons';

export const RANGER_LESSONS: Readonly<Record<string, Lesson>> = {
  'r-01': {
    title: 'Three ways to roll',
    text: 'The Ranger is a d8, rolling on triangles. Every triangle has three edges, so there are three ways to roll: left, right, and through the flat edge (down from a triangle that points up, up from one that points down). The badges show which face leads each way.',
  },
  'r-02': {
    title: 'The Bow',
    text: 'Rows are straight lines. Roll the Bow toward a wolf in your row and the arrow flies to it, over water, without you moving. A wolf takes two arrows.',
  },
  'r-03': {
    title: 'The Knife',
    text: 'Up close, the Knife ends a wolf in one stab. Wolves bite when they reach you, and you have 3 HP.',
  },
  'r-04': {
    title: 'The Trap',
    text: 'Land with the Trap face-down to lay a snare. A wolf that steps in is caught for 3 turns.',
  },
  'r-05': {
    title: 'Rope and Boots',
    text: 'Boots leap over the next triangle in your row: grass, water, even a wolf. The Rope swings you along the row to a post, and the die doesn’t roll on the way.',
  },
  'r-06': {
    title: 'The Cloak',
    text: 'With the Cloak on top, nobody can see you: wolves stop hunting and stags hold still.',
  },
  'r-07': {
    title: 'The Old Stag',
    text: 'The stag strikes anyone who stops in its row with a clear line to it (the red triangles). Everything you’ve learned, together.',
  },
};

export const RANGER_FACE_INFO: Readonly<Record<string, string>> = {
  Bow: 'Shoots along the row: 1 damage, over water.',
  Knife: 'Stabs an enemy next to you: 2 damage.',
  Trap: 'Face-down: lays a snare. Wolves get caught for 3 turns.',
  Rope: 'Swings you along the row to a post.',
  Cloak: 'On top: nobody can see you.',
  Boots: 'Leap over the next triangle in the row.',
  Herb: 'Face-down on a spring: heal 1.',
  Leaf: 'Just a leaf.',
};
