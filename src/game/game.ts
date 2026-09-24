/**
 * Owns the shared services (rules, levels, stage, audio, save, analytics,
 * platform) and the scene state machine. Scenes are created through the
 * go* methods.
 */
import { defaultRules } from '../content/register';
import type { GameState, LevelData, Rules } from '../engine';
import { loadCampaign, loadGauntletFloors } from '../levels/campaign';
import { LevelService } from '../gen/service';
import { LocalAnalytics } from '../meta/analytics';
import { continueIndex, recordWin } from '../meta/progress';
import { SaveStore, type Settings } from '../meta/save';
import { crownsForStars, earnCrowns } from '../meta/store';
import type { Platform } from '../platform/platform';
import { VERSION } from '../version';
import { Audio } from './audio';
import type { Command } from './input';
import type { TrackId } from './music';
import { Gauntlet } from './gauntlet';
import type { FloorRun, FloorSummary } from './runs';
import { DailyScene } from './scenes/daily';
import { DepthsScene } from './scenes/depths';
import { FloorScene } from './scenes/floor';
import { ForgeScene } from './scenes/forge';
import { LevelsScene } from './scenes/levels';
import { MenuScene } from './scenes/menu';
import { PlayScene } from './scenes/play';
import { ResultsScene } from './scenes/results';
import { SkinsScene } from './scenes/skins';
import { StatsScene } from './scenes/stats';
import { setDieSkin } from './view/cube';
import { activeSkin, newlyUnlocked, unlockedSkins, type SkinDef } from '../meta/skins';
import { canTransition, type Scene } from './scenes/scene';
import type { PlaySession } from './session';
import { starMask, type StarResult } from './stars';
import { C, displayPrefs, setHighContrast } from './view/palette';
import type { Stage } from './view/stage';

/** A return after this long away starts a new session. */
export const SESSION_GAP_MS = 30 * 60_000;
/** The first chapter doubles as the tutorial funnel. */
export const TUTORIAL_LENGTH = 10;

export interface WinSummary {
  readonly stars: StarResult;
  /** Stars kept from earlier attempts (bitmask), before and after this win. */
  readonly earlierMask: number;
  readonly totalStars: number;
  readonly improved: boolean;
  readonly firstClear: boolean;
  /** Crowns earned for stars won for the first time. */
  readonly crowns: number;
  /** Par to show when it isn't the level's own (a gauntlet's summed par). */
  readonly par?: number;
  /** Skins unlocked by this win. */
  readonly newSkins: readonly SkinDef[];
}

export class Game {
  readonly rules: Rules;
  readonly levels: LevelData[];
  /** Extra floors of gauntlet levels, by level id. */
  readonly gauntlets: Map<string, LevelData[]>;
  readonly audio = new Audio();
  readonly save: SaveStore;
  readonly analytics: LocalAnalytics;
  readonly levelService: LevelService;
  scene: Scene | null = null;
  private hiddenAt = 0;

  constructor(
    readonly stage: Stage,
    readonly platform: Platform,
    options: { debug?: boolean } = {},
  ) {
    this.rules = defaultRules();
    this.levels = loadCampaign(this.rules);
    this.gauntlets = loadGauntletFloors(this.rules);
    this.levelService = new LevelService(this.rules);
    this.save = new SaveStore(platform.storage, platform.now());
    this.audio.muted = this.save.data.settings.muted;
    this.audio.setMusicVolume(this.save.data.settings.musicVolume);
    this.analytics = new LocalAnalytics(platform.storage, platform.now, randomId, VERSION);
    this.analytics.optedOut = this.save.data.settings.analyticsOptOut;
    this.analytics.verbose = options.debug === true;
    this.analytics.startSession(SESSION_GAP_MS);
    this.applySkin();
    this.applyDisplay();
  }

  /** Reduce motion: the player's choice, or the system setting if they haven't chosen. */
  get reducedMotion(): boolean {
    return this.save.data.settings.reduceMotion ?? this.platform.prefersReducedMotion();
  }

  /** Applies the display settings (contrast, label size) to drawing and the DOM. */
  applyDisplay(): void {
    const s = this.save.data.settings;
    setHighContrast(s.highContrast);
    displayPrefs.largeLabels = s.largeLabels;
    this.stage.root.classList.toggle('high-contrast', s.highContrast);
    this.stage.root.classList.toggle('large-labels', s.largeLabels);
  }

  /** Background music volume, 0 (off) to 1. */
  setMusicVolume(v: number): void {
    this.save.update((d) => (d.settings.musicVolume = Math.max(0, Math.min(1, v))));
    this.audio.setMusicVolume(this.save.data.settings.musicVolume);
  }

  setDisplay(
    patch: Partial<Pick<Settings, 'highContrast' | 'largeLabels' | 'reduceMotion'>>,
  ): void {
    this.save.update((d) => Object.assign(d.settings, patch));
    this.applyDisplay();
    this.stage.root.dispatchEvent(new CustomEvent('ssk:settings'));
  }

  /** Draws the die with the equipped skin from now on. */
  applySkin(): void {
    setDieSkin(activeSkin(this.save.data));
  }

  get tutorialLevels(): string[] {
    return this.levels.slice(0, TUTORIAL_LENGTH).map((l) => l.id);
  }

  // ---------- scenes ----------

  private go(next: Scene): void {
    if (this.scene && !canTransition(this.scene.name, next.name)) {
      throw new Error(`Invalid scene transition ${this.scene.name} -> ${next.name}`);
    }
    this.scene?.exit?.();
    this.stage.ui.replaceChildren();
    this.scene = next;
    const music = musicFor(next);
    if (music !== 'keep') this.audio.setTrack(music);
    this.stage.root.dataset.scene = next.name;
    next.enter(this.stage.ui);
  }

  goMenu(): void {
    this.go(new MenuScene(this));
  }

  goLevels(chapter?: number): void {
    this.go(new LevelsScene(this, chapter));
  }

  /** Plays a campaign level. */
  goPlay(index: number): void {
    const i = Math.max(0, Math.min(index, this.levels.length - 1));
    const level = this.levels[i]!;
    const extra = this.gauntlets.get(level.id);
    if (extra) {
      void new Gauntlet(this, i, [level, ...extra]).play();
      return;
    }
    this.goPlaySession({
      mode: 'campaign',
      level,
      startHp: 5,
      title: `${i + 1}. ${level.name}`,
      campaignIndex: i,
      onStart: () => this.save.update((d) => (d.lastLevelId = level.id)),
      onWin: (state, stars, ms) => {
        const summary = this.recordWin(i, state, stars, ms);
        return () => this.goResults(i, state, summary);
      },
      onBack: () => this.goLevels(),
    });
  }

  goPlaySession(session: PlaySession): void {
    this.go(new PlayScene(this, session));
  }

  goDaily(): void {
    this.go(new DailyScene(this));
  }

  goDepths(): void {
    this.go(new DepthsScene(this));
  }

  /** The Forge (store + die builder). `back` returns to where it was opened from. */
  goForge(back?: () => void): void {
    this.go(new ForgeScene(this, back));
  }

  goSkins(): void {
    this.go(new SkinsScene(this));
  }

  goStats(): void {
    this.go(new StatsScene(this));
  }

  goFloor(summary: FloorSummary, run: FloorRun): void {
    this.go(new FloorScene(this, summary, run));
  }

  goResults(index: number, state: GameState, summary: WinSummary): void {
    this.go(new ResultsScene(this, index, state, summary));
  }

  continueIndex(): number {
    return continueIndex(this.save.data, this.levels);
  }

  // ---------- progress ----------

  /** Stores a finished level and returns what changed. */
  recordWin(index: number, state: GameState, stars: StarResult, timeMs: number): WinSummary {
    const level = this.levels[index]!;
    const firstClear = (this.save.data.levels[level.id]?.completions ?? 0) === 0;
    const before = this.save.data.levels[level.id]?.stars ?? 0;
    const earlierMask = this.save.data.levels[level.id]?.starMask ?? 0;
    const skinsBefore = unlockedSkins(this.save.data);
    let improved = false;
    let crowns = 0;
    this.save.update((d) => {
      improved = recordWin(d, level.id, {
        starMask: starMask(stars),
        moves: state.stats.moves,
        timeMs,
      });
      crowns = earnCrowns(d, crownsForStars((d.levels[level.id]?.stars ?? 0) - before));
      d.stats.levelsCompleted++;
      d.stats.moves += state.stats.moves;
      d.stats.kills += state.stats.kills;
      d.stats.gold += state.gold;
    });
    this.analytics.track('level_complete', {
      level: level.id,
      moves: state.stats.moves,
      hp: state.player.hp,
      stars: stars.count,
      time_ms: Math.round(timeMs),
    });
    if (crowns > 0) this.analytics.track('crowns_earned', { amount: crowns, source: 'campaign' });
    if (firstClear && index < TUTORIAL_LENGTH) {
      this.analytics.track('tutorial_step_complete', { step: index + 1, level: level.id });
    }
    const newSkins = newlyUnlocked(skinsBefore, unlockedSkins(this.save.data));
    const totalStars = this.save.data.levels[level.id]?.stars ?? stars.count;
    return { stars, earlierMask, totalStars, improved, firstClear, crowns, newSkins };
  }

  // ---------- loop hooks ----------

  command(cmd: Command): void {
    if (cmd.type === 'mute') {
      this.toggleMute();
      return;
    }
    this.scene?.command?.(cmd);
  }

  update(dt: number): void {
    this.scene?.update?.(dt);
  }

  private frame = 0;

  /** Draws a frame. Returns false when the frame was skipped (idle, half rate). */
  render(): boolean {
    this.frame++;
    if (this.frame % 2 === 1 && this.scene?.idle?.()) return false;
    const ctx = this.stage.beginFrame();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, 340, 480);
    this.scene?.render(ctx);
    return true;
  }

  /** Called when the page is hidden or shown again. */
  visibilityChanged(visible: boolean): void {
    const now = this.platform.now();
    if (!visible) {
      this.hiddenAt = now;
      if (this.scene instanceof PlayScene) this.scene.flushTime();
      this.analytics.endSession();
      return;
    }
    if (now - this.hiddenAt >= SESSION_GAP_MS) this.analytics.startSession();
    else this.analytics.resumeSession();
  }

  // ---------- settings ----------

  get muted(): boolean {
    return this.save.data.settings.muted;
  }

  toggleMute(): void {
    this.save.update((d) => (d.settings.muted = !d.settings.muted));
    this.audio.muted = this.save.data.settings.muted;
    this.audio.setMusicVolume(this.save.data.settings.musicVolume);
    this.stage.root.dispatchEvent(new CustomEvent('ssk:settings'));
  }

  get analyticsEnabled(): boolean {
    return !this.save.data.settings.analyticsOptOut;
  }

  setAnalyticsEnabled(enabled: boolean): void {
    this.save.update((d) => (d.settings.analyticsOptOut = !enabled));
    this.analytics.setOptOut(!enabled);
    if (enabled) this.analytics.startSession();
    this.stage.root.dispatchEvent(new CustomEvent('ssk:settings'));
  }
}

/**
 * Which music a scene plays. Result and between-floor screens keep whatever
 * is playing, so a run of levels sounds like one continuous piece.
 */
function musicFor(scene: Scene): TrackId | 'keep' {
  if (scene instanceof PlayScene) return scene.session.music ?? 'puzzle';
  if (scene.name === 'results' || scene.name === 'floor') return 'keep';
  return 'hall';
}

/** Random install id for grouping local events. Not personal, never sent anywhere. */
function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
