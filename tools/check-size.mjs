/**
 * Fails if the built game is over its size budget (gzipped), so it stays quick
 * to download on a phone. Run after `npm run build`:  npm run size
 * Counts everything a player downloads: HTML, JS (game + generator worker),
 * CSS, the manifest, the service worker, fonts and icons. Source maps are
 * not downloaded by players and are skipped.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 300;
const root = 'dist';

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

let total = 0;
const rows = [];
for (const f of files(root)) {
  if (f.endsWith('.map')) continue;
  const data = readFileSync(f);
  // Images and fonts are already compressed; count them as-is.
  const size = /\.(png|woff2)$/.test(f) ? data.length : gzipSync(data, { level: 9 }).length;
  total += size;
  rows.push([relative(root, f), size]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [name, size] of rows) console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${name}`);
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  total (budget ${BUDGET_KB} KB)`);
if (total > BUDGET_KB * 1024) {
  console.error(`Over budget by ${((total - BUDGET_KB * 1024) / 1024).toFixed(1)} KB`);
  process.exit(1);
}
