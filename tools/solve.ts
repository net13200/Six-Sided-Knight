/**
 * Solver report for level files.
 *   npm run solve -- src/levels/data            # all levels in a folder
 *   npm run solve -- src/levels/data/c1-03.txt  # one level, prints solutions
 *   npm run solve -- --write-par                # set each .txt level's par to the minimum
 * Shows minimum moves to win, to win without damage and to win with all gold,
 * and flags levels whose par doesn't match the solver's minimum.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { defaultRules } from '../src/content/register';
import { createState } from '../src/engine';
import { rate } from '../src/solver/rate';
import { analyze, type SolveResult } from '../src/solver/solve';
import { levelFiles, loadLevelFile } from './lib/files';

const rules = defaultRules();
const args = process.argv.slice(2);
const writePar = args.includes('--write-par');
const paths = args.filter((a) => !a.startsWith('--'));
const files = levelFiles(paths.length ? paths : ['src/levels/data']);
const verbose = files.length === 1;
let bad = 0;

const fmt = (r: SolveResult) =>
  r.status === 'solved'
    ? `${r.moves}${verbose ? ` (${r.path.join('')})` : ''}`
    : r.status.toUpperCase();

for (const file of files) {
  const lvl = loadLevelFile(file);
  const start = createState(rules, lvl);
  const a = analyze(rules, start, undefined, { healStar: lvl.healStar });
  const difficulty = rate(rules, start).score;
  const problems: string[] = [];
  if (writePar && a.any.status === 'solved' && file.endsWith('.txt') && lvl.par !== a.any.moves) {
    const text = readFileSync(file, 'utf8');
    const updated = /^par:.*$/m.test(text)
      ? text.replace(/^par:.*$/m, `par: ${a.any.moves}`)
      : text.replace(/^(name:.*)$/m, `$1\npar: ${a.any.moves}`);
    writeFileSync(file, updated);
    console.log(`     wrote par ${a.any.moves} to ${file}`);
  }
  if (a.any.status !== 'solved') problems.push('not proven solvable');
  if (lvl.par !== undefined && a.any.status === 'solved' && lvl.par < a.any.moves) {
    problems.push(`par ${lvl.par} is below the minimum ${a.any.moves}`);
  }
  if (problems.length) bad++;
  console.log(
    `${problems.length ? 'FAIL' : 'ok  '} ${lvl.id.padEnd(8)} par ${String(lvl.par ?? '-').padStart(2)}  ` +
      `min ${fmt(a.any)}  no-dmg ${fmt(a.noDamage)}  all-gold ${fmt(a.allGold)}  difficulty ${difficulty}` +
      (problems.length ? `\n     - ${problems.join('\n     - ')}` : ''),
  );
}
process.exit(bad ? 1 : 0);
