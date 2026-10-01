// Stills of the 3D prototype at a few moments: node tools/prototype-3d/stills.mjs <outdir> [w] [h]
import { chromium } from '@playwright/test';
const [out, w = '1280', h = '720'] = process.argv.slice(2);
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('err', e.message));
await p.goto('http://localhost:4191/tools/prototype-2d/index.html?capture');
await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
const tick = (n) =>
  p.evaluate((n) => {
    for (let i = 0; i < n; i++) window.__tick(1 / 30);
  }, n);
await tick(50);
await p.screenshot({ path: `${out}/p2-start.png` });
await p.evaluate(() => window.__move('N'));
await tick(7);
await p.screenshot({ path: `${out}/p2-boom.png` });
await tick(30);
await p.screenshot({ path: `${out}/p2-after.png` });
await b.close();
