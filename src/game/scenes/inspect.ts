/**
 * Inspect view: a large 3D die you can drag to spin, all six faces, and a
 * preview of each possible roll (computed with the real rules, so it is
 * always right). Nothing happens in the game until the player closes this
 * and swipes. Opened by tapping the die or the compass (or pressing I).
 */
import { DIR_DELTA, rollDie, type Dir, type GameState } from '../../engine';
import type { Game } from '../game';
import type { Command } from '../input';
import { el, icon, place } from '../ui';
import { drawFace } from '../view/art';
import { cameraMatrix, drawCube3d, facesOf, IDENTITY, rollRotation } from '../view/cube';
import { ease } from '../view/fx';
import { predictOutcome, type Outcome } from '../view/outcome';
import { C } from '../view/palette';
import { roleColor } from '../view/roles';

const CX = 170;
const CY = 196;
const CUBE = 100;
const DIR_NAME: Record<Dir, string> = { N: 'north', E: 'east', S: 'south', W: 'west' };
const PREVIEW_SECONDS = 0.35;

export class InspectView {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly arrows = new Map<Dir, HTMLButtonElement>();
  private yaw = -28;
  private pitch = -38;
  private preview: { dir: Dir; outcome: Outcome; start: number } | null = null;
  private raf = 0;
  private drag: { id: number; x: number; y: number; moved: number } | null = null;

  constructor(
    private readonly game: Game,
    private readonly state: GameState,
    private readonly onClose: () => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'inspect-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Your die in 3D. Drag to spin it.');
    const k = game.stage.pixelRatio;
    this.canvas.width = Math.round(340 * k);
    this.canvas.height = Math.round(480 * k);
    this.ctx = this.canvas.getContext('2d')!;

    const close = el(
      'button',
      {
        className: 'icon-btn',
        testId: 'inspect-close',
        label: 'Close',
        onClick: () => this.close(),
      },
      [icon('close'), el('span', { text: 'Close' })],
    );

    this.root = el('div', { className: 'inspect', testId: 'inspect' }, [this.canvas]);
    place(this.root, 0, 0, 340, 480);
    this.root.append(place(close, 280, 6, 54, 50));
    for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
      const b = el('button', {
        className: 'inspect-arrow',
        testId: `inspect-${d}`,
        label: `Preview rolling ${DIR_NAME[d]}`,
        onClick: () => this.showPreview(d),
      });
      b.style.setProperty('--rot', `${Math.atan2(DIR_DELTA[d].dy, DIR_DELTA[d].dx)}rad`);
      const { dx, dy } = DIR_DELTA[d];
      this.root.append(place(b, CX + dx * 118 - 22, CY + dy * 112 - 22, 44, 44));
      this.arrows.set(d, b);
    }
    this.bindDrag();
  }

  open(ui: HTMLElement): void {
    ui.append(this.root);
    this.game.analytics.track('inspect_opened', { level: this.state.levelId });
    this.game.audio.play('click');
    this.draw();
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    this.root.remove();
    this.onClose();
  }

  /** Keyboard / game commands while open: arrows preview, back closes. */
  command(cmd: Command): void {
    if (cmd.type === 'move') this.showPreview(cmd.dir);
    else if (cmd.type === 'back' || cmd.type === 'confirm' || cmd.type === 'inspect') this.close();
  }

  private showPreview(dir: Dir): void {
    this.preview = {
      dir,
      outcome: predictOutcome(this.game.rules, this.state, dir),
      start: performance.now(),
    };
    for (const [d, b] of this.arrows) b.classList.toggle('active', d === dir);
    this.root.dataset.preview = dir;
    this.game.audio.play('click');
    this.animate();
  }

  private animate(): void {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      this.draw();
      if (this.progress() < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private progress(): number {
    if (!this.preview || this.game.reducedMotion) return 1;
    return Math.min(1, (performance.now() - this.preview.start) / 1000 / PREVIEW_SECONDS);
  }

  private bindDrag(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      c.setPointerCapture?.(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      const k = this.game.stage.scale;
      this.yaw -= (dx / k) * 0.7;
      this.pitch = Math.max(-85, Math.min(-8, this.pitch - (dy / k) * 0.5));
      this.draw();
    });
    c.addEventListener('pointerup', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const tap = this.drag.moved < 8;
      this.drag = null;
      if (!tap) return;
      // A tap away from the die and the panel closes the view.
      const p = this.game.stage.toLogical(e.clientX, e.clientY);
      const onCube = Math.hypot(p.x - CX, p.y - CY) < CUBE * 1.1;
      const onPanel = p.y > 340 && p.y < 450;
      if (!onCube && !onPanel) this.close();
    });
  }

  private draw(): void {
    const ctx = this.ctx;
    const k = this.game.stage.pixelRatio;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, 340, 480);
    ctx.fillStyle = 'rgba(8,6,12,0.95)';
    ctx.fillRect(0, 0, 340, 480);

    const s = this.state;
    const pv = this.preview;
    const t = ease.inOut(this.progress());
    label(ctx, pv ? `Preview: roll ${DIR_NAME[pv.dir]}` : 'Your die', CX, 34, C.gold, 18, 800);
    label(
      ctx,
      pv ? 'Just a preview: nothing moves yet' : 'Drag to spin · arrows preview a roll',
      CX,
      58,
      C.textDim,
      12,
    );

    const camera = cameraMatrix(this.yaw, this.pitch);
    const rolls =
      pv && (pv.outcome.after.player.x !== s.player.x || pv.outcome.after.player.y !== s.player.y);
    const model = pv && rolls ? rollRotation(pv.dir, t) : IDENTITY;
    drawCube3d(
      ctx,
      s.player.die,
      CX,
      CY,
      CUBE,
      camera,
      model,
      pv && rolls && t >= 1 ? 'top' : null,
    );

    // Panel
    ctx.fillStyle = '#1d1a28';
    ctx.beginPath();
    ctx.roundRect(20, 346, 300, 100, 14);
    ctx.fill();
    ctx.strokeStyle = '#3a3550';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (pv) this.drawPreviewPanel(ctx, pv.dir, pv.outcome);
    else this.drawFacesPanel(ctx);
    label(ctx, 'Tap outside the die to close', CX, 464, C.textDim, 11);
  }

  private drawFacesPanel(ctx: CanvasRenderingContext2D): void {
    const f = facesOf(this.state.player.die);
    label(ctx, 'All six faces', CX, 366, C.text, 14, 700);
    (['top', 'north', 'east', 'south', 'west', 'bottom'] as const).forEach((slot, i) => {
      const x = 45 + i * 50;
      ctx.beginPath();
      ctx.roundRect(x - 17, 380, 34, 34, 6);
      ctx.fillStyle = roleColor(f[slot] ?? '');
      ctx.fill();
      drawFace(ctx, f[slot] ?? '', x, 397, 24);
      label(ctx, slot, x, 427, C.textDim, 9);
    });
  }

  private drawPreviewPanel(ctx: CanvasRenderingContext2D, dir: Dir, o: Outcome): void {
    const color =
      o.kind === 'kill' || o.kind === 'hurt'
        ? C.hurt
        : o.kind === 'open' || o.kind === 'win'
          ? C.gold
          : o.kind === 'heal' || o.kind === 'unlock'
            ? C.heal
            : o.kind === 'blocked' || o.kind === 'clunk'
              ? C.textDim
              : C.text;
    label(ctx, o.text, CX, 366, color, 14, 700);
    if (o.then) label(ctx, o.then, CX, 386, o.kind === 'blocked' ? C.textDim : C.hurt, 11, 600);
    const next =
      o.after === this.state ? this.state.player.die : rollDie(this.state.player.die, dir);
    const moved =
      o.after.player.x !== this.state.player.x || o.after.player.y !== this.state.player.y;
    const f = facesOf(moved ? next : this.state.player.die);
    const y = o.then ? 418 : 412;
    for (const [i, [name, face]] of (
      [
        ['Top', f.top],
        ['Bottom', f.bottom],
      ] as const
    ).entries()) {
      const x = 58 + i * 120;
      ctx.beginPath();
      ctx.roundRect(x - 15, y - 15, 30, 30, 6);
      ctx.fillStyle = roleColor(face ?? '');
      ctx.fill();
      drawFace(ctx, face ?? '', x, y, 22);
      ctx.textAlign = 'left';
      ctx.fillStyle = C.textDim;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(name, x + 21, y - 6);
      ctx.fillStyle = C.text;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(face ?? '', x + 21, y + 8);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = C.textDim;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('HP after', 264, y - 6);
    ctx.fillStyle = o.after.player.hp < this.state.player.hp ? C.hurt : C.text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${o.after.player.hp}/${o.after.player.maxHp}`, 264, y + 8);
  }
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  weight = 400,
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}
