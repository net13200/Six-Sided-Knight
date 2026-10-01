// Records the 3D prototype frame by frame (30 fps) and encodes an mp4.
// node tools/prototype-3d/record.mjs <out.mp4> <w> <h> <scale>
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [out, w, h, scale = '1'] = process.argv.slice(2);
const ffmpeg = execFileSync('python3', [
  '-c',
  'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())',
])
  .toString()
  .trim();
const dir = out.replace(/\.mp4$/, '-frames');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });
p.on('pageerror', (e) => console.log('err', e.message));
await p.goto('http://localhost:4191/tools/prototype-3d/index.html?capture');
await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
let n = 0;
const frames = async (count) => {
  for (let i = 0; i < count; i++) {
    await p.evaluate(() => window.__tick(1 / 30));
    // CSS animations run on real time; let them advance by one frame too
    await p.waitForTimeout(33);
    await p.screenshot({ path: `${dir}/f${String(n++).padStart(4, '0')}.png` });
  }
};
const path = ['N', 'E', 'N', 'W', 'N', 'N', 'N', 'N'];
await frames(48); // intro
await p.evaluate(() => window.__hint());
await frames(36);
for (const d of path) {
  await p.evaluate((d) => window.__move(d), d);
  let k = 0;
  while ((await p.evaluate(() => window.__busy())) && k < 60) {
    await frames(1);
    k++;
  }
  await frames(d === 'N' && n < 200 ? 10 : 5);
}
await frames(50); // win + result card
await b.close();
execFileSync(ffmpeg, [
  '-y',
  '-loglevel',
  'error',
  '-framerate',
  '30',
  '-i',
  `${dir}/f%04d.png`,
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '18',
  '-vf',
  'scale=trunc(iw/2)*2:trunc(ih/2)*2',
  out,
]);
console.log('frames', n, '->', out);
