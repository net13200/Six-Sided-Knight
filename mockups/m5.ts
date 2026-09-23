/** Preview of the milestone 5 content (ice, Freeze, Hook, Archer, Golem). Not shipped. */
import { defaultRules } from '../src/content/register';
import { createState, DIRS, step, type LevelData } from '../src/engine';
import { drawFace } from '../src/game/view/art';
import { drawBoard, drawCompass } from '../src/game/view/board';
import { Fx } from '../src/game/view/fx';
import { BAR_Y } from '../src/game/view/layout';
import { predictOutcome } from '../src/game/view/outcome';
import { C } from '../src/game/view/palette';

const rules = defaultRules();
const level: LevelData = {
  schema: 1,
  id: 'mock',
  name: 'Mock',
  loadout: ['Shield', 'Heart', 'Freeze', 'Key', 'Hook', 'Coin'],
  grid: [
    '########',
    '#a.....#',
    '#......#',
    '#.====.#',
    '#.==@..#',
    '#...*.g#',
    '#.s....#',
    '#k....>#',
    '########',
  ],
};
let state = createState(rules, level);
// Freeze the slime for the preview.
state = {
  ...state,
  enemies: state.enemies.map((e) =>
    e.kind === 'slime' ? { ...e, effects: [{ id: 'frozen', turns: 2 }] } : e,
  ),
};
const fx = new Fx();
const canvas = document.getElementById('c') as HTMLCanvasElement;
const k = 2;
canvas.width = 340 * k * 2;
canvas.height = 480 * k;
canvas.style.width = '680px';
canvas.style.height = '480px';
const ctx = canvas.getContext('2d')!;
ctx.scale(k, k);
ctx.fillStyle = C.bg;
ctx.fillRect(0, 0, 680, 480);
const outs = DIRS.map((d) => [d, predictOutcome(rules, state, d)] as const);
drawBoard(ctx, rules, state, fx.compute(), fx, outs);
drawCompass(ctx, state.player.die, 170, BAR_Y + 34);
// Right: face icons big + outcome texts
ctx.save();
ctx.translate(340, 0);
ctx.fillStyle = C.text;
ctx.font = '12px system-ui';
let y = 30;
for (const f of ['Freeze', 'Hook', 'Sword', 'Bomb']) {
  drawFace(ctx, f, 30, y, 36);
  ctx.fillText(f, 60, y + 4);
  y += 46;
}
for (const [d, o] of outs) {
  ctx.fillText(`${d}: ${o.text}${o.then ? ' / ' + o.then : ''}`, 10, y);
  y += 18;
}
const after = step(rules, state, { type: 'move', dir: 'W' });
ctx.fillText(`W events: ${after.events.map((e) => e.type).join(',')}`, 10, y);
ctx.restore();
document.title = 'ready';
