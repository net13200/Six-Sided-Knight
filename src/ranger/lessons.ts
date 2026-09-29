/** The Ranger's lessons (one per stage, on first play) and face descriptions. */
import type { Lesson } from '../game/lessons';
import { tk } from '../i18n';

export const RANGER_LESSONS: Readonly<Record<string, Lesson>> = {
  'r-01': {
    title: tk('Three ways to roll'),
    text: tk(
      'The Ranger is a d8, rolling on triangles. Every triangle has three edges, so there are three ways to roll: left, right, and through the flat edge (down from a triangle that points up, up from one that points down). The badges show which face leads each way.',
    ),
  },
  'r-02': {
    title: tk('The Bow'),
    text: tk(
      'Rows are straight lines. Roll the Bow toward a wolf in your row and the arrow flies to it, over water, without you moving. A wolf takes two arrows.',
    ),
  },
  'r-03': {
    title: tk('The Knife'),
    text: tk(
      'Up close, the Knife ends a wolf in one stab. Wolves bite when they reach you, and you have 3 HP.',
    ),
  },
  'r-04': {
    title: tk('The Trap'),
    text: tk(
      'Land with the Trap face-down to lay a snare. A wolf that steps in is caught for 3 turns.',
    ),
  },
  'r-05': {
    title: tk('Rope and Boots'),
    text: tk(
      'Boots leap over the next triangle in your row: grass, water, even a wolf. The Rope swings you along the row to a post, and the die doesn’t roll on the way.',
    ),
  },
  'r-06': {
    title: tk('The Cloak'),
    text: tk(
      'With the Cloak on top, nobody can see you: wolves stop hunting and stags hold still.',
    ),
  },
  'r-07': {
    title: tk('The Old Stag'),
    text: tk(
      'The stag strikes anyone who stops in its row with a clear line to it (the red triangles). Everything you’ve learned, together.',
    ),
  },
};

export const RANGER_FACE_INFO: Readonly<Record<string, string>> = {
  Bow: tk('Shoots along the row: 1 damage, over water.'),
  Knife: tk('Stabs an enemy next to you: 2 damage.'),
  Trap: tk('Face-down: lays a snare. Wolves get caught for 3 turns.'),
  Rope: tk('Swings you along the row to a post.'),
  Cloak: tk('On top: nobody can see you.'),
  Boots: tk('Leap over the next triangle in the row.'),
  Herb: tk('Face-down on a spring: heal 1.'),
  Leaf: tk('Just a leaf.'),
};
