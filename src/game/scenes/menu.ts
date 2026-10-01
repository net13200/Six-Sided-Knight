/** Title screen. "Play" continues where the player left off in one tap. */
import { currentStreak, utcDate } from '../../meta/daily';
import { VERSION_LABEL } from '../../version';
import type { Game } from '../game';
import type { Command } from '../input';
import { el, icon, iconButton, place } from '../ui';
import { drawCrowns } from '../view/art';
import { cameraMatrix, drawCube3d } from '../view/cube';
import { C } from '../view/palette';
import { HOW_TO_PLAY } from '../how-to-play';
import { muteButton } from './common';
import type { Scene } from './scene';
import { detectLang, LANGS, langName, t, tn } from '../../i18n';

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

  constructor(
    private readonly game: Game,
    /** Open with the settings up (after switching language). */
    private readonly opts: { settings?: boolean } = {},
  ) {}

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
        onClick: () => {
          // No ad here: the title screen's Play is navigation (portal ad rules).
          this.game.goPlay(this.game.continueIndex());
        },
      },
      [
        icon('play'),
        el('span', { text: started ? t('Continue: level {n}', { n: next + 1 }) : t('Play') }),
      ],
    );
    if (started) playBtn.classList.add('long');
    const small = (id: string, text: string, onClick: () => void) =>
      el('button', { className: 'btn small', testId: id, text, onClick });
    ui.append(
      place(playBtn, 60, 254, 220, 60),
      place(
        this.modeButton('daily', t('Daily Roll'), this.dailyLabel(), () => this.game.goDaily()),
        60,
        320,
        107,
        60,
      ),
      place(
        this.modeButton('depths', t('Depths'), this.depthsLabel(), () => this.game.goDepths()),
        173,
        320,
        107,
        60,
      ),
      ...this.smallButtons(small),
      place(
        iconButton('book', t('Story'), () => this.game.goStorySoFar(), 'story'),
        4,
        4,
        64,
        62,
      ),
      place(
        iconButton('gear', t('Settings'), () => this.openSettings(), 'settings'),
        4,
        415,
        64,
        62,
      ),
      place(muteButton(this.game), 272, 415, 64, 62),
    );
    if (this.opts.settings) this.openSettings();
    // Once, after an update that rebuilt the campaign.
    else if (this.game.save.data.campaignResetNotice) this.openCampaignNotice();
    // Once, after an update that changed levels the player had beaten.
    else if (this.game.save.data.changedLevelsNotice > 0) this.openChangedNotice();
    // A text reference for players who have finished the tutorial.
    if (this.game.tutorialDone) {
      ui.append(
        place(
          iconButton('help', t('Help'), () => this.openHowTo(), 'how-to'),
          272,
          34,
          64,
          62,
        ),
      );
    }
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
    if (this.game.save.data.daily.results[today]) return t('done · {n}-day streak', { n: streak });
    return streak > 0 ? t('{n}-day streak', { n: streak }) : t('new every day');
  }

  /** Map, Smith, Stats, and the bonus chapter once the campaign is beaten. */
  private smallButtons(
    small: (id: string, text: string, onClick: () => void) => HTMLButtonElement,
  ): HTMLElement[] {
    const buttons = [
      small('levels', t('Map'), () => this.game.goLevels()),
      small('forge', t('Smith'), () => this.game.goForge()),
      small('stats', t('Stats'), () => this.game.goStats()),
    ];
    if (this.game.bonusUnlocked) {
      const b = small('bonus', t('Bonus'), () => this.game.goRangerMap());
      b.classList.add('bonus-btn');
      buttons.push(b);
    }
    const left = 170 - (buttons.length * 65 - 3) / 2;
    return buttons.map((b, i) => place(b, left + i * 65, 386, 62, 60));
  }

  private depthsLabel(): string {
    const best = this.game.save.data.depths.bestFloor;
    const run = this.game.save.data.depths.inProgress;
    if (run) return t('on floor {n}', { n: run.floor });
    return best > 0 ? t('best {n} floors', { n: best }) : t('one life, endless');
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
          el('h2', { text: t('Settings') }),
          el('small', { className: 'fine', text: VERSION_LABEL }),
        ]),
        // Scrolls if it doesn't fit (long languages, large text); Done stays in view.
        el('div', { className: 'settings-body' }, [
          toggle('setting-sound', t('Sound'), t('Sound effects and music'), !this.game.muted, () =>
            this.game.toggleMute(),
          ),
          this.musicSlider(),
          this.languagePicker(),
          toggle(
            'setting-contrast',
            t('High contrast'),
            t('Brighter text, edges and danger lanes'),
            set.highContrast,
            (on) => this.game.setDisplay({ highContrast: on }),
          ),
          toggle(
            'setting-labels',
            t('Larger labels'),
            t('Bigger move labels and hints'),
            set.largeLabels,
            (on) => this.game.setDisplay({ largeLabels: on }),
          ),
          toggle(
            'setting-motion',
            t('Reduce motion'),
            t('No shaking, bobbing or pulsing'),
            this.game.reducedMotion,
            (on) => this.game.setDisplay({ reduceMotion: on }),
          ),
          toggle(
            'setting-analytics',
            t('Play statistics'),
            t('On this device only; nothing is sent'),
            this.game.analyticsEnabled,
            (on) => this.game.setAnalyticsEnabled(on),
          ),
        ]),
        el('button', {
          className: 'btn',
          testId: 'settings-close',
          text: t('Done'),
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

  /** Explains, once, that some levels the player had beaten have changed. */
  private openChangedNotice(): void {
    if (this.sheet || !this.ui) return;
    const n = this.game.save.data.changedLevelsNotice;
    this.game.save.update((d) => (d.changedLevelsNotice = 0));
    this.sheet = place(
      el('div', { className: 'sheet', testId: 'changed-notice' }, [
        el('h2', { text: tn(n, 'A level has changed', '{n} levels have changed') }),
        el('p', {
          text: tn(
            n,
            "One level you beat has been redesigned. It's marked NEW on the map: solve it again to earn the stars back.",
            "{n} levels you beat have been redesigned. They're marked NEW on the map: solve them again to earn the stars back.",
          ),
        }),
        el('p', { text: t('Every level after them stays open, and your skins stay unlocked.') }),
        el('button', {
          className: 'btn primary',
          testId: 'changed-notice-ok',
          text: t("Let's roll"),
          onClick: () => this.closeSettings(),
        }),
      ]),
      24,
      120,
      292,
      0,
    );
    this.sheet.style.height = 'auto';
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-modal', 'true');
    this.ui.append(this.sheet);
    this.sheet.querySelector('button')?.focus();
  }

  /** Explains, once, that the campaign was rebuilt and progress starts fresh. */
  private openCampaignNotice(): void {
    if (this.sheet || !this.ui) return;
    // Shown once, however it's closed.
    this.game.save.update((d) => (d.campaignResetNotice = false));
    const ok = () => this.closeSettings();
    this.sheet = place(
      el('div', { className: 'sheet', testId: 'campaign-notice' }, [
        el('h2', { text: t('A new campaign') }),
        el('p', {
          text: t(
            'Every level has been rebuilt: 3 HP, stars for moves, and each level about its own idea. So the campaign starts fresh.',
          ),
        }),
        el('p', {
          text: t(
            'Your crowns, faces, custom die, skins, Daily streak and Depths record are all kept.',
          ),
        }),
        el('button', {
          className: 'btn primary',
          testId: 'campaign-notice-ok',
          text: t("Let's roll"),
          onClick: ok,
        }),
      ]),
      24,
      120,
      292,
      0,
    );
    this.sheet.style.height = 'auto';
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-modal', 'true');
    this.ui.append(this.sheet);
    this.sheet.querySelector('button')?.focus();
  }

  /** "How to play": the rules as plain text. */
  private openHowTo(): void {
    if (this.sheet || !this.ui) return;
    const body = el(
      'div',
      { className: 'how-to-body' },
      HOW_TO_PLAY.flatMap((sec) => [
        el('h3', { text: t(sec.heading) }),
        ...sec.lines.map((line) => el('p', { text: t(line) })),
      ]),
    );
    body.tabIndex = 0;
    body.setAttribute('aria-label', t('How to play'));
    this.sheet = place(
      el('div', { className: 'sheet how-to', testId: 'how-to-sheet' }, [
        el('h2', { text: t('How to play') }),
        body,
        el('button', {
          className: 'btn',
          testId: 'how-to-close',
          text: t('Done'),
          onClick: () => this.closeSettings(),
        }),
      ]),
      14,
      12,
      312,
      456,
    );
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-modal', 'true');
    this.ui.append(this.sheet);
    body.focus();
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
      value.textContent = v === 0 ? t('Off') : `${v}%`;
      input.setAttribute('aria-valuetext', v === 0 ? t('Off') : t('{n} percent', { n: v }));
    };
    sync();
    input.addEventListener('input', () => {
      sync();
      this.game.setMusicVolume(Number(input.value) / 100);
    });
    const label = el('label', { className: 'slider' }, [
      el('span', {}, [el('strong', { text: t('Music') }), value]),
      input,
    ]);
    label.htmlFor = 'setting-music';
    return label;
  }

  /** Language: a list of the languages, "Automatic" follows the browser. */
  private languagePicker(): HTMLElement {
    const select = el('select', { testId: 'setting-lang' });
    select.id = 'setting-lang';
    const saved = this.game.save.data.settings.lang ?? '';
    const auto = el('option', { text: t('Automatic ({lang})', { lang: langName(detectLang()) }) });
    auto.value = '';
    select.append(
      auto,
      ...LANGS.map((l) => {
        const o = el('option', { text: l.name });
        o.value = l.id;
        return o;
      }),
    );
    select.value = saved;
    select.addEventListener('change', () => this.game.setLanguage(select.value || null));
    const label = el('label', { className: 'lang-row' }, [
      el('strong', { text: t('Language') }),
      select,
    ]);
    label.htmlFor = 'setting-lang';
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
    ctx.fillText(t('You are the die. Every side is a tool.'), 170, 116, 320);

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
