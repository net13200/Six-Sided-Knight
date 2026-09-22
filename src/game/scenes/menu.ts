/** Title screen. "Play" continues where the player left off in one tap. */
import { currentStreak, utcDate } from '../../meta/daily';
import { totalStars } from '../../meta/progress';
import { VERSION_LABEL } from '../../version';
import type { Game } from '../game';
import type { Command } from '../input';
import { el, icon, iconButton, place } from '../ui';
import { drawBadge, drawDieBody, drawFace } from '../view/art';
import { C } from '../view/palette';
import { muteButton } from './common';
import type { Scene } from './scene';

export class MenuScene implements Scene {
  readonly name = 'menu';
  private t = 0;
  private sheet: HTMLElement | null = null;
  private ui: HTMLElement | null = null;

  constructor(private readonly game: Game) {}

  enter(ui: HTMLElement): void {
    this.ui = ui;
    const next = this.game.continueIndex();
    const started =
      Object.keys(this.game.save.data.levels).length > 0 ||
      this.game.save.data.lastLevelId !== null;
    const playBtn = el(
      'button',
      {
        className: 'btn primary',
        testId: 'play',
        onClick: () => this.game.goPlay(this.game.continueIndex()),
      },
      [icon('play'), el('span', { text: started ? `Continue: level ${next + 1}` : 'Play' })],
    );
    const levelsBtn = el('button', {
      className: 'btn',
      testId: 'levels',
      text: 'Map',
      onClick: () => this.game.goLevels(),
    });
    ui.append(
      place(playBtn, 60, 262, 220, 56),
      place(
        this.modeButton('daily', 'Daily Roll', this.dailyLabel(), () => this.game.goDaily()),
        60,
        328,
        107,
        52,
      ),
      place(
        this.modeButton('depths', 'Depths', this.depthsLabel(), () => this.game.goDepths()),
        173,
        328,
        107,
        52,
      ),
      place(levelsBtn, 90, 388, 160, 40),
      place(
        iconButton('gear', 'Settings', () => this.openSettings(), 'settings'),
        4,
        415,
        64,
        62,
      ),
      place(muteButton(this.game), 272, 415, 64, 62),
    );
  }

  private modeButton(
    id: string,
    title: string,
    sub: string,
    onClick: () => void,
  ): HTMLButtonElement {
    return el('button', { className: 'btn mode', testId: id, onClick }, [
      el('strong', { text: title }),
      el('small', { text: sub }),
    ]);
  }

  private dailyLabel(): string {
    const today = utcDate(this.game.platform.now());
    const streak = currentStreak(this.game.save.data, today);
    if (this.game.save.data.daily.results[today]) return `done · ${streak}-day streak`;
    return streak > 0 ? `${streak}-day streak` : 'new every day';
  }

  private depthsLabel(): string {
    const best = this.game.save.data.depths.bestFloor;
    const run = this.game.save.data.depths.inProgress;
    if (run) return `on floor ${run.floor}`;
    return best > 0 ? `best floor ${best}` : 'endless';
  }

  private openSettings(): void {
    if (this.sheet || !this.ui) return;
    const toggle = (
      id: string,
      label: string,
      hint: string,
      checked: boolean,
      onChange: (on: boolean) => void,
    ) => {
      const input = el('input', { testId: id });
      input.type = 'checkbox';
      input.id = id;
      input.checked = checked;
      input.addEventListener('change', () => onChange(input.checked));
      const lab = el('label', { className: 'toggle' }, [
        input,
        el('span', {}, [el('strong', { text: label }), el('small', { text: hint })]),
      ]);
      lab.htmlFor = id;
      return lab;
    };
    const stats = this.game.save.data.stats;
    this.sheet = place(
      el('div', { className: 'sheet', testId: 'settings-sheet' }, [
        el('h2', { text: 'Settings' }),
        toggle('setting-sound', 'Sound', 'Sound effects', !this.game.muted, () =>
          this.game.toggleMute(),
        ),
        toggle(
          'setting-analytics',
          'Play statistics',
          'Helps tune level difficulty. Stays on this device; nothing is sent anywhere.',
          this.game.analyticsEnabled,
          (on) => this.game.setAnalyticsEnabled(on),
        ),
        el('p', {
          className: 'fine',
          text: `${stats.levelsCompleted} levels cleared · ${totalStars(this.game.save.data)} stars · ${Math.round(stats.playTimeMs / 60000)} min played · ${VERSION_LABEL}`,
        }),
        el('button', {
          className: 'btn',
          testId: 'settings-close',
          text: 'Done',
          onClick: () => this.closeSettings(),
        }),
      ]),
      20,
      90,
      300,
      310,
    );
    this.ui.append(this.sheet);
  }

  private closeSettings(): void {
    this.sheet?.remove();
    this.sheet = null;
  }

  command(cmd: Command): void {
    if (cmd.type === 'back') this.closeSettings();
    if (cmd.type === 'confirm' && !this.sheet) this.game.goPlay(this.game.continueIndex());
  }

  update(dt: number): void {
    this.t += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillText('Six Sided', 170, 52);
    ctx.fillStyle = C.gold;
    ctx.fillText('Knight', 170, 88);
    ctx.fillStyle = C.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('You are the die. Every side is a tool.', 170, 116);

    // A gently bobbing hero die with its faces around it.
    const bob = this.game.reducedMotion ? 0 : Math.sin(this.t * 2) * 4;
    const cx = 170;
    const cy = 186 + bob;
    drawDieBody(ctx, cx, cy, 64, 64);
    drawFace(ctx, 'Shield', cx, cy - 2, 40);
    const around: Array<[string, number, number]> = [
      ['Bomb', 0, -1],
      ['Sword', 1, 0],
      ['Key', 0, 1],
      ['Coin', -1, 0],
    ];
    for (const [face, dx, dy] of around) drawBadge(ctx, face, cx + dx * 52, cy + dy * 52, 13);

    ctx.textAlign = 'center';
    ctx.fillStyle = C.textDim;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(VERSION_LABEL, 170, 446);
  }
}
