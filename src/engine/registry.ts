/**
 * Content registries. Faces, tiles, enemies and effects are definition objects
 * with hooks; the turn logic in step.ts only ever calls these hooks and never
 * names a specific face, tile or enemy.
 */
import type { TurnContext } from './context';
import type { Dir, EnemyState, FaceId, Pos, TileId, EnemyKind, EffectId } from './types';

/** Outcome of leading into a tile (or of a face intercepting the lead). */
export type LeadResult =
  | 'enter' // the die rolls onto the tile
  | 'stay' // the action consumed the turn but the die didn't move
  | 'block'; // invalid bump: no turn passes

export interface LeadInfo {
  readonly from: Pos;
  readonly to: Pos;
  readonly dir: Dir;
  readonly face: FaceId;
}

export interface FaceDef {
  readonly id: FaceId;
  readonly name: string;
  /** Single ASCII character for the CLI and level files. */
  readonly glyph: string;
  /** Capability tags that tiles/enemies test for, e.g. 'unlock', 'loot', 'guard', 'heal'. */
  readonly tags: readonly string[];
  /** Damage dealt when this face leads into an enemy. 0 = "clunk". */
  readonly attack: number;
  /**
   * Custom attack. Default: deal `attack` damage to the target.
   * Must return whether the target died.
   */
  onAttack?(ctx: TurnContext, target: EnemyState, info: LeadInfo): boolean;
  /**
   * Called when this face leads into a non-enemy tile, before the tile's own hook.
   * Return a result to take over, or undefined to let the tile decide.
   */
  onLeadInto?(ctx: TurnContext, info: LeadInfo): LeadResult | undefined;
  /** Called after the die lands, with the slot this face is now in. */
  onLand?(ctx: TurnContext, slot: string): void;
  /** Adjusts incoming enemy damage; `slot` is where this face currently is. */
  modifyIncomingDamage?(amount: number, slot: string): number;
  onTurnEnd?(ctx: TurnContext, slot: string): void;
}

export interface TileDef {
  readonly id: TileId;
  readonly name: string;
  readonly glyph: string;
  /** Whether the die can roll onto it (when no hook says otherwise). */
  readonly passable: boolean;
  /** Whether enemies may step onto it. */
  readonly enemyPassable: boolean;
  /** Counted toward the "all gold" star. */
  readonly treasure?: boolean;
  /** Tile reached by the goal check (exit stairs). Used by the solver/validator. */
  readonly goal?: boolean;
  onLeadInto?(ctx: TurnContext, info: LeadInfo): LeadResult | undefined;
  onLand?(ctx: TurnContext, at: Pos): void;
  onTurnEnd?(ctx: TurnContext, at: Pos): void;
}

export interface EnemyDef {
  readonly kind: EnemyKind;
  readonly name: string;
  readonly glyph: string;
  readonly hp: number;
  /** Gold awarded on kill. */
  readonly bounty: number;
  /** Initial per-kind data; `overrides` come from the level file. */
  initData?(
    overrides: Readonly<Record<string, number | boolean>>,
  ): Record<string, number | boolean>;
  onEnemyTurn(ctx: TurnContext, self: EnemyState): void;
  /** True if the enemy will act in the next enemy phase (for the UI indicator). */
  willAct?(self: EnemyState): boolean;
  onTurnEnd?(ctx: TurnContext, self: EnemyState): void;
}

export interface EffectDef {
  readonly id: EffectId;
  readonly name: string;
  /** Return true to skip the enemy's normal turn (e.g. frozen). */
  onEnemyTurn?(ctx: TurnContext, enemy: EnemyState): boolean;
  onTurnEnd?(ctx: TurnContext, enemy: EnemyState): void;
}

export class Registry<T> {
  private readonly items = new Map<string, T>();
  constructor(
    readonly label: string,
    private readonly keyOf: (item: T) => string,
  ) {}

  register(item: T): this {
    const key = this.keyOf(item);
    if (this.items.has(key)) throw new Error(`${this.label} '${key}' is already registered`);
    this.items.set(key, item);
    return this;
  }

  get(key: string): T {
    const item = this.items.get(key);
    if (!item) throw new Error(`Unknown ${this.label}: '${key}'`);
    return item;
  }

  has(key: string): boolean {
    return this.items.has(key);
  }

  all(): T[] {
    return [...this.items.values()];
  }
}

/** Content-level defaults the engine needs but must not hard-code. */
export interface RulesConfig {
  /** Tile placed under the player start and under enemies in level grids. */
  readonly floorTile: TileId;
  /** Die shape used when a level doesn't say otherwise. */
  readonly dieShape: string;
  /** Faces by home slot for the default die (slot order from the shape). */
  readonly defaultLoadout: readonly FaceId[];
}

/** Everything the simulation needs to know about content. Passed explicitly; no globals. */
export interface Rules {
  readonly config: RulesConfig;
  readonly faces: Registry<FaceDef>;
  readonly tiles: Registry<TileDef>;
  readonly enemies: Registry<EnemyDef>;
  readonly effects: Registry<EffectDef>;
}

export function createRules(config: RulesConfig): Rules {
  return {
    config,
    faces: new Registry<FaceDef>('face', (f) => f.id),
    tiles: new Registry<TileDef>('tile', (t) => t.id),
    enemies: new Registry<EnemyDef>('enemy', (e) => e.kind),
    effects: new Registry<EffectDef>('effect', (e) => e.id),
  };
}
