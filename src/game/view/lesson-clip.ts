/**
 * Plays a lesson clip on a small canvas: the clip's tiny level, rolled move
 * by move with the game's own rules and animations. Before the move that
 * matters, the side that will act lights up; a ghost finger shows each
 * swipe; a check mark pops when it works; then it starts over. No text.
 * A clip can show the wrong way on the left (it gets a cross), and the two
 * loop together.
 */
import type { Rules } from '../../engine/registry';
import {
  createState,
  parseTextLevel,
  step,
  type Dir,
  type GameEvent,
  type GameState,
  type Pos,
} from '../../engine';
import type { Audio } from '../audio';
import type { Clip, Focus, FocusKind, Reel } from '../lesson-clips';
import { animateTurn } from './animate';
import { drawFace } from './art';
import { drawBoard } from './board';
import { facesOf } from './cube';
import { Fx } from './fx';
import { tileCenter } from './layout';

const SILENT = { play() {} } as unknown as Audio;
const DV: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const R = 28; // the die's half-size on the board, as drawn by the game
/** Between the two panels of a side-by-side clip, in tiles. */
const GAP = 0.4;

type Phase = 'wait' | 'focus' | 'hand' | 'roll' | 'floor' | 'hold' | 'fade';

/** Timing, in seconds. */
const T = {
  wait: 0.45, // before the first move, and after the check mark pops
  focus: 0.8, // the side that matters is lit before the swipe
  hand: 0.5, // the swipe
  settle: 0.2, // at least this long after each roll
  floor: 0.45, // a gauntlet: from one floor's stairs to the next floor
  hold: 0.9, // at the end, before it starts over
  fade: 0.3,
} as const;

/** Two reels go side by side, or one above the other when the view is wide. */
function stacked(clip: Clip): boolean {
  return !!clip.beside && clip.view[2] > clip.view[3];
}

/** The canvas size in tiles. */
function size(clip: Clip): [number, number] {
  const [, , vw, vh] = clip.view;
  if (!clip.beside) return [vw, vh];
  return stacked(clip) ? [vw, vh * 2 + GAP] : [vw * 2 + GAP, vh];
}

/** Width / height of a clip's canvas. */
export function clipAspect(clip: Clip): number {
  const [w, h] = size(clip);
  return w / h;
}

/** One reel: a level (or a gauntlet's floors) played move by move. */
class ReelPlayer {
  state!: GameState;
  private fx!: Fx;
  private floor = 0;
  private floorStart = 0; // the index of this floor's first move
  i = 0;
  phase: Phase = 'wait';
  t = 0;
  private mark: { x: number; y: number; t: number } | null = null;
  private lastEvents: readonly GameEvent[] = [];
  private topBefore = '';
  private readonly floors: { level: string; moves: Dir[] }[];
  private readonly moves: Dir[];

  constructor(
    private readonly rules: Rules,
    private readonly reel: Reel,
    /** A cross instead of a check mark: the wrong way. */
    private readonly wrong: boolean,
    private readonly hearts: boolean,
  ) {
    this.floors = [{ level: reel.level, moves: reel.moves }, ...(reel.floors ?? [])];
    this.moves = this.floors.flatMap((f) => f.moves);
    this.reset();
  }

  reset(): void {
    this.floor = 0;
    this.floorStart = 0;
    this.load(this.reel.hp);
    this.i = 0;
    this.phase = 'wait';
    this.t = 0;
    this.mark = null;
  }

  private load(hp: number | undefined): void {
    let s = createState(this.rules, parseTextLevel(this.floors[this.floor]!.level));
    if (hp !== undefined) s = { ...s, player: { ...s.player, hp } };
    this.state = s;
    this.fx = new Fx();
  }

  private go(phase: Phase): void {
    this.phase = phase;
    this.t = 0;
  }

  /** Played to the end and holding (the clip starts both reels over together). */
  get done(): boolean {
    return this.phase === 'hold' && this.t > T.hold;
  }

  fade(): void {
    this.go('fade');
  }

  get faded(): boolean {
    return this.phase === 'fade' && this.t > T.fade;
  }

  update(dt: number): void {
    this.t += dt;
    this.fx.update(dt);
    if (this.mark) this.mark.t += dt;
    const check = this.reel.check;
    switch (this.phase) {
      case 'wait':
        if (this.t > T.wait) this.go(this.i < this.moves.length ? this.beforeRoll() : 'hold');
        break;
      case 'focus':
        // the side that matters lights up first, before any swipe
        if (this.t > T.focus) this.go('hand');
        break;
      case 'hand':
        if (this.t > T.hand) this.roll();
        break;
      case 'roll':
        if (!this.fx.busy && this.t > T.settle) {
          const marked = check?.after === this.i;
          if (marked) this.mark ??= { ...this.markSpot(), t: 0 };
          this.i++;
          if (this.i >= this.moves.length) this.go('hold');
          else if (this.i - this.floorStart >= this.floors[this.floor]!.moves.length)
            this.go('floor');
          else this.go(marked ? 'wait' : this.beforeRoll());
        }
        break;
      case 'floor':
        // down the stairs: the next floor, with the HP left
        if (this.t > T.floor) {
          this.floorStart = this.i;
          this.floor++;
          this.load(this.state.player.hp);
          this.go('wait');
        }
        break;
      case 'hold':
      case 'fade':
        break;
    }
  }

  private get focus(): Focus | undefined {
    return this.reel.focus?.find((f) => f.move === this.i);
  }

  /** A move that matters gets its side highlighted first. */
  private beforeRoll(): Phase {
    return this.focus ? 'focus' : 'hand';
  }

  private roll(): void {
    const dir = this.moves[this.i]!;
    const before = this.state;
    this.topBefore = facesOf(before.player.die).top ?? '';
    const res = step(this.rules, before, { type: 'move', dir });
    this.state = res.state;
    this.lastEvents = res.events;
    // no gold pop-ups: one less thing to look at
    const shown = res.events.filter((e) => e.type !== 'gold');
    animateTurn(this.fx, SILENT, shown, before, res.state);
    this.go('roll');
  }

  /** Where the mark pops: on the thing that happened, or on the die. */
  private markSpot(): { x: number; y: number } {
    let at: Pos = { x: this.state.player.x, y: this.state.player.y };
    if (this.reel.check?.at === 'event') {
      const spots: Pos[] = [];
      for (const e of this.lastEvents) {
        if (e.type === 'killed' || e.type === 'unlocked' || e.type === 'opened') spots.push(e.at);
        else if (e.type === 'pulled') spots.push(e.to);
        else if (e.type === 'effectApplied') {
          const enemy = this.state.enemies.find((q) => q.id === e.enemyId);
          if (enemy) spots.push(enemy);
        }
      }
      if (!spots.length) {
        const hit = this.lastEvents.find((e) => e.type === 'attacked');
        if (hit?.type === 'attacked') spots.push(hit.at);
      }
      // several fell at once: in the middle of them
      if (spots.length) {
        const mid = (k: 'x' | 'y') =>
          (Math.min(...spots.map((p) => p[k])) + Math.max(...spots.map((p) => p[k]))) / 2;
        at = { x: mid('x'), y: mid('y') };
      }
    }
    const c = tileCenter(at.x, at.y);
    return { x: c.x, y: c.y };
  }

  /** Draws in board coordinates (the caller has set the transform and clip). */
  draw(ctx: CanvasRenderingContext2D, view: Clip['view']): void {
    drawBoard(ctx, this.rules, this.state, this.fx.compute(), this.fx);
    const v = this.fx.compute();
    const p = tileCenter(this.state.player.x, this.state.player.y);
    const px = p.x + v.player.dx;
    const py = p.y + v.player.dy;
    const pulse = 0.6 + Math.sin(this.fx.time * 8) * 0.4;
    const f = this.focus;
    if (f) {
      const dir = this.moves[f.move]!;
      if (this.phase === 'focus' || this.phase === 'hand') {
        // before the roll: the side that will act lights up (the top face gets a badge)
        const appear = this.phase === 'focus' ? Math.min(1, this.t / 0.3) : 1;
        const side: FocusKind = f.kind === 'bottom' ? 'lead' : f.kind;
        glow(ctx, side, dir, px, py, pulse, appear);
        if (side === 'top')
          badge(ctx, facesOf(this.state.player.die).top ?? '', px, py, pulse, appear);
        else if (side === 'lead') chevrons(ctx, dir, px, py, this.fx.time, appear);
      } else if (this.phase === 'roll') {
        // during the roll: where it ends up (under the die, or on top)
        const top = facesOf(this.state.player.die).top ?? '';
        if (f.kind === 'bottom') glow(ctx, 'bottom', dir, px, py, pulse, 1);
        else if (f.kind === 'up' || (f.kind === 'top' && top === this.topBefore)) {
          glow(ctx, 'top', dir, px, py, pulse, 1);
          if (f.kind === 'up') badge(ctx, top, px, py, pulse, 1);
        }
      }
    }
    if (this.phase === 'hand') hand(ctx, px, py, this.moves[this.i]!, this.t / T.hand);
    if (this.phase === 'floor') {
      // the die sinks into the stairs
      const k = Math.min(1, this.t / T.floor);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = '#14121c';
      ctx.beginPath();
      ctx.arc(px, py, R + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (this.hearts) drawHearts(ctx, view, this.state.player.hp, this.state.player.maxHp);
    if (this.mark) (this.wrong ? crossMark : checkMark)(ctx, this.mark.x, this.mark.y, this.mark.t);
  }

  /** 0..1: how dark the panel is (fading out at the end, in at the start). */
  get dark(): number {
    if (this.phase === 'fade') return Math.min(1, this.t / T.fade);
    if (this.phase === 'wait' && this.i === 0) return Math.max(0, 1 - this.t / 0.25);
    return 0;
  }
}

export class ClipPlayer {
  private readonly reels: ReelPlayer[];
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    rules: Rules,
    private readonly clip: Clip,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const hearts = clip.hearts ?? false;
    this.reels = [
      ...(clip.beside ? [new ReelPlayer(rules, clip.beside, true, hearts)] : []),
      new ReelPlayer(rules, clip, false, hearts),
    ];
  }

  update(dt: number): void {
    for (const r of this.reels) r.update(dt);
    // both played out: fade out together, and start over together
    if (this.reels.every((r) => r.done)) for (const r of this.reels) r.fade();
    if (this.reels.every((r) => r.faded)) for (const r of this.reels) r.reset();
  }

  draw(): void {
    const { ctx, canvas, clip } = this;
    const [vx, vy, vw, vh] = clip.view;
    const k = canvas.width / (size(clip)[0] * 40);
    const down = stacked(clip);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#14121c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.reels.forEach((reel, n) => {
      // this panel's corner, in canvas pixels
      const left = down ? 0 : n * (vw + GAP) * 40 * k;
      const top = down ? n * (vh + GAP) * 40 * k : 0;
      const w = vw * 40 * k;
      const h = vh * 40 * k;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, w, h);
      ctx.clip();
      ctx.setTransform(k, 0, 0, k, left - (10 + vx * 40) * k, top - (50 + vy * 40) * k);
      reel.draw(ctx, clip.view);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (reel.dark > 0) {
        ctx.fillStyle = `rgba(20,18,28,${reel.dark})`;
        ctx.fillRect(left, top, w, h);
      }
      ctx.restore();
    });
  }
}

/** A gold glow on the face that matters. */
function glow(
  ctx: CanvasRenderingContext2D,
  kind: FocusKind,
  dir: Dir,
  px: number,
  py: number,
  pulse: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = `rgba(255,215,94,${0.55 + pulse * 0.45})`;
  ctx.shadowColor = '#ffd75e';
  ctx.shadowBlur = 20;
  ctx.lineWidth = 5.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (kind === 'top') {
    ctx.roundRect(px - 17, py - 17, 34, 34, 6);
  } else if (kind === 'bottom') {
    ctx.arc(px + R - 1, py + R + 2, 11, 0, Math.PI * 2);
  } else {
    // the side it rolls with, or ('up') the side behind it
    const s = kind === 'up' ? -1 : 1;
    const [dx, dy] = DV[dir];
    if (dx) {
      ctx.moveTo(px + s * dx * (R + 1), py - R + 6);
      ctx.lineTo(px + s * dx * (R + 1), py + R - 2);
    } else {
      ctx.moveTo(px - R + 6, py + s * dy * (R + 1));
      ctx.lineTo(px + R - 6, py + s * dy * (R + 1));
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** A face, enlarged in a badge above the die. */
function badge(
  ctx: CanvasRenderingContext2D,
  name: string,
  px: number,
  py: number,
  pulse: number,
  alpha: number,
): void {
  const s = (0.8 + alpha * 0.2) * (1 + pulse * 0.06);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, py - R - 24);
  ctx.scale(s, s);
  ctx.shadowColor = '#ffd75e';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#2b2540';
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffd75e';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  drawFace(ctx, name, 0, 0, 20);
  ctx.restore();
}

/** Chevrons running out of the lit side, the way it will roll. */
function chevrons(
  ctx: CanvasRenderingContext2D,
  dir: Dir,
  px: number,
  py: number,
  t: number,
  alpha: number,
): void {
  const [dx, dy] = DV[dir];
  ctx.save();
  ctx.strokeStyle = '#ffd75e';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#ffd75e';
  ctx.shadowBlur = 8;
  for (let k = 0; k < 2; k++) {
    const phase = (t * 1.6 + k * 0.5) % 1;
    const d = R + 5 + phase * 9;
    ctx.globalAlpha = alpha * Math.sin(phase * Math.PI);
    const cx = px + dx * d;
    const cy = py + dy * d;
    ctx.beginPath();
    // a ">" turned to face the roll
    ctx.moveTo(cx - dx * 4 - dy * 6, cy - dy * 4 - dx * 6);
    ctx.lineTo(cx + dx * 2, cy + dy * 2);
    ctx.lineTo(cx - dx * 4 + dy * 6, cy - dy * 4 + dx * 6);
    ctx.stroke();
  }
  ctx.restore();
}

/** A ghost finger swiping the way the die is about to roll. */
function hand(ctx: CanvasRenderingContext2D, px: number, py: number, dir: Dir, k: number): void {
  const [dx, dy] = DV[dir];
  const e = Math.min(1, Math.max(0, (k - 0.15) / 0.7));
  const ease = 1 - (1 - e) ** 3;
  const a = Math.min(1, k * 4) * (1 - Math.max(0, (k - 0.85) / 0.15));
  const hx = px + 10 + dx * (ease * 34 - 6);
  const hy = py + 14 + dy * (ease * 34 - 6);
  ctx.save();
  ctx.globalAlpha = a;
  // trail
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px + 10 - dx * 6, py + 14 - dy * 6);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  // fingertip
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = 'rgba(30,25,40,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 7, 9, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(hx - 4, hy + 4, 9, 16, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** The die's HP, top left of the view: full hearts, then empty ones. */
function drawHearts(
  ctx: CanvasRenderingContext2D,
  view: Clip['view'],
  hp: number,
  max: number,
): void {
  const x0 = 10 + view[0] * 40 + 14;
  const y0 = 50 + view[1] * 40 + 13;
  for (let n = 0; n < max; n++) {
    ctx.save();
    ctx.globalAlpha = n < hp ? 1 : 0.25;
    drawFace(ctx, 'Heart', x0 + n * 20, y0, 20);
    ctx.restore();
  }
}

function popScale(t: number): number {
  return t < 0.25 ? (t / 0.25) * 1.25 : t < 0.4 ? 1.25 - ((t - 0.25) / 0.15) * 0.25 : 1;
}

function markDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  fill: string,
): void {
  const s = popScale(t);
  ctx.translate(x, y - 26);
  ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function checkMark(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.save();
  markDisc(ctx, x, y, t, '#4caf50');
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-1.5, 5);
  ctx.lineTo(6.5, -5);
  ctx.stroke();
  ctx.restore();
}

function crossMark(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.save();
  markDisc(ctx, x, y, t, '#d9534f');
  ctx.beginPath();
  ctx.moveTo(-5, -5);
  ctx.lineTo(5, 5);
  ctx.moveTo(5, -5);
  ctx.lineTo(-5, 5);
  ctx.stroke();
  ctx.restore();
}
