/** One-line descriptions of each face, for the Forge and the inspect view. */
const INFO: Readonly<Record<string, string>> = {
  Sword: 'Hits for 3.',
  Shield: 'Hits for 1. On top it blocks hits; underneath it guards against spikes.',
  Bomb: 'Hits for 2, plus 1 to enemies next to the target. The only face that cracks a Golem.',
  Heart: 'Underneath, it drinks from healing pools: +2 HP.',
  Key: 'Opens locked doors.',
  Coin: 'Opens chests: +30 gold.',
  Freeze: 'Freezes an enemy for 2 turns. No damage.',
  Hook: 'Pulls an enemy or a gem 2-3 tiles away to you.',
};

export function faceInfo(face: string): string {
  return INFO[face] ?? '';
}
