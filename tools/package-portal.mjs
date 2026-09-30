/**
 * Zips a portal build (dist-<portal>/) into six-sided-knight-<portal>.zip,
 * ready to upload. Run by `npm run build:poki` and `npm run build:crazygames`.
 * Source maps stay out of the zip.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const portal = process.argv[2];
if (!['poki', 'crazygames'].includes(portal ?? '')) {
  throw new Error('usage: node tools/package-portal.mjs poki|crazygames');
}
const dir = `dist-${portal}`;
const zip = `six-sided-knight-${portal}.zip`;
if (!existsSync(`${dir}/index.html`)) throw new Error(`${dir}/ is missing: build first`);
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-q', `../${zip}`, '.', '-x', '*.map'], { cwd: dir });
console.log(`${zip} is ready to upload`);
