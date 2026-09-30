/** Entry point: wires the platform, stage, input and loop to the game. */
import { openDebugPanel } from './game/debug-panel';
import { Game } from './game/game';
import { bindInput } from './game/input';
import { Loop } from './game/loop';
import { autoFitLabels } from './game/ui';
import { loadLang } from './i18n';
import { Stage } from './game/view/stage';
import { runSplash } from './splash';
import { createBrowserPlatform } from './platform/browser';
import { createPortalPlatform } from './platform/portal';
import { IS_PORTAL, PORTAL, PORTAL_OPTIONS } from './platform/target';
import { registerServiceWorker } from './platform/pwa';
import { VERSION_LABEL } from './version';
import './style.css';

// The SugiGames splash plays over the game while it starts up (not on portals, by default).
if (!IS_PORTAL || PORTAL_OPTIONS.splash) runSplash();
else document.getElementById('splash')?.remove();

const params = new URLSearchParams(location.search);
// Developer tools (the KPI panel, ?level, ?perf, the test hook) are left out of the
// portal builds, except for automated test browsers.
const devTools = !IS_PORTAL || navigator.webdriver;
const debug = !IS_PORTAL && (params.has('debug') || location.hash === '#debug');

const platform = PORTAL ? createPortalPlatform(PORTAL) : createBrowserPlatform();
const stage = new Stage(document.getElementById('app')!);
// Long labels (some languages) shrink to fit their buttons.
autoFitLabels(stage.ui);
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

// The player's language (its file downloads now, if it isn't English).
await loadLang(game.save.data.settings.lang);

// ?level=3 jumps straight into a level, skipping story and lessons (handy for testing and sharing).
const levelParam = devTools ? Number(params.get('level')) : 0;
if (levelParam >= 1) game.goPlay(levelParam - 1, { story: false, lessons: false });
// On a portal, a first-time player skips the title screen: logo, story, level 1.
else if (IS_PORTAL && game.isNewPlayer) game.goPlay(0);
else game.goMenu();
loop.start();

// The title screen is up: tell the portal loading is done.
platform.ads.loaded();

// Installed app: offline support (the web build only; portals host the game themselves).
if (!IS_PORTAL) registerServiceWorker();

// Hidden KPI panel: #debug or ?debug.
if (debug) openDebugPanel(game);
window.addEventListener('hashchange', () => {
  if (!IS_PORTAL && location.hash === '#debug') {
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
