/**
 * Generator preview.
 *   npm run generate -- --seed 42 --band 20,40      # one level, printed
 *   npm run generate -- --sweep 20 --band 30,50     # 20 seeds: in-band rate and timing
 */
import { defaultRules } from '../src/content/register';
import { createState, renderText } from '../src/engine';
import { generateLevel } from '../src/gen/generate';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const [lo, hi] = opt('band', '20,40').split(',').map(Number) as [number, number];
const rules = defaultRules();
const sweep = Number(opt('sweep', '0'));

if (sweep > 0) {
  let inBand = 0;
  let total = 0;
  let worst = 0;
  const scores: number[] = [];
  for (let seed = 1; seed <= sweep; seed++) {
    const t = performance.now();
    const g = generateLevel(rules, { seed, band: [lo, hi], id: `gen-${seed}`, name: 'Generated' });
    const ms = performance.now() - t;
    total += ms;
    worst = Math.max(worst, ms);
    if (g.inBand) inBand++;
    scores.push(g.rating.score);
  }
  console.log(
    `band ${lo}-${hi}: ${inBand}/${sweep} in band, avg ${(total / sweep).toFixed(0)}ms, worst ${worst.toFixed(0)}ms, scores ${scores.join(' ')}`,
  );
} else {
  const seed = Number(opt('seed', '1'));
  const t = performance.now();
  const g = generateLevel(rules, { seed, band: [lo, hi], id: `gen-${seed}`, name: 'Generated' });
  console.log(renderText(rules, createState(rules, g.level)));
  console.log(
    `\nscore ${g.rating.score} (${g.inBand ? 'in band' : 'closest'}), par ${g.level.par}, novice ${g.rating.noviceWinRate.toFixed(2)}, ${g.attempts} attempts, ${(performance.now() - t).toFixed(0)}ms`,
  );
}
