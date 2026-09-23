/** Core data types for the simulation. Everything here is plain, serializable data. */

export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];

export const DIR_DELTA: Readonly<Record<Dir, { readonly dx: number; readonly dy: number }>> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

export const OPPOSITE: Readonly<Record<Dir, Dir>> = { N: 'S', E: 'W', S: 'N', W: 'E' };

export type FaceId = string;
export type TileId = string;
export type EnemyKind = string;
export type EffectId = string;

export interface Pos {
  readonly x: number;
  readonly y: number;
}

export interface ActiveEffect {
  readonly id: EffectId;
  /** Remaining turns; the effect is removed when it reaches 0. */
  readonly turns: number;
}

export interface EnemyState {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  /** Per-kind scratch data (e.g. a slime's wait counter). Numbers/booleans only. */
  readonly data: Readonly<Record<string, number | boolean>>;
  readonly effects: readonly ActiveEffect[];
}

export interface DieState {
  /** Die shape id, e.g. 'd6'. */
  readonly shape: string;
  /**
   * Faces by "home" slot. The face in slot `s` right now is `loadout[perm[s]]`,
   * where `perm` is the orientation's permutation. Swapping a face = editing the loadout.
   */
  readonly loadout: readonly FaceId[];
  /** Index into the shape's precomputed orientation table. */
  readonly orient: number;
}

export interface PlayerState {
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly die: DieState;
}

export type Status = 'playing' | 'won' | 'lost';

export interface RunStats {
  /** Valid (turn-consuming) actions taken. */
  readonly moves: number;
  readonly damageTaken: number;
  readonly kills: number;
  /** Treasures (gems, chests, ...) collected / present at level start. */
  readonly treasuresCollected: number;
  readonly treasuresTotal: number;
}

export interface GameState {
  readonly levelId: string;
  readonly width: number;
  readonly height: number;
  /** Row-major tile ids, length width*height. Copy-on-write. */
  readonly tiles: readonly TileId[];
  readonly player: PlayerState;
  readonly enemies: readonly EnemyState[];
  readonly gold: number;
  readonly turn: number;
  readonly status: Status;
  readonly stats: RunStats;
  /** Seeded RNG state (uint32). */
  readonly rng: number;
  readonly nextEnemyId: number;
}

export type Action = { readonly type: 'move'; readonly dir: Dir };

export type DamageSource =
  | { readonly kind: 'enemy'; readonly enemyId: number }
  | { readonly kind: 'tile'; readonly tile: TileId }
  | { readonly kind: 'effect'; readonly effect: EffectId };

export type GameEvent =
  | { type: 'moved'; from: Pos; to: Pos; dir: Dir; orient: number }
  /** The die moved without rolling (e.g. sliding on ice); orientation unchanged. */
  | { type: 'slid'; from: Pos; to: Pos; dir: Dir }
  /** Something was pulled toward the die (an enemy, or a treasure being collected). */
  | { type: 'pulled'; from: Pos; to: Pos; enemyId?: number }
  | { type: 'bumped'; at: Pos; dir: Dir; reason: string }
  | { type: 'attacked'; target: number; at: Pos; face: FaceId; damage: number; splash?: boolean }
  | { type: 'enemyAttacked'; enemyId: number; from: Pos; damage: number; blocked: boolean }
  | { type: 'enemyMoved'; enemyId: number; from: Pos; to: Pos }
  | { type: 'enemyWaited'; enemyId: number }
  | { type: 'killed'; enemyId: number; kind: EnemyKind; at: Pos }
  | { type: 'hurt'; amount: number; source: DamageSource; hp: number }
  | { type: 'healed'; amount: number; hp: number }
  | { type: 'gold'; amount: number; reason: string; total: number }
  | { type: 'unlocked'; at: Pos }
  | { type: 'opened'; at: Pos }
  | { type: 'tileChanged'; at: Pos; from: TileId; to: TileId }
  | { type: 'effectApplied'; enemyId: number; effect: EffectId; turns: number }
  | { type: 'turnEnd'; turn: number }
  | { type: 'won'; moves: number }
  | { type: 'lost'; turn: number };

export interface StepResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  /** False for invalid bumps: the state is returned unchanged and no turn passes. */
  readonly consumed: boolean;
}
