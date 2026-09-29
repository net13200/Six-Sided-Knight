import { t, tk } from '../../i18n';
/** One-line descriptions of each face, for the Smith and the inspect view. */
const INFO: Readonly<Record<string, string>> = {
  Sword: tk('Hits for 3.'),
  Shield: tk('Hits for 1. On top it blocks hits; underneath it guards against spikes.'),
  Bomb: tk('Hits for 2, plus 1 to enemies next to the target. The only face that cracks a Golem.'),
  Heart: tk('Underneath, it drinks from healing pools: +1 HP.'),
  Key: tk('Opens locked doors.'),
  Coin: tk('Opens chests.'),
  Freeze: tk('Freezes an enemy for 3 turns. No damage.'),
  Hook: tk('Pulls an enemy 2-3 tiles away next to you.'),
};

export function faceInfo(face: string): string {
  return t(INFO[face] ?? '');
}
