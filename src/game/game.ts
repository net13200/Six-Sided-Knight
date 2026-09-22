/**
 * Owns the shared services (rules, levels, stage, audio, save, analytics,
 * platform) and the scene state machine. Scenes are created through the
 * go* methods.
 */
import { defaultRules } from '../content/register';
import type { GameState, LevelData, Rules } from '../engine';
import { loadCampaign } from '../levels/campaign';
import { LevelService } from '../gen/service';
import { LocalAnalytics } from '../meta/analytics';
import { continueIndex, recordWin } from '../meta/progress';
import { SaveStore } from '../meta/save';
import type { Platform } from '../platform/platform';
import { VERSION } from '../version';
import { Audio } from './audio';
import type { Command } from './input';
import type { FloorSummary, Run } from './runs';
import { DailyScene } from './scenes/daily';
import { DepthsScene } from './scenes/depths';
import { FloorScene } from './scenes/floor';
import { LevelsScene } from './scenes/levels';
import { MenuScene } from './scenes/menu';
import { PlayScene } from './scenes/play';
import { ResultsScene } from './scenes/results';
import { canTransition, type Scene } from './scenes/scene';
import type { PlaySession } from './session';
import type { StarResult } from './stars';
import { C } from './view/palette';
import type { Stage } from './view/stage';

/** A return after this long away starts a new session. */
export const SESSION_GAP_MS = 30 * 60_000;
/** The first chapter doubles as the tutorial funnel. */
export const TUTORIAL_LENGTH = 10;

export interface WinSummary {
  readonly stars: StarResult;
  readonly improved: boolean;
  readonly firstClear: boolean;
}

export class Game {
  readonly rules: Rules;
  readonly levels: LevelData[];
  readonly audio = new Audio();
  readonly reducedMotion: boolean;
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
    this.levelService = new LevelService(this.rules);
    this.reducedMotion = platform.prefersReducedMotion();
    this.save = new SaveStore(platform.storage, platform.now());
    this.audio.muted = this.save.data.settings.muted;
    this.analytics = new LocalAnalytics(platform.storage, platform.now, randomId, VERSION);
    this.analytics.optedOut = this.save.data.settings.analyticsOptOut;
    this.analytics.verbose = options.debug === true;
    this.analytics.startSession(SESSION_GAP_MS);
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

  goFloor(summary: FloorSummary, run: Run): void {
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
    let improved = false;
    this.save.update((d) => {
      improved = recordWin(d, level.id, { stars: stars.count, moves: state.stats.moves, timeMs });
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
    if (firstClear && index < TUTORIAL_LENGTH) {
      this.analytics.track('tutorial_step_complete', { step: index + 1, level: level.id });
    }
    return { stars, improved, firstClear };
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

  render(): void {
    const ctx = this.stage.beginFrame();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, 340, 480);
    this.scene?.render(ctx);
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

/** Random install id for grouping local events. Not personal, never sent anywhere. */
function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
