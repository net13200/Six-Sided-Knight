/**
 * Playing a Ranger stage (the bonus chapter): the forest board, the d8, Undo
 * / Retry / Map / Sound, the stage's lesson on first play, and a win panel
 * with stars. Its own scene: the Ranger's board is made of triangles.
 */
import type { Dir } from '../../engine';
import { RANGER_FACE_INFO, RANGER_LESSONS } from '../../ranger/lessons';
import {
  SLOT,
  faceAt,
  leading,
  startState,
  step,
  type REvent,
  type RState,
} from '../../ranger/rules';
import {
  ORIGIN,
  center,
  cellAt,
  dirTo,
  drawD8,
  drawEnemy,
  drawForest,
  drawRangerFace,
  type Pt,
} from '../../ranger/view';
import { crownsForStars, earnCrowns } from '../../meta/store';
import type { Game } from '../game';
import type { Command } from '../input';
import { lessonKey } from '../lessons';
import { twoStarLimit } from '../stars';
import { drawControls, sideCard, touchFirst, wrap } from '../view/backdrop';
import { el, iconButton, place } from '../ui';
import { drawFace } from '../view/art';
import { C } from '../view/palette';
import { muteButton } from './common';
import { LessonCard } from './lesson-card';
import type { Scene } from './scene';

const MOVE_TIME = 0.16;
const BAR_Y = 415;

interface Flash {
  kind: 'arrow' | 'stab' | 'bite' | 'charge' | 'heal';
  from: Pt;
  to: Pt;
  t: number;
}

export class RangerPlayScene implements Scene {
  readonly name = 'ranger';
  readonly backdrop = 'forest' as const;
  private history: RState[] = [];
  private state: RState;
  private t = 0;
  /** The previous state and when the last move started (for the roll animation). */
  private prev: RState | null = null;
  private moveT = 1;
  private flashes: Flash[] = [];
  private hurtT = 0;
  private lesson: LessonCard | null = null;
  private panel: HTMLElement | null = null;
  private info: HTMLElement | null = null;
  private ui: HTMLElement | null = null;
  private finished = false;

  constructor(
    private readonly game: Game,
    readonly index: number,
  ) {
    this.state = startState(game.rangerLevels[index]!);
  }

  private get level() {
    return this.state.level;
  }

  enter(ui: HTMLElement): void {
    this.ui = ui;
    this.game.analytics.track('level_start', { level: this.level.id, mode: 'ranger' });
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
        iconButton('die', 'Faces', () => this.command({ type: 'inspect' }), 'faces'),
        138,
        y,
        64,
        62,
      ),
      place(
        iconButton('menu', 'Map', () => this.command({ type: 'back' })),
        206,
        y,
        64,
        62,
      ),
      place(muteButton(this.game), 272, y, 64, 62),
    );
    const lesson = RANGER_LESSONS[this.level.id];
    if (lesson && !this.game.save.data.hints[lessonKey(this.level.id)]) {
      this.lesson = new LessonCard(
        lesson,
        () => {
          this.lesson = null;
          this.game.save.update((d) => (d.hints[lessonKey(this.level.id)] = true));
          this.game.stage.canvas.focus();
        },
        this.game.reducedMotion,
      );
      this.lesson.open(ui, 150);
    }
  }

  exit(): void {
    this.lesson?.close();
  }

  command(cmd: Command): void {
    if (this.lesson) {
      if (cmd.type === 'confirm' || cmd.type === 'back') this.lesson.advance();
      else if (cmd.type === 'tap' && this.lesson.typing) this.lesson.advance();
      return;
    }
    if (this.info) {
      if (cmd.type !== 'move') this.closeInfo();
      return;
    }
    if (this.finished) {
      if (cmd.type === 'confirm') this.next();
      else if (cmd.type === 'back') this.game.goRangerMap();
      return;
    }
    switch (cmd.type) {
      case 'move':
        this.move(cmd.dir);
        break;
      case 'tap': {
        const cell = cellAt(cmd.x, cmd.y, this.level.width, this.level.height);
        if (!cell) return;
        if (cell.x === this.state.x && cell.y === this.state.y) this.openInfo();
        else {
          const d = dirTo(this.state, cell);
          if (d) this.move(d);
        }
        break;
      }
      case 'undo': {
        const before = this.history.pop();
        if (!before) return;
        this.state = before;
        this.prev = null;
        this.moveT = 1;
        this.game.audio.play('undo');
        this.hidePanel();
        break;
      }
      case 'retry':
        if (!this.history.length) return;
        this.state = this.history[0]!;
        this.history = [];
        this.prev = null;
        this.game.audio.play('undo');
        this.hidePanel();
        break;
      case 'inspect':
        this.openInfo();
        break;
      case 'back':
        this.game.goRangerMap();
        break;
    }
  }

  private move(dir: Dir): void {
    if (this.state.status !== 'playing') return;
    const r = step(this.state, dir);
    if (!r.consumed) {
      this.game.audio.play('bump');
      return;
    }
    this.history.push(this.state);
    this.game.setPlaying(r.state.status === 'playing');
    this.prev = this.state;
    this.moveT = 0;
    this.state = r.state;
    this.react(r.events);
    if (r.state.status === 'won') this.win();
    else if (r.state.status === 'lost') {
      this.game.audio.play('lose');
      this.showPanel(false);
    }
  }

  /** Sounds and flashes for what happened. */
  private react(events: readonly REvent[]): void {
    let sound: Parameters<Game['audio']['play']>[0] = 'roll';
    for (const e of events) {
      if (e.type === 'shot') {
        this.flashes.push({
          kind: 'arrow',
          from: center(e.from.x, e.from.y),
          to: center(e.to.x, e.to.y),
          t: 0,
        });
        sound = 'shoot';
      } else if (e.type === 'stabbed') {
        const c = center(e.at.x, e.at.y);
        this.flashes.push({ kind: 'stab', from: c, to: c, t: 0 });
        sound = 'hit';
      } else if (e.type === 'killed') sound = 'kill';
      else if (e.type === 'moved' && e.swing) sound = 'pull';
      else if (e.type === 'moved' && e.leap) sound = 'slide';
      else if (e.type === 'snareLaid' || e.type === 'snared') sound = 'freeze';
      else if (e.type === 'bitten' || e.type === 'charged') {
        const c = center(e.from.x, e.from.y);
        this.flashes.push({
          kind: e.type === 'bitten' ? 'bite' : 'charge',
          from: c,
          to: center(this.state.x, this.state.y),
          t: 0,
        });
        this.hurtT = 1;
        sound = 'hurt';
      } else if (e.type === 'healed') sound = 'heal';
    }
    this.game.audio.play(sound);
  }

  private win(): void {
    this.finished = true;
    const moves = this.state.moves;
    const par = this.level.par ?? moves;
    const stars = moves <= par ? 3 : moves <= twoStarLimit(par) ? 2 : 1;
    const id = this.level.id;
    let crowns = 0;
    this.game.save.update((d) => {
      const prev = d.bonus[id];
      const best = Math.max(prev?.stars ?? 0, stars);
      crowns = earnCrowns(d, crownsForStars(best - (prev?.stars ?? 0)));
      d.bonus[id] = {
        stars: best,
        bestMoves: prev && prev.bestMoves > 0 ? Math.min(prev.bestMoves, moves) : moves,
        completions: (prev?.completions ?? 0) + 1,
        bestTimeMs: 0,
      };
    });
    this.game.analytics.track('level_complete', {
      level: id,
      moves,
      hp: this.state.hp,
      stars,
      time_ms: 0,
    });
    this.game.audio.play('win');
    setTimeout(() => this.showPanel(true, stars, crowns), this.game.reducedMotion ? 0 : 450);
  }

  private get isLast(): boolean {
    return this.index + 1 >= this.game.rangerLevels.length;
  }

  private next(): void {
    if (!this.isLast)
      this.game.breakThen('bonus-next', () => this.game.goRangerPlay(this.index + 1));
    else this.game.goRangerOutro();
  }

  private showPanel(won: boolean, stars = 0, crowns = 0): void {
    if (!this.ui || this.panel) return;
    this.finished = won;
    const body = won
      ? [
          el('h2', { text: `${this.level.name}: done!` }),
          el('p', {
            text:
              `${this.state.moves} moves (par ${this.level.par}).` +
              (crowns > 0 ? ` +${crowns} crowns.` : ''),
          }),
          el('div', {
            className: 'stars-row',
            testId: 'ranger-stars',
            text: '★'.repeat(stars) + '☆'.repeat(3 - stars),
          }),
          el('div', { className: 'row' }, [
            el('button', {
              className: 'btn primary',
              testId: 'ranger-next',
              text: this.isLast ? 'Onward' : 'Next stage',
              onClick: () => this.next(),
            }),
          ]),
          el('div', { className: 'row' }, [
            el('button', {
              className: 'btn small',
              testId: 'ranger-again',
              text: 'Again',
              onClick: () => this.game.goRangerPlay(this.index),
            }),
            el('button', {
              className: 'btn small',
              testId: 'ranger-map',
              text: 'Map',
              onClick: () => this.game.goRangerMap(),
            }),
          ]),
        ]
      : [
          el('h2', { text: 'Knocked out!' }),
          el('p', { text: 'Undo a move or try again.' }),
          el('div', { className: 'row' }, [
            iconButton('undo', 'Undo', () => this.command({ type: 'undo' }), 'overlay-undo'),
            iconButton('retry', 'Retry', () => this.command({ type: 'retry' }), 'overlay-retry'),
          ]),
        ];
    this.panel = place(
      el('div', { className: 'overlay', testId: won ? 'ranger-won' : 'fail-overlay' }, body),
      40,
      140,
      260,
      0,
    );
    this.panel.style.height = 'auto';
    this.ui.append(this.panel);
    (this.panel.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  private hidePanel(): void {
    this.panel?.remove();
    this.panel = null;
  }

  /** The die's eight faces: where each one is now, and what it does. */
  private openInfo(): void {
    if (!this.ui || this.info) return;
    this.game.setPlaying(false);
    const lo = this.level.loadout;
    const s = this.state;
    const slots: Array<[string, string]> = [
      ['On top', faceAt(lo, s.orient, SLOT.top)],
      ['Face-down', faceAt(lo, s.orient, SLOT.bottom)],
      ...(['W', 'E', s.y >= 0 && (s.x + s.y) % 2 === 0 ? 'S' : 'N'] as Dir[]).map(
        (d) =>
          [
            `Leads ${({ W: 'left', E: 'right', N: 'up', S: 'down' } as const)[d]}`,
            leading(lo, s.orient, d),
          ] as [string, string],
      ),
    ];
    const rows = slots.map(([where, face]) =>
      el('li', {}, [
        el('strong', { text: `${where}: ${face}` }),
        el('span', { text: ` ${RANGER_FACE_INFO[face] ?? ''}` }),
      ]),
    );
    this.info = place(
      el('div', { className: 'sheet', testId: 'ranger-faces' }, [
        el('h2', { text: 'Your d8' }),
        el('ul', { className: 'faces-list' }, rows),
        el('button', {
          className: 'btn',
          testId: 'ranger-faces-close',
          text: 'Close',
          onClick: () => this.closeInfo(),
        }),
      ]),
      20,
      90,
      300,
      0,
    );
    this.info.style.height = 'auto';
    this.ui.append(this.info);
  }

  private closeInfo(): void {
    this.info?.remove();
    this.info = null;
  }

  /** Wide screens: the stage and its targets on the left, controls on the right. */
  renderSide(ctx: CanvasRenderingContext2D, side: 'left' | 'right', w: number, h: number): void {
    const cardH = 280;
    ctx.save();
    ctx.translate(0, (h - cardH) / 2);
    if (side === 'left') {
      let y = sideCard(ctx, w, cardH, 'Bonus · The Greenwood');
      ctx.fillStyle = C.text;
      ctx.font = '800 20px system-ui, sans-serif';
      ctx.textAlign = 'left';
      y = wrap(ctx, this.level.name, 16, y + 4, w - 32, 24);
      ctx.fillStyle = C.textDim;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Moves', 16, y + 14);
      ctx.fillStyle = C.text;
      ctx.font = '800 34px system-ui, sans-serif';
      ctx.fillText(String(this.state.moves), 16, y + 44);
      y += 78;
      const par = this.level.par ?? 0;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = C.textDim;
      wrap(ctx, `★★★ in ${par} moves or fewer, ★★ in ${twoStarLimit(par)}.`, 16, y, w - 32, 17);
    } else {
      const y = sideCard(ctx, w, cardH, 'How to play');
      drawControls(
        ctx,
        w,
        y + 4,
        touchFirst()
          ? [
              ['Swipe', 'Roll across an edge'],
              ['Tap', 'Roll to a neighbouring triangle'],
              ['Die', 'Tap it to see your faces'],
            ]
          : [
              ['← →', 'Roll along the row'],
              ['↑ ↓', 'Roll through the flat edge'],
              ['Z', 'Undo a move'],
              ['R', 'Retry the stage'],
              ['I', 'Your faces'],
              ['Esc', 'Back to the map'],
            ],
      );
    }
    ctx.restore();
  }

  update(dt: number): void {
    this.t += dt;
    const speed = this.game.reducedMotion ? 100 : 1;
    this.moveT = Math.min(1, this.moveT + (dt * speed) / MOVE_TIME);
    this.hurtT = Math.max(0, this.hurtT - dt * 2.5);
    for (const f of this.flashes) f.t += dt * speed;
    this.flashes = this.flashes.filter((f) => f.t < 0.5);
  }

  idle(): boolean {
    return this.moveT >= 1 && this.flashes.length === 0;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    const t = this.game.reducedMotion ? 0 : this.t;
    drawForest(ctx, s, t);
    const k = easeOut(this.moveT);
    const lerp = (a: Pt, b: Pt): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    for (const e of s.enemies) {
      const before = this.prev?.enemies.find((p) => p.id === e.id);
      const p =
        before && k < 1 ? lerp(center(before.x, before.y), center(e.x, e.y)) : center(e.x, e.y);
      drawEnemy(ctx, e, p, t);
    }
    const from = this.prev && k < 1 ? center(this.prev.x, this.prev.y) : center(s.x, s.y);
    const at = lerp(from, center(s.x, s.y));
    const squash =
      k < 1 && this.prev && (this.prev.x !== s.x || this.prev.y !== s.y)
        ? 1 + Math.sin(k * Math.PI) * 0.12
        : 1;
    drawD8(ctx, s, at, s.x, s.y, squash);
    for (const f of this.flashes) drawFlash(ctx, f);
    if (this.hurtT > 0) {
      ctx.fillStyle = `rgba(255,60,60,${this.hurtT * 0.25})`;
      ctx.fillRect(0, 0, 340, 480);
    }
    drawHud(ctx, this.index, s);
    if (this.level.hint && s.moves < 3 && !this.lesson) drawHint(ctx, this.level.hint, s.moves);
    if (this.lesson) {
      ctx.fillStyle = 'rgba(10,8,16,0.6)';
      ctx.fillRect(0, ORIGIN.y - 8, 340, BAR_Y - ORIGIN.y + 8);
    }
  }
}

function easeOut(k: number): number {
  return 1 - (1 - k) * (1 - k);
}

function drawFlash(ctx: CanvasRenderingContext2D, f: Flash): void {
  const a = 1 - f.t / 0.5;
  ctx.save();
  ctx.globalAlpha = a;
  if (f.kind === 'arrow') {
    const k = Math.min(1, f.t / 0.2);
    const x = f.from.x + (f.to.x - f.from.x) * k;
    const y = f.from.y + (f.to.y - f.from.y) * k;
    ctx.strokeStyle = '#f5e6c8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - Math.sign(f.to.x - f.from.x) * 14, y);
    ctx.lineTo(x, y);
    ctx.stroke();
  } else if (f.kind === 'stab' || f.kind === 'heal') {
    ctx.strokeStyle = f.kind === 'stab' ? '#ffffff' : C.heal;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.from.x, f.from.y, 8 + f.t * 30, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = C.hurt;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(f.from.x, f.from.y);
    ctx.lineTo(f.to.x, f.to.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, index: number, s: RState): void {
  ctx.fillStyle = 'rgba(10,20,14,0.85)';
  ctx.fillRect(0, 0, 340, 50);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`Bonus ${index + 1}. ${s.level.name}`, 12, 16);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = C.textDim;
  ctx.fillText(
    `Moves ${s.moves}${s.level.par !== undefined ? ` / par ${s.level.par}` : ''}`,
    12,
    35,
  );
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = i < s.hp ? 1 : 0.2;
    drawFace(ctx, 'Heart', 328 - (3 - i) * 17 + 8, 16, 14);
  }
  ctx.globalAlpha = 1;
  drawRangerFace(ctx, 'Leaf', 318, 35, 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9cc47a';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('Greenwood', 308, 35);
}

function drawHint(ctx: CanvasRenderingContext2D, hint: string, moves: number): void {
  ctx.save();
  ctx.globalAlpha = 1 - moves / 3;
  ctx.font = '600 12px system-ui, sans-serif';
  const w = ctx.measureText(hint).width + 20;
  ctx.fillStyle = 'rgba(10,20,14,0.88)';
  ctx.beginPath();
  ctx.roundRect(170 - w / 2, 388, w, 22, 11);
  ctx.fill();
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hint, 170, 399);
  ctx.restore();
}
