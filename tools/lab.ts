/**
 * Level lab (authoring aid): analyses level files and prints, per level, the
 * minimum moves, the no-damage and all-gold minimums, the difficulty rating,
 * and the solutions. With --hp N, also checks the level is winnable at N HP.
 *   npx tsx tools/lab.ts <files or dirs> [--hp 2] [--quiet]
 */
import { defaultRules } from '../src/content/register';
import { createState, describeDie, renderText, step } from '../src/engine';
import { rate } from '../src/solver/rate';
import { analyze, solve, type SolveResult } from '../src/solver/solve';
import { levelFiles, loadLevelFile } from './lib/files';

const rules = defaultRules();
const args = process.argv.slice(2);
const hpArg = args.indexOf('--hp');
const hp = hpArg >= 0 ? Number(args[hpArg + 1]) : null;
const quiet = args.includes('--quiet');
const trace = args.includes('--trace');
const paths = args.filter((a, i) => !a.startsWith('--') && (hpArg < 0 || i !== hpArg + 1));

const fmt = (r: SolveResult) =>
  r.status === 'solved'
    ? `${r.moves}${quiet ? '' : ` ${r.path.join('')}`}`
    : r.status.toUpperCase();

for (const file of levelFiles(paths)) {
  let lvl;
  try {
    lvl = loadLevelFile(file);
    createState(rules, lvl);
  } catch (e) {
    console.log(`BAD  ${file}: ${(e as Error).message}`);
    continue;
  }
  const start = createState(rules, lvl);
  const a = analyze(rules, start, 400_000);
  const r = rate(rules, start);
  const ok =
    a.any.status === 'solved' && a.noDamage.status === 'solved' && a.allGold.status === 'solved';
  let low = '';
  if (hp !== null) {
    const s = solve(rules, createState(rules, lvl, { hp }), { maxNodes: 400_000 });
    low = ` hp${hp}:${s.status === 'solved' ? s.moves : s.status}`;
  }
  const parFlag =
    lvl.par !== undefined && a.any.status === 'solved' && lvl.par !== a.any.moves ? ' PAR!' : '';
  console.log(
    `${ok ? 'ok ' : 'NO '} ${lvl.id.padEnd(8)} ${lvl.name.padEnd(18)} rate ${String(r.score).padStart(3)} nov ${r.noviceWinRate.toFixed(2)}${low}${parFlag}\n` +
      `     min ${fmt(a.any)}\n     nodmg ${fmt(a.noDamage)}\n     gold ${fmt(a.allGold)}` +
      (quiet ? '' : `\n     die ${JSON.stringify(describeDie(start.player.die))}`),
  );
  if (trace && a.any.status === 'solved') {
    let s = start;
    for (const dir of a.any.path) {
      s = step(rules, s, { type: 'move', dir }).state;
      console.log(`--- ${dir}\n${renderText(rules, s)}`);
    }
  }
}
