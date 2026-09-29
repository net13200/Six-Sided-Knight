/** Entry point: wires the platform, stage, input and loop to the game. */
import { openDebugPanel } from './game/debug-panel';
import { Game } from './game/game';
import { bindInput } from './game/input';
import { Loop } from './game/loop';
import { Stage } from './game/view/stage';
import { runSplash } from './splash';
import { createBrowserPlatform } from './platform/browser';
import { createPokiPlatform } from './platform/poki';
import { IS_POKI, POKI_OPTIONS } from './platform/target';
import { registerServiceWorker } from './platform/pwa';
import { VERSION_LABEL } from './version';
import './style.css';

// The SugiGames splash plays over the game while it starts up (not on portals, by default).
if (!IS_POKI || POKI_OPTIONS.splash) runSplash();
else document.getElementById('splash')?.remove();

const params = new URLSearchParams(location.search);
// Developer tools (the KPI panel, ?level, ?perf, the test hook) are left out of the
// Poki build, except for automated test browsers.
const devTools = !IS_POKI || navigator.webdriver;
const debug = !IS_POKI && (params.has('debug') || location.hash === '#debug');

const platform = IS_POKI ? createPokiPlatform() : createBrowserPlatform();
const stage = new Stage(document.getElementById('app')!);
const game = new Game(stage, platform, { debug });

bindInput(
  { surface: stage.canvas, toLogical: (x, y) => stage.toLogical(x, y) },
  (cmd) => game.command(cmd),
  () => game.audio.unlock(),
);

// Music starts right away where the browser allows it (e.g. an installed app).
// Otherwise it starts on the first touch or key press anywhere: the splash,
// a button, the board. These stay on for the whole session, so a touch also
// brings the music back if the browser kept it paused after switching apps.
// Capture phase, so nothing can swallow it.
game.audio.unlock();
for (const t of ['pointerdown', 'touchend', 'click', 'keydown'] as const) {
  window.addEventListener(t, () => game.audio.unlock(), true);
}
// Coming back from the back/forward cache doesn't always fire visibilitychange.
window.addEventListener('pageshow', () => game.audio.resume());

// ?perf records how long each frame's update + draw takes (see PERFORMANCE.md).
const perf: number[] | null = devTools && params.has('perf') ? [] : null;
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

// ?level=3 jumps straight into a level, skipping story and lessons (handy for testing and sharing).
const levelParam = devTools ? Number(params.get('level')) : 0;
if (levelParam >= 1) game.goPlay(levelParam - 1, { story: false, lessons: false });
else game.goMenu();
loop.start();

// The title screen is up: tell the portal loading is done.
platform.ads.loaded();

// Installed app: offline support (the web build only; portals host the game themselves).
if (!IS_POKI) registerServiceWorker();

// Hidden KPI panel: #debug or ?debug.
if (debug) openDebugPanel(game);
window.addEventListener('hashchange', () => {
  if (!IS_POKI && location.hash === '#debug') {
    game.debug = true;
    openDebugPanel(game);
  }
});

// Read-only hook for automated tests and debugging.
declare global {
  interface Window {
    __ssk?: unknown;
  }
}
if (devTools)
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
