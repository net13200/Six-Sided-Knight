/** Title screen. "Play" continues where the player left off in one tap. */
import { currentStreak, utcDate } from '../../meta/daily';
import { VERSION_LABEL } from '../../version';
import type { Game } from '../game';
import type { Command } from '../input';
import { el, icon, iconButton, place } from '../ui';
import { drawCrowns } from '../view/art';
import { cameraMatrix, drawCube3d } from '../view/cube';
import { C } from '../view/palette';
import { muteButton } from './common';
import type { Scene } from './scene';

/** The logo die: the starting die in its home orientation. */
const LOGO_DIE = {
  shape: 'd6',
  loadout: ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Coin'],
  orient: 0,
} as const;

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
    if (started) playBtn.classList.add('long');
    const small = (id: string, text: string, onClick: () => void) =>
      el('button', { className: 'btn small', testId: id, text, onClick });
    ui.append(
      place(playBtn, 60, 254, 220, 60),
      place(
        this.modeButton('daily', 'Daily Roll', this.dailyLabel(), () => this.game.goDaily()),
        60,
        320,
        107,
        60,
      ),
      place(
        this.modeButton('depths', 'Depths', this.depthsLabel(), () => this.game.goDepths()),
        173,
        320,
        107,
        60,
      ),
      place(
        small('levels', 'Map', () => this.game.goLevels()),
        74,
        386,
        62,
        60,
      ),
      place(
        small('forge', 'Forge', () => this.game.goForge()),
        139,
        386,
        62,
        60,
      ),
      place(
        small('stats', 'Stats', () => this.game.goStats()),
        204,
        386,
        62,
        60,
      ),
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
    const set = this.game.save.data.settings;
    this.sheet = place(
      el('div', { className: 'sheet settings', testId: 'settings-sheet' }, [
        el('div', { className: 'sheet-title' }, [
          el('h2', { text: 'Settings' }),
          el('small', { className: 'fine', text: VERSION_LABEL }),
        ]),
        toggle('setting-sound', 'Sound', 'Sound effects and music', !this.game.muted, () =>
          this.game.toggleMute(),
        ),
        this.musicSlider(),
        toggle(
          'setting-contrast',
          'High contrast',
          'Brighter text, edges and danger lanes',
          set.highContrast,
          (on) => this.game.setDisplay({ highContrast: on }),
        ),
        toggle(
          'setting-labels',
          'Larger labels',
          'Bigger move labels and hints',
          set.largeLabels,
          (on) => this.game.setDisplay({ largeLabels: on }),
        ),
        toggle(
          'setting-motion',
          'Reduce motion',
          'No shaking, bobbing or pulsing',
          this.game.reducedMotion,
          (on) => this.game.setDisplay({ reduceMotion: on }),
        ),
        toggle(
          'setting-analytics',
          'Play statistics',
          'On this device only; nothing is sent',
          this.game.analyticsEnabled,
          (on) => this.game.setAnalyticsEnabled(on),
        ),
        el('button', {
          className: 'btn',
          testId: 'settings-close',
          text: 'Done',
          onClick: () => this.closeSettings(),
        }),
      ]),
      14,
      12,
      312,
      456,
    );
    this.ui.append(this.sheet);
  }

  /** Music volume: 0 turns the music off. */
  private musicSlider(): HTMLElement {
    const input = el('input', { testId: 'setting-music' });
    input.type = 'range';
    input.id = 'setting-music';
    input.min = '0';
    input.max = '100';
    input.step = '5';
    input.value = String(Math.round(this.game.save.data.settings.musicVolume * 100));
    const value = el('small', { className: 'slider-value' });
    const sync = () => {
      const v = Number(input.value);
      value.textContent = v === 0 ? 'Off' : `${v}%`;
      input.setAttribute('aria-valuetext', v === 0 ? 'Off' : `${v} percent`);
    };
    sync();
    input.addEventListener('input', () => {
      sync();
      this.game.setMusicVolume(Number(input.value) / 100);
    });
    const label = el('label', { className: 'slider' }, [
      el('span', {}, [el('strong', { text: 'Music' }), value]),
      input,
    ]);
    label.htmlFor = 'setting-music';
    return label;
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

    // The logo: a big 3D die (Shield on top, Sword and Key facing you), gently swaying.
    const still = this.game.reducedMotion;
    const bob = still ? 0 : Math.sin(this.t * 2) * 3;
    const yaw = still ? -38 : -38 + Math.sin(this.t * 0.7) * 8;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(170, 238, 44 - bob, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawCube3d(ctx, LOGO_DIE, 170, 184 + bob, 50, cameraMatrix(yaw, -32));

    drawCrowns(ctx, this.game.save.data.wallet.crowns, 330, 18);

    ctx.textAlign = 'center';
    ctx.fillStyle = C.textDim;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(VERSION_LABEL, 170, 466);
  }
}
