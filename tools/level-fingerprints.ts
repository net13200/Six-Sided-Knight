/**
 * Prints the fingerprint of every campaign level (with its gauntlet floors) in
 * a folder holding `data/` and `gauntlets/`, as a TypeScript object. Used to
 * snapshot a released version's levels, e.g.
 *   git archive v0.9.0 src/levels | tar -x -C /tmp/old
 *   npx tsx tools/level-fingerprints.ts /tmp/old/src/levels
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTextLevel, type LevelData } from '../src/engine';
import { levelFingerprint } from '../src/meta/progress';

const root = process.argv[2] ?? 'src/levels';
const read = (dir: string): LevelData[] =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((f) => parseTextLevel(readFileSync(join(root, dir, f), 'utf8')));
const floors = read('gauntlets');
const lines = read('data').map((l) => {
  const own = floors
    .filter((f) => f.id.startsWith(`${l.id}-`))
    .sort((a, b) => Number(a.id.split('-').pop()) - Number(b.id.split('-').pop()));
  return `  '${l.id}': '${levelFingerprint(l, own)}',`;
});
console.log(`{\n${lines.join('\n')}\n}`);
