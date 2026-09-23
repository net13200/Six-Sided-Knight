/**
 * Face role colours (a tint behind each face). Shapes stay the primary cue;
 * colour just makes scanning faster: attack warm, defence blue, heal green,
 * tools gold. Unknown (new) faces get a neutral lilac.
 */
const ROLE: Readonly<Record<string, string>> = {
  Sword: '#f4b39c',
  Bomb: '#f4b39c',
  Shield: '#b3cff5',
  Heart: '#b8e6b9',
  Key: '#f1d78e',
  Coin: '#f1d78e',
};

export function roleColor(face: string): string {
  return ROLE[face] ?? '#d9d2e8';
}
