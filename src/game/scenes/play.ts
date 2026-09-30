/** The play screen: HUD, board, compass, and Undo / Retry / Menu / Sound buttons. */
import {
  DIRS,
  ReplayRecorder,
  leadingFace,
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
import { TUTORIAL_LENGTH, type Game } from '../game';
import type { PlaySession } from '../session';
import type { Command } from '../input';
import { tapDirection } from '../input';
import { computeStars, twoStarLimit } from '../stars';
import { el, icon, iconButton, place } from '../ui';
import { IS_PORTAL } from '../../platform/target';
import { animateBump, animateTurn } from '../view/animate';
import { drawFace } from '../view/art';
import { drawControls, sideCard, touchFirst, wrap } from '../view/backdrop';
import { drawStar } from './common';
import { drawBoard, drawCompass } from '../view/board';
import { predictOutcome, type Outcome } from '../view/outcome';
import { describeBoard, describeTurn } from '../view/describe';
import { Fx } from '../view/fx';
import { BAR_Y, BOARD_X, BOARD_Y, TILE, tileAt } from '../view/layout';
import { C, displayPrefs } from '../view/palette';
import { muteButton } from './common';
import { CHAPTER_NAMES, CHAPTER_SIZE } from '../../meta/progress';
import { InspectView } from './inspect';
import { LessonCard } from './lesson-card';
import { SolutionWatch } from './watch';
import { lessonKey } from '../lessons';
import type { Scene } from './scene';
import { t } from '../../i18n';

export class PlayScene implements Scene {
  readonly name = 'play';
  readonly level: LevelData;
  history: History;
  private fx = new Fx();
  private recorder: ReplayRecorder;
  private overlay: HTMLElement | null = null;
  private finishing = false;
  private ui: HTMLElement | null = null;
  /** Screen-reader announcements (visually hidden live region). */
  private announcer: HTMLElement | null = null;
  /** Active play time in this scene (paused while the tab is hidden). */
  private activeMs = 0;
  private flushedMs = 0;
  private won = false;
  /** Moves per leading face not yet written to the lifetime stats. */
  private faceMoves = new Map<string, number>();
  private inspect: InspectView | null = null;
  /** The lesson card, while it's up (play waits for it). */
  private lesson: LessonCard | null = null;
  /** Dev tool: watching a solution (debug mode). */
  private watch: SolutionWatch | null = null;
  /** The level's first state (for watching a solution from the start). */
  private readonly initial: GameState;
  /** Moves that counted, in order (reported to the session after each one). */
  private readonly moves: Dir[] = [];
  /** Move outcomes for the current state (recomputed when the state changes). */
  private outcomes: { state: GameState; list: Array<readonly [Dir, Outcome]> } | null = null;

  constructor(
    private readonly game: Game,
    readonly session: PlaySession,
  ) {
    this.level = session.level;
    this.history = newHistory(createState(game.rules, this.level, { hp: session.startHp }));
    this.initial = this.history.state;
    // A resumed floor: replay the moves already made on it.
    for (const dir of session.resume ?? []) {
      if (this.history.state.status !== 'playing') break;
      const { history, result } = play(game.rules, this.history, { type: 'move', dir });
      if (!result.consumed) break;
      this.history = history;
      this.moves.push(dir);
    }
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
    this.announcer = el('div', { className: 'sr-only', testId: 'announcer' });
    this.announcer.setAttribute('role', 'status');
    this.announcer.setAttribute('aria-live', 'polite');
    ui.append(this.announcer);
    this.announce(
      `${this.session.title}. ${this.level.hint ? t(this.level.hint) : ''} ${t('Press H to hear the board.')}`,
    );
    this.refreshDescription();
    this.game.analytics.track('level_start', { level: this.level.id, mode: this.session.mode });
    this.game.save.update((d) => d.stats.levelsStarted++);
    this.session.onStart?.();
    // 62x62 logical keeps buttons >= 44 CSS px even when letterboxed in landscape.
    const y = BAR_Y + 3;
    // Permadeath (Depths): no Undo or Retry buttons at all.
    if (!this.session.permadeath) {
      ui.append(
        place(
          iconButton('undo', t('Undo'), () => this.command({ type: 'undo' }), 'undo'),
          4,
          y,
          64,
          62,
        ),
        place(
          iconButton('retry', t('Retry'), () => this.command({ type: 'retry' }), 'retry'),
          70,
          y,
          64,
          62,
        ),
      );
    }
    ui.append(
      place(
        iconButton('menu', t('Menu'), () => this.command({ type: 'back' }), 'menu'),
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
          label: t('Inspect your die'),
          onClick: () => this.openInspect(),
        }),
        138,
        y,
        64,
        62,
      ),
    );
    if (this.game.debug && !this.session.permadeath) {
      ui.append(
        place(
          el('button', {
            className: 'btn small dev-btn',
            testId: 'watch',
            text: '▶ Par',
            label: 'Watch a solution (developer)',
            onClick: () => this.openWatch(),
          }),
          4,
          BAR_Y - 34,
          64,
          30,
        ),
      );
    }
    // Poki build: the best solution, for a rewarded ad (campaign levels past the tutorial).
    if (this.offersSolutionAd) {
      ui.append(
        place(
          el(
            'button',
            {
              className: 'btn small ad-btn',
              testId: 'solution-ad',
              label: t('Show the solution (watch an ad)'),
              onClick: () => this.askSolutionAd(),
            },
            [icon('video'), el('span', { text: t('Solve') })],
          ),
          204,
          8,
          64,
          34,
        ),
      );
    }
    // The secret combo for everyone: 5 quick taps on the level title (see
    // secretTap). Invisible, and kept out of the tab order. Not on portals,
    // where hidden tools aren't allowed (on Poki the solution is a rewarded ad).
    if (!IS_PORTAL) {
      const secret = el('button', {
        className: 'compass-btn',
        testId: 'secret',
        onClick: () => this.secretTap(),
      });
      secret.tabIndex = -1;
      secret.setAttribute('aria-hidden', 'true');
      ui.append(place(secret, 0, 0, 200, BOARD_Y - 2));
    }
    this.openLesson(ui);
  }

  private secretTaps: number[] = [];

  /** 5 taps within 2 seconds on the title shows the best solution. */
  private secretTap(): void {
    const now = performance.now();
    this.secretTaps = [...this.secretTaps.filter((t) => now - t < 2000), now];
    if (this.secretTaps.length >= 5) {
      this.secretTaps = [];
      this.openWatch('secret');
    }
  }

  /** Whether this level offers the solution for a rewarded ad. */
  private get offersSolutionAd(): boolean {
    const i = this.session.campaignIndex;
    return (
      this.game.hasRewardedAds &&
      this.session.mode === 'campaign' &&
      !this.session.permadeath &&
      i !== null &&
      i >= TUTORIAL_LENGTH
    );
  }

  /** Makes clear an ad comes first, then (after it) plays the best solution. */
  private askSolutionAd(): void {
    if (!this.ui || this.watch || this.lesson || this.inspect || this.finishing) return;
    this.game.setPlaying(false);
    this.hideOverlay();
    const sheet = place(
      el('div', { className: 'sheet', testId: 'solution-ad-sheet' }, [
        el('h2', { text: t('Show the solution?') }),
        el('p', { text: t('Watch a short ad, then see the best solution play out.') }),
        // Poki's rules: the plain choice comes first and is at least as big.
        el('div', { className: 'row reward-row' }, [
          el('button', {
            className: 'btn',
            testId: 'solution-ad-cancel',
            text: t('Not now'),
            onClick: () => sheet.remove(),
          }),
          el(
            'button',
            {
              className: 'btn reward-btn',
              testId: 'solution-ad-watch',
              label: t('Watch an ad to see the solution'),
              onClick: () => {
                sheet.remove();
                void this.game.rewardedAd().then((ok) => {
                  // No ad (or an ad blocker): no reward and no message; Poki handles that.
                  if (!ok) return;
                  this.game.audio.play('unlock');
                  this.flashNotice(t('Solution unlocked!'));
                  this.openWatch('reward');
                });
              },
            },
            [icon('video'), el('span', { text: t('Watch ad') })],
          ),
        ]),
      ]),
      40,
      120,
      260,
      0,
    );
    sheet.style.height = 'auto';
    sheet.setAttribute('role', 'dialog');
    this.ui.append(sheet);
    (sheet.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  /** A short message over the board that fades by itself. */
  private flashNotice(text: string): void {
    if (!this.ui) return;
    const n = place(el('div', { className: 'toast', testId: 'notice', text }), 40, 200, 260, 40);
    n.setAttribute('role', 'status');
    this.ui.append(n);
    setTimeout(() => n.remove(), 2500);
  }

  /**
   * Solve the level (in the worker) and watch the best solution play out:
   * the developer button and P (debug mode), the secret combo (web version),
   * or a rewarded ad (Poki), which plays it straight away.
   */
  private openWatch(how: 'dev' | 'secret' | 'reward' = 'dev'): void {
    const allowed =
      how === 'reward' || (how === 'dev' && this.game.debug) || (how === 'secret' && !IS_PORTAL);
    if (!allowed || this.watch || this.lesson || this.inspect || !this.ui) return;
    // No peeking where there are no second chances.
    if (this.session.permadeath) return;
    if (this.finishing) return;
    this.hideOverlay();
    const fx = this.fx;
    this.watch = new SolutionWatch(this.ui, {
      reset: () => {
        this.fx.finishAll();
        this.history = newHistory(this.initial);
        this.refreshDescription();
      },
      play: (dir) => this.move(dir, true),
      get busy() {
        return fx.busy;
      },
      ended: () => {
        this.watch = null;
      },
    });
    this.game.setPlaying(false);
    this.watch.open(this.game.levelService.solve(this.initial), how === 'reward');
  }

  /** The level's lesson, the first time: it types itself out and play waits for "Got it". */
  private openLesson(ui: HTMLElement): void {
    const lesson = this.session.lesson;
    if (!lesson) return;
    this.lesson = new LessonCard(
      lesson,
      () => {
        this.lesson = null;
        this.game.save.update((d) => (d.hints[lessonKey(this.level.id)] = true));
        this.game.stage.canvas.focus();
      },
      this.game.reducedMotion,
    );
    this.lesson.open(ui, BOARD_Y + 70);
  }

  private openInspect(): void {
    if (this.inspect || !this.ui || this.finishing) return;
    this.game.setPlaying(false);
    this.fx.finishAll();
    this.inspect = new InspectView(this.game, this.state, () => {
      this.inspect = null;
    });
    this.inspect.open(this.ui);
    if (!this.game.save.data.hints.inspect) this.game.save.update((d) => (d.hints.inspect = true));
  }

  command(cmd: Command): void {
    if (this.watch) {
      // While watching, only Escape (stop) does anything.
      if (cmd.type === 'back') this.watch.stop();
      return;
    }
    if (cmd.type === 'watch' || cmd.type === 'solution') {
      this.openWatch(cmd.type === 'solution' ? 'secret' : 'dev');
      return;
    }
    if (this.lesson) {
      // The board waits for the lesson to be read.
      if (cmd.type === 'confirm' || cmd.type === 'back') this.lesson.advance();
      else if (cmd.type === 'tap' && this.lesson.typing) this.lesson.advance();
      return;
    }
    if (this.inspect) {
      this.inspect.command(cmd);
      return;
    }
    switch (cmd.type) {
      case 'inspect':
        this.openInspect();
        break;
      case 'describe':
        this.announce(describeBoard(this.game.rules, this.state, this.moveOutcomes(this.state)));
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
        if (this.session.permadeath || this.finishing || this.history.depth === 0) return;
        this.game.analytics.track('undo_used', { level: this.level.id, turn: this.state.turn });
        this.game.save.update((d) => d.stats.undos++);
        this.fx.finishAll();
        this.history = undo(this.history);
        this.recorder.record('u');
        this.announce(
          t('Move undone. HP {hp} of {max}.', {
            hp: this.state.player.hp,
            max: this.state.player.maxHp,
          }),
        );
        this.refreshDescription();
        this.game.audio.play('undo');
        this.hideOverlay();
        break;
      case 'retry':
        if (this.session.permadeath || this.finishing || this.history.depth === 0) return;
        this.game.analytics.track('retry_used', { level: this.level.id, turn: this.state.turn });
        this.game.save.update((d) => d.stats.retries++);
        this.fx.finishAll();
        this.history = retry(this.history);
        this.recorder.record('r');
        this.announce(t('Level restarted.'));
        this.refreshDescription();
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

  /** Plays a move. `watching`: a dev-tool solution move, which never counts. */
  private move(dir: Dir, watching = false): void {
    if (this.finishing || this.state.status !== 'playing') return;
    this.fx.finishAll();
    const before = this.state;
    const predicted = this.moveOutcomes(before).find(([d]) => d === dir)?.[1];
    const { history, result } = play(this.game.rules, this.history, { type: 'move', dir });
    if (!watching) this.recorder.record(dir);
    if (!result.consumed) {
      animateBump(this.fx, this.game.audio, dir);
      if (predicted) this.announce(`${predicted.text}. ${predicted.then ?? ''}`);
      return;
    }
    this.history = history;
    if (predicted) this.announce(describeTurn(before, result.state, predicted));
    this.refreshDescription();
    animateTurn(this.fx, this.game.audio, result.events, before, result.state);
    // A watched solution: no stars, crowns, stats or analytics.
    if (watching) return;
    // The player is playing (portals want this on the first real input).
    this.game.setPlaying(result.state.status === 'playing');
    const face = leadingFace(before.player.die, dir);
    this.faceMoves.set(face, (this.faceMoves.get(face) ?? 0) + 1);
    this.moves.push(dir);
    if (result.state.status === 'playing') this.session.onMove?.(this.moves);
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
      if (this.session.onLose) {
        // No second chances: the run ends now (saved at once), the screen follows the fall.
        this.finishing = true;
        this.fx.at(1.1, this.session.onLose(result.state));
      } else this.fx.at(0.5, () => this.showOverlay());
    }
  }

  private showOverlay(): void {
    if (this.overlay || !this.ui) return;
    this.overlay = place(
      el('div', { className: 'overlay', testId: 'fail-overlay' }, [
        el('h2', { text: t('Knocked out!') }),
        el('p', { text: t('Undo a move or try again.') }),
        el('div', { className: 'row' }, [
          iconButton('undo', t('Undo'), () => this.command({ type: 'undo' }), 'overlay-undo'),
          iconButton('retry', t('Retry'), () => this.command({ type: 'retry' }), 'overlay-retry'),
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

  idle(): boolean {
    return !this.fx.busy && !this.inspect && !this.finishing;
  }

  update(dt: number): void {
    this.fx.update(dt);
    this.watch?.update(dt);
    if (!this.finishing && !this.lesson && !this.watch) this.activeMs += dt * 1000;
  }

  exit(): void {
    this.lesson?.close();
    this.watch?.stop();
    this.game.stage.canvas.setAttribute('aria-label', t('Game board'));
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
    if (add <= 0 && this.faceMoves.size === 0) return;
    this.flushedMs = this.activeMs;
    const faces = [...this.faceMoves];
    this.faceMoves.clear();
    this.game.save.update((d) => {
      d.stats.playTimeMs += Math.max(0, add);
      for (const [face, n] of faces) d.stats.faceMoves[face] = (d.stats.faceMoves[face] ?? 0) + n;
    });
  }

  render(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const v = this.fx.compute();
    const { moves, par } = this.movesAndPar();
    drawHud(ctx, this.session.title, moves, par, s);
    drawBoard(ctx, this.game.rules, s, v, this.fx, this.fx.busy ? undefined : this.moveOutcomes(s));
    drawCompass(ctx, s.player.die, 170, BAR_Y + 34);

    // One-time hint for the inspect view, once the level hint has faded.
    if (this.lesson) {
      // Dim the board under the lesson card.
      ctx.fillStyle = 'rgba(10,8,16,0.6)';
      ctx.fillRect(0, BOARD_Y, 340, BAR_Y - BOARD_Y);
      return;
    }
    const levelHintShowing = this.level.hint !== undefined && s.stats.moves < 3;
    if (!levelHintShowing && this.showInspectHint()) {
      const text = t('Tap the die to inspect it');
      ctx.save();
      ctx.font = '600 11px system-ui, sans-serif';
      const w = Math.min(ctx.measureText(text).width + 18, 250);
      const pulse = this.game.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(this.fx.time * 4);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(255,215,94,0.95)';
      ctx.beginPath();
      ctx.roundRect(170 - w / 2, BAR_Y - 22, w, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#231a05';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 170, BAR_Y - 13, w - 14);
      ctx.restore();
    }

    // A warning from the session (e.g. this die can't win the floor), until the first move.
    if (this.session.notice && s.stats.moves === 0) {
      ctx.save();
      ctx.font = 'bold 11px system-ui, sans-serif';
      const w = Math.min(ctx.measureText(this.session.notice).width + 20, 330);
      ctx.fillStyle = 'rgba(80,14,24,0.92)';
      ctx.beginPath();
      ctx.roundRect(170 - w / 2, BOARD_Y + 6, w, 22, 11);
      ctx.fill();
      ctx.strokeStyle = C.hurt;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffd9dd';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.session.notice, 170, BOARD_Y + 17, w - 16);
      ctx.restore();
    }

    // One-line hint that fades once the player gets going.
    if (this.level.hint && s.stats.moves < 3) {
      const hint = t(this.level.hint);
      ctx.save();
      ctx.globalAlpha = 1 - s.stats.moves / 3;
      ctx.font = `600 ${displayPrefs.largeLabels ? 14 : 12}px system-ui, sans-serif`;
      const w = Math.min(ctx.measureText(hint).width + 20, 330);
      ctx.fillStyle = 'rgba(20,18,28,0.85)';
      ctx.beginPath();
      // Kept away from the die: at the bottom of the board, or the top if the die is low.
      const hy = s.player.y >= 5 ? BOARD_Y + 8 : BOARD_Y + 9 * TILE - 30;
      ctx.roundRect(170 - w / 2, hy, w, 22, 11);
      ctx.fill();
      ctx.fillStyle = C.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hint, 170, hy + 11, w - 16);
      ctx.restore();
    }
  }

  /** Wide screens: the level and its star targets on the left, controls on the right. */
  renderSide(ctx: CanvasRenderingContext2D, side: 'left' | 'right', w: number, h: number): void {
    const cardH = side === 'left' ? 300 : 330;
    ctx.save();
    ctx.translate(0, (h - cardH) / 2);
    if (side === 'left') this.levelCard(ctx, w, cardH);
    else this.controlsCard(ctx, w, cardH);
    ctx.restore();
  }

  /** Moves and par shown: the level's own, or a gauntlet's whole run. */
  private movesAndPar(): { moves: number; par: number | undefined } {
    const run = this.session.run;
    const moves = this.state.stats.moves;
    return run ? { moves: run.movesBefore + moves, par: run.par } : { moves, par: this.level.par };
  }

  private levelCard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const s = this.state;
    const { moves, par } = this.movesAndPar();
    const i = this.session.campaignIndex;
    let y = sideCard(
      ctx,
      w,
      h,
      i !== null
        ? t('Chapter {n} · {name}', {
            n: Math.floor(i / CHAPTER_SIZE) + 1,
            name: t(CHAPTER_NAMES[Math.floor(i / CHAPTER_SIZE)] ?? ''),
          })
        : this.session.title,
    );
    ctx.fillStyle = C.text;
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.textAlign = 'left';
    if (i !== null) y = wrap(ctx, t(this.level.name), 16, y + 4, w - 32, 24);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(t('Moves'), 16, y + 14);
    ctx.fillStyle = C.text;
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillText(String(moves), 16, y + 44);
    y += 78;
    if (par !== undefined) {
      const tiers: Array<[number, string]> = [
        [3, t('{n} moves or fewer', { n: par })],
        [2, t('{n} or fewer', { n: twoStarLimit(par) })],
        [1, t('Reach the stairs')],
      ];
      const now = moves <= par ? 3 : moves <= twoStarLimit(par) ? 2 : 1;
      for (const [n, text] of tiers) {
        for (let k = 0; k < 3; k++) drawStar(ctx, 24 + k * 15, y, 6, k < n);
        ctx.fillStyle = n === now ? C.text : C.textDim;
        ctx.font = `${n === now ? 'bold ' : ''}13px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(text, 76, y + 1, w - 90);
        y += 28;
      }
    }
    y += 6;
    for (let k = 0; k < s.player.maxHp; k++) {
      ctx.globalAlpha = k < s.player.hp ? 1 : 0.2;
      drawFace(ctx, 'Heart', 26 + k * 24, y + 4, 18);
    }
    ctx.globalAlpha = 1;
  }

  private controlsCard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const y = sideCard(ctx, w, h, t('How to play'));
    const rows: ReadonlyArray<readonly [string, string]> = touchFirst()
      ? [
          [t('Swipe'), t('Roll the die one tile')],
          [t('Tap'), t('Roll toward a tile')],
          [t('Die'), t('Tap it to see all six faces')],
        ]
      : [
          ['← ↑ → ↓', t('Roll the die one tile (or W A S D)')],
          ['Z', t('Undo a move')],
          ['R', t('Retry the level')],
          ['I', t('Look at all six faces')],
          ['H', t('Hear the board described')],
          ['M', t('Sound on or off')],
          ['Esc', t('Back to the menu')],
        ];
    const end = drawControls(ctx, w, y + 4, rows);
    ctx.fillStyle = C.textDim;
    ctx.font = '12px system-ui, sans-serif';
    wrap(
      ctx,
      t('The labels next to the die show what each roll would do.'),
      16,
      end + 6,
      w - 32,
      16,
    );
  }

  private announce(text: string): void {
    if (!this.announcer) return;
    // Clearing first makes screen readers repeat identical messages.
    this.announcer.textContent = '';
    this.announcer.textContent = text.trim();
  }

  /** The canvas's accessible name describes the board (screen readers read it on focus). */
  private refreshDescription(): void {
    const text = describeBoard(this.game.rules, this.state, this.moveOutcomes(this.state));
    this.game.stage.canvas.setAttribute('aria-label', `${t('Game board.')} ${text}`);
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
  moves: number,
  par: number | undefined,
  s: GameState,
): void {
  ctx.fillStyle = C.hud;
  ctx.fillRect(0, 0, 340, BOARD_Y - 4);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(title, 12, 16, 268);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = C.textDim;
  ctx.fillText(
    par !== undefined
      ? t('Moves {n} / par {par}', { n: moves, par })
      : t('Moves {n}', { n: moves }),
    12,
    35,
  );

  // HP hearts
  for (let i = 0; i < s.player.maxHp; i++) {
    ctx.globalAlpha = i < s.player.hp ? 1 : 0.2;
    drawFace(ctx, 'Heart', 328 - (s.player.maxHp - i) * 17 + 8, 16, 14);
  }
  ctx.globalAlpha = 1;
}
