/**
 * A play session: what the play screen needs to know about the level it is
 * running and where to go afterwards. Campaign levels, Daily Roll floors and
 * Depths floors are all sessions, so the play screen has no mode-specific code.
 */
import type { Dir, GameState, LevelData } from '../engine';
import type { TrackId } from './music';
import type { Lesson } from './lessons';
import type { StarResult } from './stars';

export type PlayMode = 'campaign' | 'daily' | 'depths';

export interface PlaySession {
  readonly mode: PlayMode;
  readonly level: LevelData;
  readonly startHp: number;
  /** HUD title, e.g. "3. Turn the Blade" or "Daily Roll · floor 2/3". */
  readonly title: string;
  /** Background music while playing (default: the calm puzzle track). */
  readonly music?: TrackId;
  /** A warning shown at the start of play (e.g. "your die can't win this floor"). */
  readonly notice?: string;
  /** A lesson to read before playing (shown on the level's first play). */
  readonly lesson?: Lesson | null;
  /** Campaign position, or null for generated floors. */
  readonly campaignIndex: number | null;
  /**
   * No second chances (Depths): no Undo or Retry, no watching the solution,
   * and being knocked out ends the run (`onLose`).
   */
  readonly permadeath?: boolean;
  /**
   * A gauntlet: moves and par count for the whole run, not this floor
   * (`movesBefore`: moves played on the floors already cleared).
   */
  readonly run?: { readonly par: number; readonly movesBefore: number };
  /** Moves already played on this level (a resumed floor picks up where it was). */
  readonly resume?: readonly Dir[];
  /** Called once when play begins. */
  onStart?(): void;
  /** Called when the level is won; returns the navigation to run after the win animation. */
  onWin(state: GameState, stars: StarResult, activeMs: number): () => void;
  /** Called after each move that counts, with every move played so far. */
  onMove?(moves: readonly Dir[]): void;
  /** Permadeath: called when knocked out; returns the navigation to run after the fall. */
  onLose?(state: GameState): () => void;
  /** Menu button / Escape. */
  onBack(): void;
}
