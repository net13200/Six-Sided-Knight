/**
 * Level validator.
 *   npm run validate-levels                 # all levels in src/levels/data and examples/levels
 *   npm run validate-levels -- path/a.json  # specific files or folders
 * Exits with code 1 if any level is invalid or two levels share an id.
 */
import { existsSync } from 'node:fs';
import { defaultRules } from '../src/content/register';
import { validateLevel } from '../src/engine';
import { levelFiles, loadLevelFile } from './lib/files';

const rules = defaultRules();
const args = process.argv.slice(2);
const roots = args.length ? args : ['src/levels/data', 'examples/levels'].filter(existsSync);
const files = levelFiles(roots);
const seen = new Map<string, string>();
let failed = 0;

for (const file of files) {
  let problems: string[];
  let id = '?';
  try {
    const lvl = loadLevelFile(file);
    id = lvl.id;
    problems = validateLevel(rules, lvl);
    const dup = seen.get(lvl.id);
    if (dup) problems.push(`duplicate id '${lvl.id}' (also in ${dup})`);
    seen.set(lvl.id, file);
  } catch (e) {
    problems = [(e as Error).message];
  }
  if (problems.length) {
    failed++;
    console.log(`FAIL ${file} (${id})\n  - ${problems.join('\n  - ')}`);
  } else {
    console.log(`ok   ${file} (${id})`);
  }
}
console.log(`\n${files.length - failed}/${files.length} levels valid`);
process.exit(failed ? 1 : 0);
