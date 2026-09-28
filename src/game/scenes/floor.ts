/** Between floors of a run, the end of a Daily Roll, and the end of a Depths run. */
import { START_HP, currentStreak, shareText } from '../../meta/daily';
import type { Game } from '../game';
import type { Command } from '../input';
import type { FloorRun, FloorSummary } from '../runs';
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
    private readonly run: FloorRun,
  ) {}

  private back(): void {
    if (this.summary.mode === 'daily') this.game.goDaily();
    else if (this.summary.mode === 'depths') this.game.goDepths();
    else this.game.goLevels();
  }

  enter(ui: HTMLElement): void {
    const s = this.summary;
    if (s.over) {
      ui.append(
        place(
          el('button', {
            className: 'btn primary',
            testId: 'floor-over',
            text: 'Back to the Depths',
            onClick: () => this.game.goDepths(),
          }),
          50,
          330,
          240,
          58,
        ),
        place(
          iconButton('menu', 'Menu', () => this.game.goMenu(), 'floor-done'),
          138,
          404,
          64,
          62,
        ),
      );
      return;
    }
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
    // The Daily Roll uses your current die on each floor: change it between floors.
    if (s.mode === 'daily') {
      ui.append(
        place(
          iconButton(
            'die',
            'Your die',
            () => this.game.goForge(() => this.game.goFloor(s, this.run)),
            'your-die',
          ),
          210,
          404,
          64,
          62,
        ),
      );
    }
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
    if (s.over) {
      renderRunOver(ctx, s);
      return;
    }
    ctx.fillStyle = C.gold;
    ctx.font = '800 26px system-ui, sans-serif';
    const title = s.final ? 'Daily Roll complete!' : `Floor ${s.floor} cleared`;
    ctx.fillText(title, 170, 56);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(
      s.mode === 'depths'
        ? 'The Depths'
        : `${s.mode === 'gauntlet' ? 'Gauntlet · ' : ''}Floor ${s.floor} of ${s.floors}`,
      170,
      84,
    );

    // HP carries over as it is: what's left now is what the next floor starts with.
    for (let i = 0; i < START_HP; i++) {
      ctx.globalAlpha = i < s.hp ? 1 : 0.2;
      drawFace(ctx, 'Heart', 170 + (i - (START_HP - 1) / 2) * 30, 132, 22);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.text;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(
      s.final ? `${s.hp}/${START_HP} HP left` : `Next floor starts at ${s.hp}/${START_HP} HP`,
      170,
      162,
    );

    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(
      s.mode === 'gauntlet'
        ? `${s.moves} moves so far`
        : `${s.moves} moves ${s.final ? 'in total' : 'so far'} · ${s.stars} stars`,
      170,
      200,
    );
    if (s.mode === 'gauntlet') {
      ctx.fillStyle = C.textDim;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('Leaving now means starting the gauntlet over', 170, 232);
    }

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
        if (s.newSkins?.length) {
          ctx.fillStyle = C.heal;
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.fillText(`New skin: ${s.newSkins.map((k) => k.name).join(', ')}!`, 170, 216);
        }
      } else {
        ctx.fillStyle = C.textDim;
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText('Practice run: today’s result was already recorded', 170, 282);
      }
    }
  }
}

/** A Depths run that ended: how deep it got, and the record. */
function renderRunOver(ctx: CanvasRenderingContext2D, s: FloorSummary): void {
  const cleared = s.floor - 1;
  ctx.fillStyle = C.hurt;
  ctx.font = '800 26px system-ui, sans-serif';
  ctx.fillText('Knocked out', 170, 56);
  ctx.fillStyle = C.textDim;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`The Depths · the run ends on floor ${s.floor}`, 170, 84);

  for (let i = 0; i < START_HP; i++) {
    ctx.globalAlpha = 0.2;
    drawFace(ctx, 'Heart', 170 + (i - (START_HP - 1) / 2) * 30, 132, 22);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = C.text;
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText(String(cleared), 170, 196);
  ctx.fillStyle = C.textDim;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(cleared === 1 ? 'floor cleared' : 'floors cleared', 170, 228);

  const record = cleared > 0 && cleared >= s.bestFloor;
  ctx.fillStyle = record ? C.heal : C.textDim;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(record ? 'Your best run!' : `Best: ${s.bestFloor} floors`, 170, 262);
  ctx.fillStyle = C.textDim;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`${s.moves} moves · ${s.stars} stars`, 170, 290);
}
