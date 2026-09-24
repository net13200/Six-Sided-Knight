/** Daily Roll hub: today's date, streak, and start / continue / share. */
import { DAILY_FLOORS, currentStreak, shareText, utcDate } from '../../meta/daily';
import type { Game } from '../game';
import type { Command } from '../input';
import { Run } from '../runs';
import { el, icon, iconButton, place } from '../ui';
import { C } from '../view/palette';
import { drawStar } from './common';
import type { Scene } from './scene';

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
      primary.append(icon('next'), el('span', { text: 'Share result' }));
      primary.dataset.testid = 'daily-share';
      primary.addEventListener('click', () => void this.share(primary));
    } else {
      primary.append(
        icon('play'),
        el('span', {
          text: progress
            ? `Continue floor ${progress.floor}/${DAILY_FLOORS}`
            : 'Start today’s roll',
        }),
      );
      primary.addEventListener('click', () => {
        const run = progress
          ? new Run(this.game, 'daily', progress)
          : Run.newDaily(this.game, this.date);
        if (!progress) this.game.analytics.track('daily_started', { date: this.date });
        void this.start(run, primary);
      });
    }
    ui.append(place(primary, 50, 318, 240, 58));

    if (result) {
      const practice = el('button', {
        className: 'btn',
        testId: 'daily-practice',
        text: 'Practice run',
        onClick: () => void this.start(Run.newDaily(this.game, this.date, true), practice),
      });
      ui.append(place(practice, 80, 386, 180, 46));
    }
    ui.append(
      place(
        iconButton('back', 'Menu', () => this.game.goMenu(), 'back'),
        4,
        415,
        64,
        62,
      ),
      place(
        iconButton(
          'die',
          'Your die',
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
    button.replaceChildren(el('span', { text: 'Carving the dungeon…' }));
    await run.play();
  }

  private async share(button: HTMLButtonElement): Promise<void> {
    const result = this.game.save.data.daily.results[this.date];
    if (!result) return;
    const streak = currentStreak(this.game.save.data, this.date);
    const text = shareText(this.date, result, streak, location.origin + location.pathname);
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
    ctx.fillText('Daily Roll', 170, 52);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${this.date} (UTC) · the same dungeon for everyone`, 170, 80);
    ctx.font = 'italic 12px system-ui, sans-serif';
    ctx.fillText('The Well reshuffles three rooms every dawn, out of habit.', 170, 99);

    drawFlame(ctx, 170, 142, streak > 0);
    ctx.fillStyle = C.text;
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillText(String(streak), 170, 196);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`day streak · best ${save.daily.bestStreak}`, 170, 222);

    ctx.font = '14px system-ui, sans-serif';
    if (result) {
      for (let i = 0; i < DAILY_FLOORS * 3; i++)
        drawStar(ctx, 114 + i * 14, 262, 6, i < result.stars);
      ctx.fillStyle = C.heal;
      ctx.fillText(`Done today: ${result.moves} moves · ${result.hp}/5 HP`, 170, 288);
    } else {
      ctx.fillStyle = C.text;
      ctx.fillText('3 floors · HP carries over · +1 HP per floor', 170, 270);
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
