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
import { t } from '../../i18n';

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
            text: t('Back to the Depths'),
            onClick: () => this.game.goDepths(),
          }),
          50,
          330,
          240,
          58,
        ),
        place(
          iconButton('menu', t('Menu'), () => this.game.goMenu(), 'floor-done'),
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
        el('span', { text: t('Share result') }),
      ]);
      share.addEventListener('click', () => void this.share(share));
      ui.append(
        place(share, 50, 330, 240, 58),
        place(
          iconButton('menu', t('Done'), () => this.game.goMenu(), 'floor-done'),
          138,
          404,
          64,
          62,
        ),
      );
      return;
    }
    const next = el('button', { className: 'btn primary', testId: 'floor-next' }, [
      el('span', { text: t('Next floor ({n})', { n: s.floor + 1 }) }),
      icon('next'),
    ]);
    next.addEventListener('click', () => {
      if (this.busy) return;
      this.busy = true;
      next.disabled = true;
      next.replaceChildren(el('span', { text: t('Carving the dungeon…') }));
      void this.run.play();
    });
    ui.append(
      place(next, 50, 330, 240, 58),
      place(
        iconButton('back', t('Later'), () => this.back(), 'floor-back'),
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
            t('Your die'),
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
      this.game.platform.shareUrl,
    );
    const outcome = await this.game.platform.share({ text, title: 'Six Sided Knight' });
    this.game.analytics.track('share_clicked', { mode: 'daily', result: outcome });
    const label = button.querySelector('span');
    if (label)
      label.textContent =
        outcome === 'copied'
          ? t('Copied to clipboard')
          : outcome === 'shared'
            ? t('Shared!')
            : t('Could not share');
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
    const title = s.final ? t('Daily Roll complete!') : t('Floor {n} cleared', { n: s.floor });
    ctx.fillText(title, 170, 56, 320);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(
      s.mode === 'depths'
        ? t('The Depths')
        : t(s.mode === 'gauntlet' ? 'Gauntlet · floor {n} of {max}' : 'Floor {n} of {max}', {
            n: s.floor,
            max: s.floors ?? 0,
          }),
      170,
      84,
      320,
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
      t(s.final ? '{hp}/{max} HP left' : 'Next floor starts at {hp}/{max} HP', {
        hp: s.hp,
        max: START_HP,
      }),
      170,
      162,
      320,
    );

    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(
      s.mode === 'gauntlet'
        ? t('{n} moves so far', { n: s.moves })
        : t(s.final ? '{n} moves in total · {stars} stars' : '{n} moves so far · {stars} stars', {
            n: s.moves,
            stars: s.stars,
          }),
      170,
      200,
      320,
    );
    if (s.mode === 'gauntlet') {
      ctx.fillStyle = C.textDim;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(t('Leaving now means starting the gauntlet over'), 170, 232, 320);
    }

    if (s.mode === 'depths') {
      ctx.fillStyle = s.newBest ? C.heal : C.textDim;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(
        t(s.newBest ? 'New best: floor {n}!' : 'Best: floor {n}', { n: s.bestFloor }),
        170,
        232,
        320,
      );
      if (s.crowns > 0) drawCrownGain(ctx, s.crowns, 170, 262);
    } else if (s.final) {
      for (let i = 0; i < 9; i++) drawStar(ctx, 114 + i * 14, 236, 6, i < s.stars);
      if (s.counted) {
        drawFlame(ctx, 128, 284, true);
        ctx.fillStyle = C.text;
        ctx.font = '800 20px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(t('{n}-day streak', { n: s.streak }), 154, 286, 170);
        ctx.textAlign = 'center';
        if (s.crowns > 0) drawCrownGain(ctx, s.crowns, 170, 316);
        if (s.newSkins?.length) {
          ctx.fillStyle = C.heal;
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.fillText(
            t('New skin: {names}!', { names: s.newSkins.map((k) => t(k.name)).join(', ') }),
            170,
            216,
            320,
          );
        }
      } else {
        ctx.fillStyle = C.textDim;
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(t('Practice run: today’s result was already recorded'), 170, 282, 320);
      }
    }
  }
}

/** A Depths run that ended: how deep it got, and the record. */
function renderRunOver(ctx: CanvasRenderingContext2D, s: FloorSummary): void {
  const cleared = s.floor - 1;
  ctx.fillStyle = C.hurt;
  ctx.font = '800 26px system-ui, sans-serif';
  ctx.fillText(t('Knocked out'), 170, 56, 320);
  ctx.fillStyle = C.textDim;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(t('The Depths · the run ends on floor {n}', { n: s.floor }), 170, 84, 320);

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
  ctx.fillText(t(cleared === 1 ? 'floor cleared' : 'floors cleared'), 170, 228, 320);

  const record = cleared > 0 && cleared >= s.bestFloor;
  ctx.fillStyle = record ? C.heal : C.textDim;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(
    record ? t('Your best run!') : t('Best: {n} floors', { n: s.bestFloor }),
    170,
    262,
    320,
  );
  ctx.fillStyle = C.textDim;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(t('{n} moves · {stars} stars', { n: s.moves, stars: s.stars }), 170, 290, 320);
}
