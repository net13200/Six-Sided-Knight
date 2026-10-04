/**
 * Review page for lesson clips: each mechanic shown as a short looping clip
 * on the game's own board, with a ghost hand, a glow on the face that
 * matters and a check mark when it works. No text in the clips.
 */
import { defaultRules } from '../../src/content/register';
import {
  createState,
  parseTextLevel,
  step,
  type Dir,
  type GameEvent,
  type GameState,
  type Pos,
} from '../../src/engine';
import { drawBoard } from '../../src/game/view/board';
import { Fx } from '../../src/game/view/fx';
import { animateTurn } from '../../src/game/view/animate';
import { tileCenter } from '../../src/game/view/layout';
import { facesOf } from '../../src/game/view/cube';
import { drawFace } from '../../src/game/view/art';
import type { Audio } from '../../src/game/audio';
import { CLIPS, type Clip } from './clips';

const rules = defaultRules();
const SILENT = { play() {} } as unknown as Audio;
const DV: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const R = 28; // the die's half-size on the board, as drawn by the game

type Phase = 'wait' | 'focus' | 'hand' | 'roll' | 'hold' | 'fade';

const FOCUS_TIME = 1.2;

class Player {
  private state!: GameState;
  private fx!: Fx;
  private i = 0;
  private phase: Phase = 'wait';
  private t = 0;
  private check: { x: number; y: number; t: number } | null = null;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly clip: Clip,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.reset();
  }

  private reset(): void {
    this.state = createState(rules, parseTextLevel(this.clip.level));
    this.fx = new Fx();
    this.i = 0;
    this.phase = 'wait';
    this.t = 0;
    this.check = null;
  }

  private go(phase: Phase): void {
    this.phase = phase;
    this.t = 0;
  }

  update(dt: number): void {
    this.t += dt;
    this.fx.update(dt);
    if (this.check) this.check.t += dt;
    const c = this.clip;
    switch (this.phase) {
      case 'wait':
        if (this.t > 0.7) this.go(this.i < c.moves.length ? this.beforeRoll() : 'hold');
        break;
      case 'focus':
        // the side that matters lights up first, before any swipe
        if (this.t > FOCUS_TIME) this.go('hand');
        break;
      case 'hand':
        if (this.t > 0.75) this.roll();
        break;
      case 'roll':
        if (!this.fx.busy && this.t > 0.35) {
          if (c.check.after === this.i) this.check ??= { ...this.checkSpot(), t: 0 };
          this.i++;
          this.go(
            this.i < c.moves.length
              ? c.check.after === this.i - 1
                ? 'wait'
                : this.beforeRoll()
              : 'hold',
          );
        }
        break;
      case 'hold':
        if (this.t > 1.3) this.go('fade');
        break;
      case 'fade':
        if (this.t > 0.45) this.reset();
        break;
    }
  }

  /** A move that matters gets its side highlighted first. */
  private beforeRoll(): Phase {
    return this.clip.focus?.move === this.i ? 'focus' : 'hand';
  }

  private lastEvents: readonly GameEvent[] = [];
  private roll(): void {
    const dir = this.clip.moves[this.i]!;
    const before = this.state;
    const res = step(rules, before, { type: 'move', dir });
    this.state = res.state;
    this.lastEvents = res.events;
    animateTurn(this.fx, SILENT, res.events, before, res.state);
    this.go('roll');
  }

  /** Where the check mark pops: on the thing that happened, or on the die. */
  private checkSpot(): { x: number; y: number } {
    let at: Pos = { x: this.state.player.x, y: this.state.player.y };
    if (this.clip.check.at === 'event') {
      const e = this.lastEvents.find(
        (q) => q.type === 'killed' || q.type === 'unlocked' || q.type === 'opened',
      );
      if (e && 'at' in e) at = e.at;
      // all three fell: put it in the middle of them
      const kills = this.lastEvents.filter((q) => q.type === 'killed');
      if (kills.length > 1) {
        const xs = kills.map((q) => (q.type === 'killed' ? q.at.x : 0));
        at = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: at.y };
      }
    }
    const c = tileCenter(at.x, at.y);
    return { x: c.x, y: c.y };
  }

  draw(): void {
    const { ctx, canvas, clip } = this;
    const [vx, vy, vw] = clip.view;
    const x0 = 10 + vx * 40;
    const y0 = 50 + vy * 40;
    const k = canvas.width / (vw * 40);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#14121c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    drawBoard(ctx, rules, this.state, this.fx.compute(), this.fx);
    const v = this.fx.compute();
    const p = tileCenter(this.state.player.x, this.state.player.y);
    const px = p.x + v.player.dx;
    const py = p.y + v.player.dy;
    const pulse = 0.6 + Math.sin(this.fx.time * 8) * 0.4;
    const f = clip.focus;
    if (f && f.move === this.i) {
      if (this.phase === 'focus' || this.phase === 'hand') {
        // before the roll: the face that will act, on the die and as a badge beside it
        const side = f.kind === 'top' ? 'top' : 'lead';
        const appear = this.phase === 'focus' ? Math.min(1, this.t / 0.3) : 1;
        this.glow(side, px, py, pulse, appear);
        if (side === 'top') this.badge(px, py, pulse, appear);
        else this.chevrons(px, py, appear);
      } else if (this.phase === 'roll') {
        // during the roll: where it ends up (under the die, or still on top)
        if (f.kind !== 'lead') this.glow(f.kind, px, py, pulse, 1);
      }
    }
    if (this.phase === 'hand') this.hand(px, py, clip.moves[this.i]!, this.t / 0.75);
    if (this.check) this.checkMark(this.check.x, this.check.y, this.check.t);
    if (this.phase === 'fade') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(20,18,28,${Math.min(1, this.t / 0.45)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (this.phase === 'wait' && this.i === 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(20,18,28,${Math.max(0, 1 - this.t / 0.35)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  /** A gold glow on the face that matters. */
  private glow(
    kind: 'lead' | 'bottom' | 'top',
    px: number,
    py: number,
    pulse: number,
    alpha: number,
  ): void {
    const ctx = this.ctx;
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
      const [dx, dy] = DV[this.clip.moves[this.clip.focus!.move]!];
      if (dx) {
        ctx.moveTo(px + dx * (R + 1), py - R + 6);
        ctx.lineTo(px + dx * (R + 1), py + R - 2);
      } else {
        ctx.moveTo(px - R + 6, py + dy * (R + 1));
        ctx.lineTo(px + R - 6, py + dy * (R + 1));
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The face that will act, enlarged in a badge just outside its side of the die. */
  private badge(px: number, py: number, pulse: number, alpha: number): void {
    const ctx = this.ctx;
    const name = facesOf(this.state.player.die).top;
    const bx = px;
    const by = py - R - 24;
    const s = (0.8 + alpha * 0.2) * (1 + pulse * 0.06);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(bx, by);
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
    drawFace(ctx, name ?? '', 0, 0, 20);
    ctx.restore();
  }

  /** Chevrons running out of the lit side, the way it will roll. */
  private chevrons(px: number, py: number, alpha: number): void {
    const ctx = this.ctx;
    const [dx, dy] = DV[this.clip.moves[this.i]!];
    const t = this.fx.time;
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
  private hand(px: number, py: number, dir: Dir, k: number): void {
    const ctx = this.ctx;
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

  private checkMark(x: number, y: number, t: number): void {
    const ctx = this.ctx;
    const s = t < 0.25 ? (t / 0.25) * 1.25 : t < 0.4 ? 1.25 - ((t - 0.25) / 0.15) * 0.25 : 1;
    ctx.save();
    ctx.translate(x, y - 26);
    ctx.scale(s, s);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#4caf50';
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
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-1.5, 5);
    ctx.lineTo(6.5, -5);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------- the page ----------

const list = document.getElementById('clips')!;
const players: Player[] = [];
for (const clip of CLIPS) {
  const card = document.createElement('figure');
  const canvas = document.createElement('canvas');
  const [, , vw, vh] = clip.view;
  const cssW = 320;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(((cssW * vh) / vw) * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.aspectRatio = `${vw} / ${vh}`;
  const cap = document.createElement('figcaption');
  cap.textContent = clip.name;
  card.append(canvas, cap);
  list.append(card);
  players.push(new Player(clip, canvas));
}

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const p of players) {
    p.update(dt);
    p.draw();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
(window as unknown as { __ready: boolean }).__ready = true;
