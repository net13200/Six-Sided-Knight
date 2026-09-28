/**
 * Writes `run-par:` (★★★ for the whole gauntlet, HP carried over) into each
 * gauntlet's first floor. Run after changing any gauntlet floor.
 *   npx tsx tools/run-par.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { defaultRules } from '../src/content/register';
import { START_HP } from '../src/meta/daily';
import { runPar } from '../src/levels/run-par';
import { levelFiles, loadLevelFile } from './lib/files';

const rules = defaultRules();
const floors = levelFiles(['src/levels/gauntlets']).map((f) => ({ f, l: loadLevelFile(f) }));
for (const file of levelFiles(['src/levels/data'])) {
  const first = loadLevelFile(file);
  const extra = floors
    .filter(({ l }) => l.id.startsWith(`${first.id}-`))
    .sort((a, b) => a.l.id.localeCompare(b.l.id))
    .map(({ l }) => l);
  if (!extra.length) continue;
  const all = [first, ...extra];
  const par = runPar(rules, all, START_HP);
  const summed = all.reduce((n, l) => n + (l.par ?? 0), 0);
  if (par === null) {
    console.log(`${first.id}: NOT WINNABLE as a run`);
    continue;
  }
  const text = readFileSync(file, 'utf8');
  const updated = /^run-par:.*$/m.test(text)
    ? text.replace(/^run-par:.*$/m, `run-par: ${par}`)
    : text.replace(/^(par:.*)$/m, `$1\nrun-par: ${par}`);
  writeFileSync(file, updated);
  console.log(`${first.id}: run-par ${par} (floor pars add up to ${summed})`);
}
