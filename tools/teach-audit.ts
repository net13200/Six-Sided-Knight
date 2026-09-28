/**
 * Checks every campaign level (and gauntlet floor) against the rules:
 * winnable from the starting HP (later gauntlet floors: from 1 HP), par in
 * the file equals the solver's minimum, and the par route uses what the level
 * teaches (`teaches:`).
 *
 *   npx tsx tools/teach-audit.ts [id prefix]      e.g. c3 or c3-04
 *   npx tsx tools/teach-audit.ts some/level.txt    (check level files; ids ending -N count as floors)
 */
import { defaultRules } from '../src/content/register';
import { createState } from '../src/engine';
import { MIN_ARRIVAL_HP } from '../src/meta/daily';
import { TEACHES, checkTeach, routeFacts, type Teach } from '../src/levels/teaches';
import { solve } from '../src/solver/solve';
import { levelFiles, loadLevelFile } from './lib/files';

const rules = defaultRules();
const args = process.argv.slice(2);
const files = args.filter((a) => a.endsWith('.txt'));
const only = files.length ? '' : (args[0] ?? '');
const floors = levelFiles(['src/levels/gauntlets']).map(loadLevelFile);
const levels = files.length
  ? files.map(loadLevelFile)
  : levelFiles(['src/levels/data'])
      .map(loadLevelFile)
      .flatMap((l) => [l, ...floors.filter((f) => f.id.startsWith(`${l.id}-`))]);

let bad = 0;
for (const level of levels) {
  if (!level.id.startsWith(only)) continue;
  const problems: string[] = [];
  const r = solve(rules, createState(rules, level), { maxNodes: 400_000 });
  if (r.status !== 'solved') problems.push(`not winnable from full HP (${r.status})`);
  else if (level.par !== r.moves) problems.push(`par ${level.par ?? '-'} should be ${r.moves}`);
  if (/-\d+-\d+$/.test(level.id)) {
    const low = solve(rules, createState(rules, level, { hp: MIN_ARRIVAL_HP }), {
      maxNodes: 400_000,
    });
    if (low.status !== 'solved') problems.push(`floor not winnable from ${MIN_ARRIVAL_HP} HP`);
  }
  const teaches = (level.teaches ?? []) as Teach[];
  if (!teaches.length) problems.push('no teaches: tag');
  for (const t of teaches) {
    if (!TEACHES.includes(t)) problems.push(`unknown teach '${t}'`);
    else if (r.status === 'solved')
      for (const p of checkTeach(rules, level, r.path, t)) problems.push(`${t}: ${p}`);
  }
  let facts = '';
  if (r.status === 'solved') {
    const f = routeFacts(rules, level, r.path);
    const bits = [
      f.kills.length &&
        `kills ${f.kills.map((k) => `${k.kind}/${k.splash ? 'splash' : k.face}`).join(',')}`,
      f.blocked && `blocked ${f.blocked}`,
      f.shieldSpikeLandings && `shield-spikes ${f.shieldSpikeLandings}`,
      f.heals && `heals ${f.heals}`,
      f.slides && `slides ${f.slideStops.join(',')}`,
      f.freezes.length && `froze ${f.freezes.join(',')}`,
      (f.hookGems || f.hookEnemies) && `hook gem ${f.hookGems} enemy ${f.hookEnemies}`,
      f.covered && `covered ${f.covered}`,
      f.doors && `doors ${f.doors}`,
      f.chests && `chests ${f.chests}`,
    ].filter(Boolean);
    facts = ` ${r.moves}mv ${r.path.join('')} ${bits.join(' | ')}`;
  }
  if (problems.length) bad++;
  console.log(
    `${problems.length ? 'FIX' : 'ok '} ${level.id.padEnd(8)} [${teaches.join(',')}]${facts}` +
      (problems.length ? `\n      - ${problems.join('\n      - ')}` : ''),
  );
}
console.log(`\n${bad} to fix`);
process.exit(bad ? 1 : 0);
