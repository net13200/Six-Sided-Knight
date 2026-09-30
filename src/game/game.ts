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
import {
  CHAPTER_SIZE,
  continueIndex,
  isCompleted,
  isUnlocked,
  levelFingerprint,
  recordWin,
  refreshChangedLevels,
} from '../meta/progress';
import { FINGERPRINTS_0_9_0 } from '../meta/legacy-fingerprints';
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
import { StoryScene } from './scenes/story';
import { RangerMapScene } from './scenes/ranger-map';
import { RangerPlayScene } from './scenes/ranger-play';
import { loadRangerLevels } from '../ranger/levels';
import type { RLevel } from '../ranger/rules';
import { lessonFor, lessonKey, type Lesson } from './lessons';
import {
  ENDING,
  RANGER_INTRO,
  RANGER_OUTRO,
  STORY_KEYS,
  storyBeforeLevel,
  storySoFar,
  type StoryPage,
} from './story';
import { setDieSkin } from './view/cube';
import { setSkinMotion } from './view/skin-fx';
import { drawBackdrop } from './view/backdrop';
import { breakAllowed, type BreakMoment } from '../meta/ad-policy';
import { NO_ADS } from '../platform/ads';
import { activeSkin, newlyUnlocked, unlockedSkins, type SkinDef } from '../meta/skins';
import { canTransition, type Scene } from './scenes/scene';
import type { PlaySession } from './session';
import type { StarResult } from './stars';
import { C, displayPrefs, setHighContrast } from './view/palette';
import type { Stage } from './view/stage';
import { loadLang, setLang, t, tk } from '../i18n';

/** A return after this long away starts a new session. */
export const SESSION_GAP_MS = 30 * 60_000;
/** The first chapter doubles as the tutorial funnel. */
export const TUTORIAL_LENGTH = 10;

export interface WinSummary {
  readonly stars: StarResult;
  /** Best star count before this win (earlier attempts), and after it. */
  readonly earlierStars: number;
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
  /** The bonus chapter (Eight-Sided Ranger). */
  readonly rangerLevels: RLevel[];
  readonly audio = new Audio();
  readonly save: SaveStore;
  readonly analytics: LocalAnalytics;
  readonly levelService: LevelService;
  scene: Scene | null = null;
  /** Developer mode (#debug or ?debug): KPI panel, watching solutions. */
  debug: boolean;
  private hiddenAt = 0;
  /** True while an ad plays: the game waits (no input, no sound). */
  adPlaying = false;

  constructor(
    readonly stage: Stage,
    readonly platform: Platform,
    options: { debug?: boolean } = {},
  ) {
    this.rules = defaultRules();
    this.levels = loadCampaign(this.rules);
    this.gauntlets = loadGauntletFloors(this.rules);
    this.rangerLevels = loadRangerLevels();
    this.levelService = new LevelService(this.rules);
    this.save = new SaveStore(platform.storage, platform.now());
    // Levels changed in an update: their stars are earned again on the new version.
    this.save.update((d) =>
      refreshChangedLevels(d, this.levels, this.gauntlets, FINGERPRINTS_0_9_0),
    );
    this.audio.muted = this.save.data.settings.muted;
    this.audio.setMusicVolume(this.save.data.settings.musicVolume);
    this.analytics = new LocalAnalytics(platform.storage, platform.now, randomId, VERSION);
    this.analytics.optedOut = this.save.data.settings.analyticsOptOut;
    this.debug = options.debug === true;
    this.analytics.verbose = this.debug;
    this.analytics.startSession(SESSION_GAP_MS);
    this.applySkin();
    this.applyDisplay();
    setLang(this.save.data.settings.lang);
  }

  /**
   * Goes on with `next`, first showing an ad break if this is a good moment
   * for one (Poki build only; the web build has no ads and goes on at once).
   * `level` is the campaign level the player is heading into, if any.
   */
  breakThen(moment: BreakMoment, next: () => void, level?: number): void {
    if (
      this.platform.ads === NO_ADS ||
      this.adPlaying ||
      !breakAllowed(moment, level, this.tutorialDone)
    ) {
      next();
      return;
    }
    this.adPlaying = true;
    this.platform.ads.gameplayStop();
    this.audio.suspend();
    void this.platform.ads.commercialBreak().finally(() => {
      this.adPlaying = false;
      this.audio.resume();
      next();
    });
  }

  /** The player is playing (a move) or stopped (level end, a menu, a card). */
  setPlaying(on: boolean): void {
    if (this.adPlaying) return; // never an SDK event during an ad
    if (on) this.platform.ads.gameplayStart();
    else this.platform.ads.gameplayStop();
  }

  /** Whether this build can show rewarded ads (the Poki build). */
  get hasRewardedAds(): boolean {
    return this.platform.ads !== NO_ADS;
  }

  /**
   * A rewarded ad the player asked for. Resolves true if they watched it and
   * earned the reward.
   */
  async rewardedAd(): Promise<boolean> {
    if (this.platform.ads === NO_ADS || this.adPlaying) return false;
    this.adPlaying = true;
    this.platform.ads.gameplayStop();
    this.audio.suspend();
    try {
      return await this.platform.ads.rewardedBreak();
    } finally {
      this.adPlaying = false;
      this.audio.resume();
    }
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
    // Skin flames and glints hold still when motion is reduced.
    setSkinMotion(!this.reducedMotion);
  }

  /** Switches language (null = follow the browser) and rebuilds the title screen. */
  setLanguage(lang: string | null): void {
    this.save.update((d) => (d.settings.lang = lang));
    void loadLang(lang).then(() => this.go(new MenuScene(this, { settings: true })));
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
    setSkinMotion(!this.reducedMotion);
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
    // Portals want to know when the player is playing: a new screen stops
    // play; the play screens report their first real input.
    this.platform.ads.gameplayStop();
    next.enter(this.stage.ui);
  }

  goMenu(): void {
    this.go(new MenuScene(this));
  }

  /** The map; `at`: the campaign level just left, where the die stands. */
  goLevels(at?: number): void {
    this.go(new LevelsScene(this, at));
  }

  /**
   * Plays a campaign level. The first time a chapter begins (and before the
   * very first level) its story plays first, unless `story` is false. A level
   * with a lesson shows it on the first play, unless `lessons` is false.
   */
  goPlay(index: number, opts: { story?: boolean; lessons?: boolean } = {}): void {
    const i = Math.max(0, Math.min(index, this.levels.length - 1));
    const level = this.levels[i]!;
    if (opts.story !== false) {
      const { pages, keys } = storyBeforeLevel(
        i,
        (k) => this.storySeen(k),
        isCompleted(this.save.data, level),
      );
      if (pages.length > 0) {
        this.goStory(pages, () => this.goPlay(i, { ...opts, story: false }), keys, tk('Begin'));
        return;
      }
    }
    const lesson = opts.lessons === false ? null : this.pendingLesson(level);
    const extra = this.gauntlets.get(level.id);
    if (extra) {
      void new Gauntlet(this, i, [level, ...extra], lesson).play();
      return;
    }
    this.goPlaySession({
      mode: 'campaign',
      level,
      startHp: this.rules.config.maxHp,
      title: `${i + 1}. ${t(level.name)}`,
      campaignIndex: i,
      lesson,
      onStart: () => this.save.update((d) => (d.lastLevelId = level.id)),
      onWin: (state, stars, ms) => {
        const summary = this.recordWin(i, state, stars, ms);
        return () => this.goResults(i, state, summary);
      },
      onBack: () => this.goLevels(i),
    });
  }

  /** Every tutorial level beaten (unlocks "How to play" on the title screen). */
  get tutorialDone(): boolean {
    return this.levels.slice(0, TUTORIAL_LENGTH).every((l) => isCompleted(this.save.data, l));
  }

  /** A level's lesson if it hasn't been read yet. */
  pendingLesson(level: LevelData): Lesson | null {
    const lesson = lessonFor(level);
    return lesson && !this.save.data.hints[lessonKey(level.id)] ? lesson : null;
  }

  /** Shows story pages, marks `keys` as seen, then calls `done`. */
  goStory(
    pages: readonly StoryPage[],
    done: () => void,
    keys: string[] = [],
    finalLabel?: string,
  ): void {
    if (keys.length > 0) this.save.update((d) => keys.forEach((k) => (d.hints[k] = true)));
    this.go(new StoryScene(this, pages, done, finalLabel));
  }

  storySeen(key: string): boolean {
    return this.save.data.hints[key] === true;
  }

  /** "Story" on the title screen: everything seen so far. */
  goStorySoFar(): void {
    let open = 0;
    for (let c = 0; c * CHAPTER_SIZE < this.levels.length; c++) {
      if (isUnlocked(this.save.data, this.levels, c * CHAPTER_SIZE)) open = c + 1;
    }
    this.goStory(
      storySoFar((k) => this.storySeen(k), open),
      () => this.goMenu(),
      [],
      tk('Done'),
    );
  }

  /** The ending, the first time the last level is beaten. */
  get endingPending(): boolean {
    const last = this.levels[this.levels.length - 1];
    return !!last && isCompleted(this.save.data, last) && !this.storySeen(STORY_KEYS.ending);
  }

  /** Nothing played yet, and the story not seen. */
  get isNewPlayer(): boolean {
    const d = this.save.data;
    return (
      Object.keys(d.levels).length === 0 &&
      d.lastLevelId === null &&
      !this.storySeen(STORY_KEYS.intro)
    );
  }

  /** The bonus chapter opens once the campaign's last level is beaten. */
  get bonusUnlocked(): boolean {
    const last = this.levels[this.levels.length - 1];
    return !!last && isCompleted(this.save.data, last);
  }

  goRangerMap(): void {
    this.go(new RangerMapScene(this));
  }

  /** A bonus stage; the chapter's intro page plays before the first one, once. */
  goRangerPlay(index: number): void {
    const i = Math.max(0, Math.min(index, this.rangerLevels.length - 1));
    if (i === 0 && !this.storySeen(STORY_KEYS.rangerIntro)) {
      this.goStory(RANGER_INTRO, () => this.goRangerPlay(0), [STORY_KEYS.rangerIntro], tk('Begin'));
      return;
    }
    this.go(new RangerPlayScene(this, i));
  }

  /** After the last bonus stage: "Coming soon". */
  goRangerOutro(): void {
    this.goStory(
      RANGER_OUTRO,
      () => this.goRangerMap(),
      [STORY_KEYS.rangerOutro],
      tk('Back to the Greenwood'),
    );
  }

  goEnding(): void {
    this.goStory(ENDING, () => this.goMenu(), [STORY_KEYS.ending], tk('The end'));
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

  /** The Smith (store + die builder). `back` returns to where it was opened from. */
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
    const skinsBefore = unlockedSkins(this.save.data);
    let improved = false;
    let crowns = 0;
    this.save.update((d) => {
      improved = recordWin(
        d,
        level.id,
        { stars: stars.count, moves: state.stats.moves, timeMs },
        levelFingerprint(level, this.gauntlets.get(level.id)),
      );
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
    return { stars, earlierStars: before, totalStars, improved, firstClear, crowns, newSkins };
  }

  // ---------- loop hooks ----------

  command(cmd: Command): void {
    if (this.adPlaying) return;
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
    this.renderBackdrop();
    return true;
  }

  private backdropTime = 0;

  /** The scenery around the game (wide screens, very tall phones). */
  private renderBackdrop(): void {
    const { box, view } = this.stage;
    if (box.x < 1 && box.y < 1 && box.w >= view.w - 1 && box.h >= view.h - 1) return;
    const t = this.reducedMotion ? 0 : (this.backdropTime = performance.now() / 1000);
    const scene = this.scene;
    drawBackdrop(this.stage, scene?.backdrop ?? 'dungeon', t, scene?.renderSide?.bind(scene));
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
