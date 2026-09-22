/**
 * Owns the shared services (rules, levels, stage, audio, platform) and the
 * scene state machine. Scenes are created through the go* methods.
 */
import { defaultRules } from '../content/register';
import type { GameState, LevelData, Rules } from '../engine';
import { loadCampaign } from '../levels/campaign';
import type { Platform } from '../platform/platform';
import { Audio } from './audio';
import type { Command } from './input';
import { LevelsScene } from './scenes/levels';
import { MenuScene } from './scenes/menu';
import { PlayScene } from './scenes/play';
import { ResultsScene } from './scenes/results';
import { canTransition, type Scene } from './scenes/scene';
import type { StarResult } from './stars';
import { C } from './view/palette';
import type { Stage } from './view/stage';

const SETTINGS_KEY = 'ssk.settings.v1';

interface Settings {
  muted: boolean;
}

export class Game {
  readonly rules: Rules;
  readonly levels: LevelData[];
  readonly audio = new Audio();
  readonly reducedMotion: boolean;
  /** Best stars per level id. Kept in memory for now; milestone 3 persists it. */
  readonly best = new Map<string, number>();
  scene: Scene | null = null;
  private settings: Settings;

  constructor(
    readonly stage: Stage,
    readonly platform: Platform,
  ) {
    this.rules = defaultRules();
    this.levels = loadCampaign(this.rules);
    this.reducedMotion = platform.prefersReducedMotion();
    this.settings = this.loadSettings();
    this.audio.muted = this.settings.muted;
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

  goLevels(): void {
    this.go(new LevelsScene(this));
  }

  goPlay(index: number): void {
    const i = Math.max(0, Math.min(index, this.levels.length - 1));
    this.go(new PlayScene(this, i));
  }

  goResults(index: number, state: GameState, stars: StarResult): void {
    const prev = this.best.get(this.levels[index]!.id) ?? 0;
    this.best.set(this.levels[index]!.id, Math.max(prev, stars.count));
    this.go(new ResultsScene(this, index, state, stars));
  }

  /** Index of the level "Play" should open: the first one not yet completed. */
  continueIndex(): number {
    const i = this.levels.findIndex((l) => !this.best.has(l.id));
    return i < 0 ? this.levels.length - 1 : i;
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

  // ---------- settings ----------

  get muted(): boolean {
    return this.settings.muted;
  }

  toggleMute(): void {
    this.settings.muted = !this.settings.muted;
    this.audio.muted = this.settings.muted;
    this.platform.storage.set(SETTINGS_KEY, JSON.stringify(this.settings));
    this.stage.root.dispatchEvent(new CustomEvent('ssk:mute'));
  }

  private loadSettings(): Settings {
    try {
      const raw = this.platform.storage.get(SETTINGS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
      return { muted: parsed.muted === true };
    } catch {
      return { muted: false };
    }
  }
}
