/** Daily Roll hub: today's date, streak, and start / continue / share. */
import {
  DAILY_FLOORS,
  START_HP,
  currentStreak,
  dailyTheme,
  shareText,
  themeName,
  utcDate,
} from '../../meta/daily';
import type { Theme } from '../../gen/themes';
import { drawFace } from '../view/art';
import type { Game } from '../game';
import type { Command } from '../input';
import { Run } from '../runs';
import { el, icon, iconButton, place } from '../ui';
import { C } from '../view/palette';
import { drawStar } from './common';
import type { Scene } from './scene';
import { t } from '../../i18n';

/** The face drawn beside each theme's name. */
const THEME_FACE: Record<Theme, string> = {
  keys: 'Key',
  ice: 'Freeze',
  bombs: 'Bomb',
  archers: 'Shield',
  spikes: 'Shield',
  treasure: 'Coin',
  mixed: 'Pip5',
};

export class DailyScene implements Scene {
  readonly name = 'daily';
  private readonly date: string;
  private busy = false;

  constructor(private readonly game: Game) {
    this.date = utcDate(game.platform.now());
  }

  enter(ui: HTMLElement): void {
    this.game.analytics.track('mode_selected', { mode: 'daily' });
    const save = this.game.save.data.daily;
    const result = save.results[this.date];
    const progress = save.inProgress?.key === this.date ? save.inProgress : null;

    const primary = el('button', { className: 'btn primary', testId: 'daily-start' });
    if (result) {
      primary.append(icon('next'), el('span', { text: t('Share result') }));
      primary.dataset.testid = 'daily-share';
      primary.addEventListener('click', () => void this.share(primary));
    } else {
      primary.append(
        icon('play'),
        el('span', {
          text: progress
            ? t('Continue floor {n}/{max}', { n: progress.floor, max: DAILY_FLOORS })
            : t('Start today’s roll'),
        }),
      );
      primary.addEventListener('click', () => {
        const run = progress
          ? new Run(this.game, 'daily', progress)
          : Run.newDaily(this.game, this.date);
        if (!progress) this.game.analytics.track('daily_started', { date: this.date });
        // A new run may start with an ad break; a run in progress never has one.
        if (progress) void this.start(run, primary);
        else this.game.breakThen('daily-start', () => void this.start(run, primary));
      });
    }
    ui.append(place(primary, 50, 318, 240, 58));

    if (result) {
      const practice = el('button', {
        className: 'btn',
        testId: 'daily-practice',
        text: t('Practice run'),
        onClick: () =>
          this.game.breakThen(
            'daily-start',
            () => void this.start(Run.newDaily(this.game, this.date, true), practice),
          ),
      });
      ui.append(place(practice, 80, 386, 180, 46));
    }
    ui.append(
      place(
        iconButton('back', t('Menu'), () => this.game.goMenu(), 'back'),
        4,
        415,
        64,
        62,
      ),
      place(
        iconButton(
          'die',
          t('Your die'),
          () => this.game.goForge(() => this.game.goDaily()),
          'your-die',
        ),
        272,
        415,
        64,
        62,
      ),
    );
  }

  private async start(run: Run, button: HTMLButtonElement): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    button.disabled = true;
    button.replaceChildren(el('span', { text: t('Carving the dungeon…') }));
    await run.play();
  }

  private async share(button: HTMLButtonElement): Promise<void> {
    const result = this.game.save.data.daily.results[this.date];
    if (!result) return;
    const streak = currentStreak(this.game.save.data, this.date);
    const text = shareText(this.date, result, streak, this.game.platform.shareUrl);
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
    if (cmd.type === 'back') this.game.goMenu();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const save = this.game.save.data;
    const streak = currentStreak(save, this.date);
    const result = save.daily.results[this.date];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    ctx.font = '800 28px system-ui, sans-serif';
    ctx.fillText(t('Daily Roll'), 170, 52);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(
      t('{date} (UTC) · the same dungeon for everyone', { date: this.date }),
      170,
      80,
      320,
    );
    const theme = dailyTheme(this.date);
    if (theme) {
      // today's theme, between two of its faces
      ctx.fillStyle = C.gold;
      ctx.font = '700 15px system-ui, sans-serif';
      const name = themeName(theme);
      ctx.fillText(name, 170, 102, 240);
      const w = Math.min(240, ctx.measureText(name).width);
      drawFace(ctx, THEME_FACE[theme], 170 - w / 2 - 14, 102, 18);
      drawFace(ctx, THEME_FACE[theme], 170 + w / 2 + 14, 102, 18);
    } else {
      ctx.font = 'italic 12px system-ui, sans-serif';
      ctx.fillText(t('The Well reshuffles three rooms every dawn, out of habit.'), 170, 99, 320);
    }

    drawFlame(ctx, 170, 142, streak > 0);
    ctx.fillStyle = C.text;
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillText(String(streak), 170, 196);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(t('day streak · best {n}', { n: save.daily.bestStreak }), 170, 222, 320);

    ctx.font = '14px system-ui, sans-serif';
    if (result) {
      for (let i = 0; i < DAILY_FLOORS * 3; i++)
        drawStar(ctx, 114 + i * 14, 262, 6, i < result.stars);
      ctx.fillStyle = C.heal;
      ctx.fillText(
        t('Done today: {moves} moves · {hp}/{max} HP', {
          moves: result.moves,
          hp: result.hp,
          max: START_HP,
        }),
        170,
        288,
        320,
      );
    } else {
      ctx.fillStyle = C.text;
      ctx.fillText(t('3 floors · HP carries over · no healing'), 170, 270, 320);
    }
  }
}

/** A simple procedural flame (the streak icon). */
export function drawFlame(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  lit: boolean,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.bezierCurveTo(18, -8, 22, 6, 16, 16);
  ctx.bezierCurveTo(10, 28, -10, 28, -16, 16);
  ctx.bezierCurveTo(-22, 4, -12, -6, -6, -12);
  ctx.bezierCurveTo(-4, -2, 2, 0, 2, -6);
  ctx.bezierCurveTo(4, -14, 2, -22, 0, -28);
  ctx.closePath();
  ctx.fillStyle = lit ? '#ff9d3a' : '#3a3550';
  ctx.fill();
  ctx.strokeStyle = lit ? '#8a3d0e' : '#5b547a';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (lit) {
    ctx.beginPath();
    ctx.ellipse(0, 12, 7, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd75e';
    ctx.fill();
  }
  ctx.restore();
}
