/**
 * Story pages: an illustration, a few lines of text, Next / Skip. Used for
 * the intro, chapter cards, the ending, and "Story" on the title screen.
 */
import type { Game } from '../game';
import type { Command } from '../input';
import type { StoryPage } from '../story';
import { el, icon, place } from '../ui';
import { C } from '../view/palette';
import { drawStoryArt } from '../view/story-art';
import type { Scene } from './scene';

export class StoryScene implements Scene {
  readonly name = 'story';
  private page = 0;
  private t = 0;
  private text: HTMLElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;
  private done = false;

  constructor(
    private readonly game: Game,
    private readonly pages: readonly StoryPage[],
    private readonly onDone: () => void,
    /** Label on the last page's button. */
    private readonly finalLabel = 'Continue',
  ) {}

  enter(ui: HTMLElement): void {
    this.text = el('div', { className: 'story-text', testId: 'story-text' });
    this.text.setAttribute('aria-live', 'polite');
    this.nextBtn = el('button', {
      className: 'btn primary',
      testId: 'story-next',
      onClick: () => this.next(),
    });
    const skip = el('button', {
      className: 'btn small story-skip',
      testId: 'story-skip',
      text: 'Skip',
      label: 'Skip the story',
      onClick: () => this.finish(),
    });
    ui.append(
      place(this.text, 24, 282, 292, 116),
      place(this.nextBtn, 70, 412, 200, 56),
      place(skip, 262, 6, 72, 44),
    );
    this.show();
    this.nextBtn.focus();
  }

  private show(): void {
    const p = this.pages[this.page]!;
    this.t = 0;
    const last = this.page === this.pages.length - 1;
    this.text!.replaceChildren(
      ...(p.title ? [el('strong', { text: p.title })] : []),
      el('p', { text: p.text }),
    );
    this.nextBtn!.replaceChildren(
      el('span', { text: last ? this.finalLabel : 'Next' }),
      icon(last ? 'play' : 'next'),
    );
  }

  private next(): void {
    if (this.page + 1 < this.pages.length) {
      this.page++;
      this.show();
    } else {
      this.finish();
    }
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.onDone();
  }

  command(cmd: Command): void {
    if (cmd.type === 'confirm' || cmd.type === 'tap') this.next();
    else if (cmd.type === 'move' && cmd.dir === 'E') this.next();
    else if (cmd.type === 'move' && cmd.dir === 'W' && this.page > 0) {
      this.page--;
      this.show();
    } else if (cmd.type === 'back') this.finish();
  }

  update(dt: number): void {
    this.t += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const p = this.pages[this.page]!;
    const still = this.game.reducedMotion;
    const fade = still ? 1 : Math.min(1, this.t * 3);
    ctx.save();
    ctx.globalAlpha = fade;
    drawStoryArt(ctx, this.game.rules, p, 170, 160, this.t, still);
    ctx.restore();
    // Page dots.
    if (this.pages.length > 1) {
      const n = this.pages.length;
      const gap = Math.min(14, 260 / n);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i === this.page ? C.gold : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(170 + (i - (n - 1) / 2) * gap, 402, i === this.page ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
