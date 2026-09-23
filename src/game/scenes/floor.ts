/** Between floors of a run (and the end of a Daily Roll). */
import { currentStreak, shareText } from '../../meta/daily';
import type { Game } from '../game';
import type { Command } from '../input';
import type { FloorSummary, Run } from '../runs';
import { el, icon, iconButton, place } from '../ui';
import { drawCrownGain, drawFace } from '../view/art';
import { C } from '../view/palette';
import { drawFlame } from './daily';
import { drawStar } from './common';
import type { Scene } from './scene';

export class FloorScene implements Scene {
  readonly name = 'floor';
  private busy = false;

  constructor(
    private readonly game: Game,
    private readonly summary: FloorSummary,
    private readonly run: Run,
  ) {}

  private back(): void {
    if (this.summary.mode === 'daily') this.game.goDaily();
    else this.game.goDepths();
  }

  enter(ui: HTMLElement): void {
    const s = this.summary;
    if (s.final) {
      const share = el('button', { className: 'btn primary', testId: 'floor-share' }, [
        icon('next'),
        el('span', { text: 'Share result' }),
      ]);
      share.addEventListener('click', () => void this.share(share));
      ui.append(
        place(share, 50, 330, 240, 58),
        place(
          iconButton('menu', 'Done', () => this.game.goMenu(), 'floor-done'),
          138,
          404,
          64,
          62,
        ),
      );
      return;
    }
    const next = el('button', { className: 'btn primary', testId: 'floor-next' }, [
      el('span', { text: `Next floor (${s.floor + 1})` }),
      icon('next'),
    ]);
    next.addEventListener('click', () => {
      if (this.busy) return;
      this.busy = true;
      next.disabled = true;
      next.replaceChildren(el('span', { text: 'Carving the dungeon…' }));
      void this.run.play();
    });
    ui.append(
      place(next, 50, 330, 240, 58),
      place(
        iconButton('back', 'Later', () => this.back(), 'floor-back'),
        138,
        404,
        64,
        62,
      ),
    );
  }

  private async share(button: HTMLButtonElement): Promise<void> {
    const s = this.summary;
    const date = this.run.key;
    const text = shareText(
      date,
      { moves: s.moves, hp: s.hp, stars: s.stars },
      currentStreak(this.game.save.data, date),
      location.origin + location.pathname,
    );
    const outcome = await this.game.platform.share({ text, title: 'Six Sided Knight' });
    this.game.analytics.track('share_clicked', { mode: 'daily', result: outcome });
    const label = button.querySelector('span');
    if (label)
      label.textContent =
        outcome === 'copied'
          ? 'Copied to clipboard'
          : outcome === 'shared'
            ? 'Shared!'
            : 'Could not share';
  }

  command(cmd: Command): void {
    if (cmd.type === 'back') this.back();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const s = this.summary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    ctx.font = '800 26px system-ui, sans-serif';
    const title = s.final ? 'Daily Roll complete!' : `Floor ${s.floor} cleared`;
    ctx.fillText(title, 170, 56);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(s.mode === 'daily' ? `Floor ${s.floor} of ${s.floors}` : `The Depths`, 170, 84);

    // HP after the +1 heal (what the next floor starts with).
    const hpNext = s.final ? s.hp : Math.min(5, s.hp + 1);
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = i < hpNext ? 1 : 0.2;
      drawFace(ctx, 'Heart', 110 + i * 30, 132, 22);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.text;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(
      s.final ? `${s.hp}/5 HP left` : `+1 HP · next floor starts at ${hpNext}/5`,
      170,
      162,
    );

    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(
      `${s.moves} moves ${s.final ? 'in total' : 'so far'} · ${s.stars} stars`,
      170,
      200,
    );

    if (s.mode === 'depths') {
      ctx.fillStyle = s.newBest ? C.heal : C.textDim;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(
        s.newBest ? `New best: floor ${s.bestFloor}!` : `Best: floor ${s.bestFloor}`,
        170,
        232,
      );
      if (s.crowns > 0) drawCrownGain(ctx, s.crowns, 170, 262);
    } else if (s.final) {
      for (let i = 0; i < 9; i++) drawStar(ctx, 114 + i * 14, 236, 6, i < s.stars);
      if (s.counted) {
        drawFlame(ctx, 128, 284, true);
        ctx.fillStyle = C.text;
        ctx.font = '800 20px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${s.streak}-day streak`, 154, 286);
        ctx.textAlign = 'center';
        if (s.crowns > 0) drawCrownGain(ctx, s.crowns, 170, 316);
      } else {
        ctx.fillStyle = C.textDim;
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText('Practice run: today’s result was already recorded', 170, 282);
      }
    }
  }
}
