/**
 * Review page for lesson clips: every clip at once, looping (the game shows
 * one at a time, on the lesson card).
 */
import { defaultRules } from '../../src/content/register';
import { CLIPS } from '../../src/game/lesson-clips';
import { ClipPlayer } from '../../src/game/view/lesson-clip';

const rules = defaultRules();
// ---------- the page ----------

const list = document.getElementById('clips')!;
const players: ClipPlayer[] = [];
for (const clip of CLIPS) {
  const card = document.createElement('figure');
  const canvas = document.createElement('canvas');
  const [, , vw, vh] = clip.view;
  const cssW = 320;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(((cssW * vh) / vw) * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.aspectRatio = `${vw} / ${vh}`;
  const cap = document.createElement('figcaption');
  cap.textContent = clip.name;
  card.append(canvas, cap);
  list.append(card);
  players.push(new ClipPlayer(rules, clip, canvas));
}

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const p of players) {
    p.update(dt);
    p.draw();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
(window as unknown as { __ready: boolean }).__ready = true;
