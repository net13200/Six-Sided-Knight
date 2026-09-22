/**
 * A play session: what the play screen needs to know about the level it is
 * running and where to go afterwards. Campaign levels, Daily Roll floors and
 * Depths floors are all sessions, so the play screen has no mode-specific code.
 */
import type { GameState, LevelData } from '../engine';
import type { StarResult } from './stars';

export type PlayMode = 'campaign' | 'daily' | 'depths';

export interface PlaySession {
  readonly mode: PlayMode;
  readonly level: LevelData;
  readonly startHp: number;
  /** HUD title, e.g. "3. Turn the Blade" or "Daily Roll · floor 2/3". */
  readonly title: string;
  /** Campaign position, or null for generated floors. */
  readonly campaignIndex: number | null;
  /** Called once when play begins. */
  onStart?(): void;
  /** Called when the level is won; returns the navigation to run after the win animation. */
  onWin(state: GameState, stars: StarResult, activeMs: number): () => void;
  /** Menu button / Escape. */
  onBack(): void;
}
