/**
 * Zips the Poki build (dist-poki/) into six-sided-knight-poki.zip, ready to
 * upload to Poki. Run by `npm run build:poki`. Source maps stay out of the zip.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const zip = 'six-sided-knight-poki.zip';
if (!existsSync('dist-poki/index.html')) throw new Error('dist-poki/ is missing: build first');
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-q', `../${zip}`, '.', '-x', '*.map'], { cwd: 'dist-poki' });
console.log(`${zip} is ready to upload to Poki`);
