/** "How to play": a text-only reference for players who have finished the tutorial. */
export interface HowToSection {
  readonly heading: string;
  readonly lines: readonly string[];
}

export const HOW_TO_PLAY: readonly HowToSection[] = [
  {
    heading: 'Rolling',
    lines: [
      'Swipe, tap toward a tile, or use the arrow keys to roll one tile. Reach the stairs to win.',
      'The face on the side you roll toward is the one that acts. The top face protects you; the bottom face touches the tile you land on.',
      'Bumping a wall costs no turn. Labels next to the die show what each roll would do; tap the die to see all six faces.',
    ],
  },
  {
    heading: 'Faces',
    lines: [
      'Sword: 3 damage.',
      'Shield: 1 damage. On top it blocks hits; underneath it keeps you safe on spikes.',
      'Bomb: 2 damage, plus 1 to every enemy next to the target. The only face that hurts a Golem.',
      'Heart: underneath on a pool, heals 1.',
      'Key: opens doors. Coin: opens chests.',
      'Freeze: the enemy skips its next 3 turns. Hook: pulls an enemy from 2-3 tiles away next to you.',
    ],
  },
  {
    heading: 'Tiles',
    lines: [
      'Spikes: 1 damage unless the Shield is underneath.',
      'Pool: heals 1 with the Heart underneath, once.',
      'Ice: you slide, faces unchanged, until floor or something stops you.',
      'Chests and doors block the way until the Coin or the Key opens them.',
    ],
  },
  {
    heading: 'Enemies',
    lines: [
      'Skeleton (2 HP): chases you every turn.',
      'Slime (3 HP): moves every other turn; "!" means it acts next.',
      'Archer (1 HP): never moves; shoots along the red lanes when you stop in one. Walls and enemies block arrows.',
      'Golem (4 HP): only Bombs hurt it; moves every other turn.',
      'Enemies hit for 1 when next to you, unless the Shield is on top.',
    ],
  },
  {
    heading: 'Stars and crowns',
    lines: [
      'You have 3 HP, and nothing heals between floors. Stars are about moves: ★★★ at par or fewer, ★★ a few moves over, ★ for finishing. Your best result is kept.',
      'Each new star pays 10 crowns. Spend them at the Smith on new faces for your own die (Daily Roll and Depths).',
    ],
  },
  {
    heading: 'Modes',
    lines: [
      'Gauntlets: three floors in a row, HP carried over with no healing.',
      'Daily Roll: three floors, the same for everyone each day.',
      'Depths: endless floors that get harder. One life: no Undo, no Retry, and a knockout ends the run.',
    ],
  },
  {
    heading: 'Keys',
    lines: ['Z undo · R retry · I inspect the die · H hear the board · M mute · Esc menu.'],
  },
];
