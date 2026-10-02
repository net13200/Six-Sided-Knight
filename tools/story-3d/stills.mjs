// Stills of the 3D opening at set times: node tools/story-3d/stills.mjs <page.html> <outdir> <w> <h> <tag>
import { chromium } from '@playwright/test';
const [page, out, w, h, tag] = process.argv.slice(2);
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('err', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await p.goto('file://' + page + '?capture');
await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
await p.evaluate(() => window.__tick(1 / 30));
await p.screenshot({ path: `${out}/op-${tag}-00.png` });
await p.evaluate(() => window.__play());
const marks = [2, 6.8, 9.5, 13.5, 16, 18.4, 20.5, 24, 26.5, 30, 34.5, 37, 40.8, 43.4, 46];
let now = 0;
for (const [i, m] of marks.entries()) {
  await p.evaluate(
    (n) => {
      for (let j = 0; j < n; j++) window.__tick(1 / 20);
    },
    Math.round((m - now) * 20),
  );
  now = m;
  await p.screenshot({ path: `${out}/op-${tag}-${String(i + 1).padStart(2, '0')}.png` });
}
const err = await p.evaluate(() => document.getElementById('err').textContent);
if (err) console.log('ERR BOX:', err);
await b.close();
