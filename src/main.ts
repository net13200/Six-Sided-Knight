/** Entry point: wires the platform, stage, input and loop to the game. */
import { openDebugPanel } from './game/debug-panel';
import { Game } from './game/game';
import { bindInput } from './game/input';
import { Loop } from './game/loop';
import { Stage } from './game/view/stage';
import { runSplash } from './splash';
import { createBrowserPlatform } from './platform/browser';
import { registerServiceWorker } from './platform/pwa';
import { VERSION_LABEL } from './version';
import './style.css';

// The SugiGames splash plays over the game while it starts up.
runSplash();

const params = new URLSearchParams(location.search);
const debug = params.has('debug') || location.hash === '#debug';

const platform = createBrowserPlatform();
const stage = new Stage(document.getElementById('app')!);
const game = new Game(stage, platform, { debug });

bindInput(
  { surface: stage.canvas, toLogical: (x, y) => stage.toLogical(x, y) },
  (cmd) => game.command(cmd),
  () => game.audio.unlock(),
);

// Music starts right away where the browser allows it (e.g. an installed app).
// Otherwise it starts on the first touch or key press anywhere: the splash,
// a button, the board. Capture phase, so nothing can swallow it.
game.audio.unlock();
const WAKE_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
const wake = () => {
  game.audio.unlock();
  if (game.audio.running) {
    for (const t of WAKE_EVENTS) window.removeEventListener(t, wake, true);
  }
};
for (const t of WAKE_EVENTS) window.addEventListener(t, wake, true);

// ?perf records how long each frame's update + draw takes (see PERFORMANCE.md).
const perf: number[] | null = params.has('perf') ? [] : null;
const loop = new Loop(
  (dt) => game.update(dt),
  () => {
    if (!perf) {
      game.render();
      return;
    }
    const t0 = performance.now();
    if (!game.render()) return;
    // ?perf=flush also waits for the canvas to finish painting (raster time).
    if (params.get('perf') === 'flush') stage.ctx.getImageData(0, 0, 1, 1);
    perf.push(performance.now() - t0);
    if (perf.length > 600) perf.shift();
  },
);
platform.onVisibilityChange((visible) => {
  loop.setPaused(!visible);
  game.visibilityChanged(visible);
  if (visible) game.audio.resume();
  else game.audio.suspend();
});

// Closing or reloading the page ends the session (a reload soon after resumes it).
window.addEventListener('pagehide', () => game.visibilityChanged(false));

// ?level=3 jumps straight into a level (handy for testing and sharing).
const levelParam = Number(params.get('level'));
if (levelParam >= 1) game.goPlay(levelParam - 1, { story: false });
else game.goMenu();
loop.start();

// Installed app: offline support.
registerServiceWorker();

// Hidden KPI panel: #debug or ?debug.
if (debug) openDebugPanel(game);
window.addEventListener('hashchange', () => {
  if (location.hash === '#debug') openDebugPanel(game);
});

// Read-only hook for automated tests and debugging.
declare global {
  interface Window {
    __ssk?: unknown;
  }
}
window.__ssk = {
  version: VERSION_LABEL,
  scene: () => game.scene?.name,
  state: () =>
    game.scene && 'state' in game.scene ? (game.scene as { state: unknown }).state : null,
  perf: () => perf,
  music: () => game.audio.currentTrack,
  audioRunning: () => game.audio.running,
  levelIndex: () =>
    game.scene && 'index' in game.scene ? (game.scene as { index: number }).index : null,
};
