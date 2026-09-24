/**
 * Lessons: the card that opens the first time a level with a hint is played.
 * Its text types itself out and the board waits for "Got it", so it gets read.
 * Tutorial levels and each new mechanic get a fuller lesson; other levels show
 * their one-line hint.
 */
import type { LevelData } from '../engine';

export interface Lesson {
  readonly title: string;
  readonly text: string;
}

const GAUNTLET: Lesson = {
  title: 'Gauntlet',
  text: 'Three floors in a row. Your HP carries over, with 1 healed between floors. Leave between floors and the gauntlet starts over.',
};

export const LESSONS: Readonly<Record<string, Lesson>> = {
  'c1-01': {
    title: 'Rolling',
    text: 'You are the die. Swipe, or use the arrow keys, to roll one tile. Each roll tips the die onto a new face. Roll onto the stairs to win.',
  },
  'c1-02': {
    title: 'The leading side',
    text: 'The face on the side you roll toward is the one that acts. The Sword faces right: roll right into the skeleton to strike it. Labels next to the die show what each roll would do.',
  },
  'c1-03': {
    title: 'Turn the blade',
    text: 'Every roll turns all six faces. To strike with the Sword, roll around until it is on the side facing the enemy. Tap the die any time to see all its faces.',
  },
  'c1-04': {
    title: 'Shield up',
    text: "Enemies strike when they're next to you. With the Shield on top, their hits bounce off. Turn the Shield up before you get close.",
  },
  'c1-05': {
    title: 'Keys',
    text: "A door opens only when you roll the Key into it. Any other face just bumps, and a bump doesn't cost a turn.",
  },
  'c1-06': {
    title: 'Treasure',
    text: 'Roll the Coin into a chest to open it. Gems are picked up just by rolling onto them. Collect every treasure for a star.',
  },
  'c1-07': {
    title: 'Spikes',
    text: 'Spikes hurt when you land on them, unless the Shield is on the bottom. Plan your rolls so the Shield faces down as you land.',
  },
  'c1-08': {
    title: 'Healing',
    text: "These spikes can't all be dodged. When you're hurt, land Heart-down on a pool to heal 2. Here, the second star is for finishing at full HP.",
  },
  'c1-09': {
    title: 'Slimes',
    text: 'Slimes move only every other turn, and show "!" just before they act. They have 3 HP: a Sword knocks one out, weaker faces take longer.',
  },
  'c1-10': {
    title: 'The Bomb',
    text: 'A Bomb hits for 2, and also hits every enemy next to its target for 1. Bomb the middle skeleton and all three fall.',
  },
  'c2-01': {
    title: 'Ice',
    text: "On ice you slide until something stops you, and your faces don't turn while you slide. Plan where you'll stop, not just where you start.",
  },
  'c3-01': {
    title: 'Golems',
    text: 'Golems shrug off everything but Bombs. They move only every other turn, so line up a Bomb before they reach you.',
  },
  'c4-01': {
    title: 'Archers',
    text: 'Archers shoot along the red lanes when you stop in one. Cross their lanes without stopping, or keep something between you.',
  },
  'c5-01': {
    title: 'Freeze',
    text: "Your die has a new face: Freeze. Roll it into an enemy and it can't move or attack for 2 turns.",
  },
  'c6-01': {
    title: 'Hook',
    text: 'The Hook reaches 2 or 3 tiles. Roll it toward a gem to pull the gem in, or toward an enemy to drag it next to you.',
  },
  'c2-10': GAUNTLET,
  'c3-10': GAUNTLET,
  'c4-10': GAUNTLET,
  'c5-10': GAUNTLET,
  'c6-10': GAUNTLET,
};

/** The lesson for a level: its own, or its hint. Null when there's nothing to teach. */
export function lessonFor(level: LevelData): Lesson | null {
  const own = LESSONS[level.id];
  if (own) return own;
  return level.hint ? { title: level.name, text: level.hint } : null;
}

/** Save flag (in `hints`) once a level's lesson has been read. */
export const lessonKey = (levelId: string) => `lesson:${levelId}`;
