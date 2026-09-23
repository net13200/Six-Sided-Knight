/** The play screen: HUD, board, compass, and Undo / Retry / Menu / Sound buttons. */
import {
  DIRS,
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
import type { PlaySession } from '../session';
import type { Command } from '../input';
import { tapDirection } from '../input';
import { computeStars } from '../stars';
import { el, iconButton, place } from '../ui';
import { animateBump, animateTurn } from '../view/animate';
import { drawFace } from '../view/art';
import { drawBoard, drawCompass } from '../view/board';
import { predictOutcome, type Outcome } from '../view/outcome';
import { Fx } from '../view/fx';
import { BAR_Y, BOARD_X, BOARD_Y, TILE, tileAt } from '../view/layout';
import { C } from '../view/palette';
import { muteButton } from './common';
import { InspectView } from './inspect';
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
  /** Active play time in this scene (paused while the tab is hidden). */
  private activeMs = 0;
  private flushedMs = 0;
  private won = false;
  private inspect: InspectView | null = null;
  /** Move outcomes for the current state (recomputed when the state changes). */
  private outcomes: { state: GameState; list: Array<readonly [Dir, Outcome]> } | null = null;

  constructor(
    private readonly game: Game,
    readonly session: PlaySession,
  ) {
    this.level = session.level;
    this.history = newHistory(createState(game.rules, this.level, { hp: session.startHp }));
    this.recorder = new ReplayRecorder(this.level.id);
    this.fx.reducedMotion = game.reducedMotion;
  }

  get state(): GameState {
    return this.history.state;
  }

  /** Campaign position (for tests and debugging), or null for generated floors. */
  get index(): number | null {
    return this.session.campaignIndex;
  }

  enter(ui: HTMLElement): void {
    this.ui = ui;
    this.game.analytics.track('level_start', { level: this.level.id, mode: this.session.mode });
    this.game.save.update((d) => d.stats.levelsStarted++);
    this.session.onStart?.();
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
      // The compass is drawn on the canvas; this invisible button makes it tappable.
      place(
        el('button', {
          className: 'compass-btn',
          testId: 'compass',
          label: 'Inspect your die',
          onClick: () => this.openInspect(),
        }),
        138,
        y,
        64,
        62,
      ),
    );
  }

  private openInspect(): void {
    if (this.inspect || !this.ui || this.finishing) return;
    this.fx.finishAll();
    this.inspect = new InspectView(this.game, this.state, () => {
      this.inspect = null;
    });
    this.inspect.open(this.ui);
    if (!this.game.save.data.hints.inspect) this.game.save.update((d) => (d.hints.inspect = true));
  }

  command(cmd: Command): void {
    if (this.inspect) {
      this.inspect.command(cmd);
      return;
    }
    switch (cmd.type) {
      case 'inspect':
        this.openInspect();
        break;
      case 'move':
        this.move(cmd.dir);
        break;
      case 'tap': {
        const tile = tileAt(cmd.x, cmd.y);
        if (!tile) return;
        const dir = tapDirection(this.state.player, tile);
        if (dir) this.move(dir);
        else this.openInspect(); // tapping the die itself
        break;
      }
      case 'undo':
        if (this.finishing || this.history.depth === 0) return;
        this.game.analytics.track('undo_used', { level: this.level.id, turn: this.state.turn });
        this.game.save.update((d) => d.stats.undos++);
        this.fx.finishAll();
        this.history = undo(this.history);
        this.recorder.record('u');
        this.game.audio.play('undo');
        this.hideOverlay();
        break;
      case 'retry':
        if (this.finishing || this.history.depth === 0) return;
        this.game.analytics.track('retry_used', { level: this.level.id, turn: this.state.turn });
        this.game.save.update((d) => d.stats.retries++);
        this.fx.finishAll();
        this.history = retry(this.history);
        this.recorder.record('r');
        this.game.audio.play('undo');
        this.hideOverlay();
        break;
      case 'back':
        this.session.onBack();
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
      this.won = true;
      const next = this.session.onWin(
        result.state,
        computeStars(this.level, result.state),
        this.activeMs,
      );
      this.fx.at(0.75, next);
    } else if (result.state.status === 'lost') {
      this.game.analytics.track('level_fail', {
        level: this.level.id,
        turn: result.state.turn,
        time_ms: Math.round(this.activeMs),
      });
      this.game.save.update((d) => d.stats.deaths++);
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
    if (!this.finishing) this.activeMs += dt * 1000;
  }

  exit(): void {
    if (!this.won) {
      this.game.analytics.track('level_quit', {
        level: this.level.id,
        moves: this.state.stats.moves,
        time_ms: Math.round(this.activeMs),
      });
    }
    this.flushTime();
  }

  /** Adds unsaved play time to the lifetime stats. */
  flushTime(): void {
    const add = Math.round(this.activeMs - this.flushedMs);
    if (add <= 0) return;
    this.flushedMs = this.activeMs;
    this.game.save.update((d) => (d.stats.playTimeMs += add));
  }

  render(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const v = this.fx.compute();
    drawHud(ctx, this.session.title, this.level, s);
    drawBoard(ctx, this.game.rules, s, v, this.fx, this.fx.busy ? undefined : this.moveOutcomes(s));
    drawCompass(ctx, s.player.die, 170, BAR_Y + 34);

    // One-time hint for the inspect view, once the level hint has faded.
    const levelHintShowing = this.level.hint !== undefined && s.stats.moves < 3;
    if (!levelHintShowing && this.showInspectHint()) {
      const text = 'Tap the die to inspect it';
      ctx.save();
      ctx.font = '600 11px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 18;
      const pulse = this.game.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(this.fx.time * 4);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(255,215,94,0.95)';
      ctx.beginPath();
      ctx.roundRect(170 - w / 2, BAR_Y - 22, w, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#231a05';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 170, BAR_Y - 13);
      ctx.restore();
    }

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

  private moveOutcomes(s: GameState): Array<readonly [Dir, Outcome]> {
    if (this.outcomes?.state !== s) {
      this.outcomes = {
        state: s,
        list: DIRS.map((d) => [d, predictOutcome(this.game.rules, s, d)] as const),
      };
    }
    return this.outcomes.list;
  }

  /** Shown from level 2 on (and in generated runs) until the player has opened the view once. */
  private showInspectHint(): boolean {
    if (this.game.save.data.hints.inspect || this.inspect) return false;
    const idx = this.session.campaignIndex;
    return idx === null || idx >= 1;
  }

  /** Replay of everything the player has input so far (for debugging and future sharing). */
  replay() {
    return this.recorder.toReplay();
  }
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  title: string,
  level: LevelData,
  s: GameState,
): void {
  ctx.fillStyle = C.hud;
  ctx.fillRect(0, 0, 340, BOARD_Y - 4);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(title, 12, 16);
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
