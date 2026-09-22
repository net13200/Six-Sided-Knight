/** Entry point: wires the platform, stage, input and loop to the game. */
import { Game } from './game/game';
import { bindInput } from './game/input';
import { Loop } from './game/loop';
import { Stage } from './game/view/stage';
import { createBrowserPlatform } from './platform/browser';
import './style.css';

const platform = createBrowserPlatform();
const stage = new Stage(document.getElementById('app')!);
const game = new Game(stage, platform);

bindInput(
  { surface: stage.canvas, toLogical: (x, y) => stage.toLogical(x, y) },
  (cmd) => game.command(cmd),
  () => game.audio.unlock(),
);

const loop = new Loop(
  (dt) => game.update(dt),
  () => game.render(),
);
platform.onVisibilityChange((visible) => {
  loop.setPaused(!visible);
  if (visible) game.audio.resume();
  else game.audio.suspend();
});

// ?level=3 jumps straight into a level (handy for testing and sharing).
const params = new URLSearchParams(location.search);
const levelParam = Number(params.get('level'));
if (levelParam >= 1) game.goPlay(levelParam - 1);
else game.goMenu();
loop.start();

// Read-only hook for automated tests and debugging.
declare global {
  interface Window {
    __ssk?: unknown;
  }
}
window.__ssk = {
  scene: () => game.scene?.name,
  state: () =>
    game.scene && 'state' in game.scene ? (game.scene as { state: unknown }).state : null,
  levelIndex: () =>
    game.scene && 'index' in game.scene ? (game.scene as { index: number }).index : null,
};
