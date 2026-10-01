/**
 * Fails if the built game is over its size budget (gzipped), so it stays quick
 * to download on a phone. Run after `npm run build`:  npm run size
 * `npm run size -- dist-crazygames` checks the CrazyGames build.
 * Counts everything a player downloads: HTML, JS (game + generator worker),
 * CSS, the manifest, the service worker, fonts and icons. Source maps are
 * not downloaded by players and are skipped. A player downloads one language
 * file at most, so only the largest counts.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 300;
const root = process.argv[2] ?? 'dist';

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const LANG_FILE = /assets\/(de|es|fr|it|nl|pt|tr|he)-[\w-]+\.js$/;
let total = 0;
let langMax = 0;
const rows = [];
for (const f of files(root)) {
  if (f.endsWith('.map')) continue;
  const data = readFileSync(f);
  // Images and fonts are already compressed; count them as-is.
  const size = /\.(png|woff2)$/.test(f) ? data.length : gzipSync(data, { level: 9 }).length;
  const name = relative(root, f).replace(/\\/g, '/');
  if (LANG_FILE.test(name)) langMax = Math.max(langMax, size);
  else total += size;
  rows.push([name, size]);
}
total += langMax;
rows.sort((a, b) => b[1] - a[1]);
for (const [name, size] of rows) console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${name}`);
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  total (budget ${BUDGET_KB} KB)`);
if (total > BUDGET_KB * 1024) {
  console.error(`Over budget by ${((total - BUDGET_KB * 1024) / 1024).toFixed(1)} KB`);
  process.exit(1);
}
