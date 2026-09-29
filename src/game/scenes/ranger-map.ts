/** The bonus chapter's map: the Greenwood's stages, each opening when the one before is done. */
import { drawOctahedron } from '../../ranger/view';
import type { Game } from '../game';
import type { Command } from '../input';
import { el, iconButton, place } from '../ui';
import { C } from '../view/palette';
import { drawStar } from './common';
import type { Scene } from './scene';

const NODE = 52;

/** Stage nodes along a winding trail. */
function nodePos(i: number): { x: number; y: number } {
  const row = Math.floor(i / 3);
  const col = i % 3;
  const x = row % 2 === 0 ? 70 + col * 100 : 270 - col * 100;
  return { x, y: 196 + row * 84 };
}

export class RangerMapScene implements Scene {
  readonly name = 'ranger-map';
  readonly backdrop = 'forest' as const;
  private t = 0;

  constructor(private readonly game: Game) {}

  private done(i: number): boolean {
    const lv = this.game.rangerLevels[i];
    return !!lv && (this.game.save.data.bonus[lv.id]?.completions ?? 0) > 0;
  }

  private open(i: number): boolean {
    return i === 0 || this.done(i - 1);
  }

  enter(ui: HTMLElement): void {
    this.game.analytics.track('mode_selected', { mode: 'ranger' });
    this.game.rangerLevels.forEach((lv, i) => {
      const p = nodePos(i);
      const open = this.open(i);
      const stars = this.game.save.data.bonus[lv.id]?.stars ?? 0;
      const b = el('button', {
        className: `node${this.done(i) ? ' done' : ''}${open ? '' : ' locked'}`,
        testId: `ranger-${i + 1}`,
        label: open
          ? `Bonus stage ${i + 1}: ${lv.name}${this.done(i) ? `, ${stars} of 3 stars` : ''}`
          : `Bonus stage ${i + 1}, locked`,
        text: open ? String(i + 1) : '',
        onClick: () => open && this.game.goRangerPlay(i),
      });
      b.disabled = !open;
      ui.append(place(b, p.x - NODE / 2, p.y - NODE / 2, NODE, NODE));
    });
    ui.append(
      place(
        iconButton('back', 'Menu', () => this.game.goMenu(), 'back'),
        4,
        415,
        64,
        62,
      ),
    );
  }

  command(cmd: Command): void {
    if (cmd.type === 'back') this.game.goMenu();
  }

  update(dt: number): void {
    this.t += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#12201a';
    ctx.fillRect(0, 0, 340, 480);
    const t = this.game.reducedMotion ? 0 : this.t;
    drawOctahedron(ctx, 170, 70, 30, t);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9cc47a';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillText('The Greenwood', 170, 126);
    ctx.fillStyle = C.textDim;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Bonus chapter · Eight-Sided Ranger', 170, 148);

    const n = this.game.rangerLevels.length;
    // The trail between stages.
    for (let i = 0; i + 1 < n; i++) {
      const a = nodePos(i);
      const b = nodePos(i + 1);
      ctx.strokeStyle = this.done(i) ? 'rgba(156,196,122,0.8)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 6;
      ctx.setLineDash(this.done(i) ? [] : [2, 10]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    this.game.rangerLevels.forEach((lv, i) => {
      const p = nodePos(i);
      const rec = this.game.save.data.bonus[lv.id];
      if (rec)
        for (let s = 0; s < 3; s++) drawStar(ctx, p.x - 14 + s * 14, p.y + 36, 6, s < rec.stars);
    });
  }
}
