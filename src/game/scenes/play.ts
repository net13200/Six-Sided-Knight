/** The play screen: HUD, board, compass, and Undo / Retry / Menu / Sound buttons. */
import {
  ReplayRecorder,
  createState,
  newHistory,
  play,
  retry,
  undo,
  type Dir,
  type GameState,
  type History,
  type LevelData,
} from '../../engine';
import type { Game } from '../game';
import type { Command } from '../input';
import { tapDirection } from '../input';
import { computeStars } from '../stars';
import { el, iconButton, place } from '../ui';
import { animateBump, animateTurn } from '../view/animate';
import { drawFace } from '../view/art';
import { drawBoard, drawCompass } from '../view/board';
import { Fx } from '../view/fx';
import { BAR_Y, BOARD_X, BOARD_Y, TILE, tileAt } from '../view/layout';
import { C } from '../view/palette';
import { muteButton } from './common';
import type { Scene } from './scene';

export class PlayScene implements Scene {
  readonly name = 'play';
  readonly level: LevelData;
  history: History;
  private fx = new Fx();
  private recorder: ReplayRecorder;
  private overlay: HTMLElement | null = null;
  private finishing = false;
  private ui: HTMLElement | null = null;

  constructor(
    private readonly game: Game,
    readonly index: number,
  ) {
    this.level = game.levels[index]!;
    this.history = newHistory(createState(game.rules, this.level));
    this.recorder = new ReplayRecorder(this.level.id);
    this.fx.reducedMotion = game.reducedMotion;
  }

  get state(): GameState {
    return this.history.state;
  }

  enter(ui: HTMLElement): void {
    this.ui = ui;
    // 62x62 logical keeps buttons >= 44 CSS px even when letterboxed in landscape.
    const y = BAR_Y + 3;
    ui.append(
      place(
        iconButton('undo', 'Undo', () => this.command({ type: 'undo' })),
        4,
        y,
        64,
        62,
      ),
      place(
        iconButton('retry', 'Retry', () => this.command({ type: 'retry' })),
        70,
        y,
        64,
        62,
      ),
      place(
        iconButton('menu', 'Menu', () => this.command({ type: 'back' })),
        206,
        y,
        64,
        62,
      ),
      place(muteButton(this.game), 272, y, 64, 62),
    );
  }

  command(cmd: Command): void {
    switch (cmd.type) {
      case 'move':
        this.move(cmd.dir);
        break;
      case 'tap': {
        const tile = tileAt(cmd.x, cmd.y);
        if (!tile) return;
        const dir = tapDirection(this.state.player, tile);
        if (dir) this.move(dir);
        break;
      }
      case 'undo':
        if (this.finishing || this.history.depth === 0) return;
        this.fx.finishAll();
        this.history = undo(this.history);
        this.recorder.record('u');
        this.game.audio.play('undo');
        this.hideOverlay();
        break;
      case 'retry':
        if (this.finishing || this.history.depth === 0) return;
        this.fx.finishAll();
        this.history = retry(this.history);
        this.recorder.record('r');
        this.game.audio.play('undo');
        this.hideOverlay();
        break;
      case 'back':
        this.game.goLevels();
        break;
      case 'confirm':
        break;
    }
  }

  private move(dir: Dir): void {
    if (this.finishing || this.state.status !== 'playing') return;
    this.fx.finishAll();
    const before = this.state;
    const { history, result } = play(this.game.rules, this.history, { type: 'move', dir });
    this.recorder.record(dir);
    if (!result.consumed) {
      animateBump(this.fx, this.game.audio, dir);
      return;
    }
    this.history = history;
    animateTurn(this.fx, this.game.audio, result.events, before, result.state);
    if (result.state.status === 'won') {
      this.finishing = true;
      this.fx.at(0.75, () =>
        this.game.goResults(this.index, result.state, computeStars(this.level, result.state)),
      );
    } else if (result.state.status === 'lost') {
      this.fx.at(0.5, () => this.showOverlay());
    }
  }

  private showOverlay(): void {
    if (this.overlay || !this.ui) return;
    this.overlay = place(
      el('div', { className: 'overlay', testId: 'fail-overlay' }, [
        el('h2', { text: 'Knocked out!' }),
        el('p', { text: 'Undo a move or try again.' }),
        el('div', { className: 'row' }, [
          iconButton('undo', 'Undo', () => this.command({ type: 'undo' }), 'overlay-undo'),
          iconButton('retry', 'Retry', () => this.command({ type: 'retry' }), 'overlay-retry'),
        ]),
      ]),
      BOARD_X + 30,
      BOARD_Y + 110,
      8 * TILE - 60,
      150,
    );
    this.ui.append(this.overlay);
  }

  private hideOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  update(dt: number): void {
    this.fx.update(dt);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const v = this.fx.compute();
    drawHud(ctx, this.index, this.level, s);
    drawBoard(ctx, this.game.rules, s, v, this.fx);
    drawCompass(ctx, s.player.die, 170, BAR_Y + 34);

    // One-line hint that fades once the player gets going.
    if (this.level.hint && s.stats.moves < 3) {
      ctx.save();
      ctx.globalAlpha = 1 - s.stats.moves / 3;
      ctx.font = '600 12px system-ui, sans-serif';
      const w = ctx.measureText(this.level.hint).width + 20;
      ctx.fillStyle = 'rgba(20,18,28,0.85)';
      ctx.beginPath();
      ctx.roundRect(170 - w / 2, BOARD_Y + 9 * TILE - 30, w, 22, 11);
      ctx.fill();
      ctx.fillStyle = C.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.level.hint, 170, BOARD_Y + 9 * TILE - 19);
      ctx.restore();
    }
  }

  /** Replay of everything the player has input so far (for debugging and future sharing). */
  replay() {
    return this.recorder.toReplay();
  }
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  index: number,
  level: LevelData,
  s: GameState,
): void {
  ctx.fillStyle = C.hud;
  ctx.fillRect(0, 0, 340, BOARD_Y - 4);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${index + 1}. ${level.name}`, 12, 16);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = C.textDim;
  const par = level.par !== undefined ? ` / par ${level.par}` : '';
  ctx.fillText(`Moves ${s.stats.moves}${par}`, 12, 35);

  // HP hearts
  for (let i = 0; i < s.player.maxHp; i++) {
    ctx.globalAlpha = i < s.player.hp ? 1 : 0.2;
    drawFace(ctx, 'Heart', 328 - (s.player.maxHp - i) * 17 + 8, 16, 14);
  }
  ctx.globalAlpha = 1;
  drawFace(ctx, 'Coin', 318, 35, 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.gold;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(String(s.gold), 308, 35);
}
