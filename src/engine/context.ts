/**
 * TurnContext is the only way content hooks change the world. It holds a
 * private draft of the state (copy-on-write) and records every change as an
 * event. step() creates one per action and turns it back into an immutable
 * GameState at the end.
 */
import { bottomFace, faceInSlot, getShape, rollDie, topFace } from './dice';
import type { FaceDef, Rules, TileDef } from './registry';
import { rngNext } from './rng';
import {
  DIR_DELTA,
  type ActiveEffect,
  type DamageSource,
  type Dir,
  type EffectId,
  type EnemyState,
  type FaceId,
  type GameEvent,
  type GameState,
  type PlayerState,
  type Pos,
  type RunStats,
  type Status,
  type TileId,
} from './types';

export class TurnContext {
  readonly events: GameEvent[] = [];

  private tiles: readonly TileId[];
  private tilesCopied = false;
  private enemyList: EnemyState[];
  private playerState: PlayerState;
  private goldTotal: number;
  private statusValue: Status;
  private runStats: RunStats;
  private rngState: number;
  private distCache: Int16Array | null = null;

  constructor(
    readonly rules: Rules,
    private readonly base: GameState,
  ) {
    this.tiles = base.tiles;
    this.enemyList = [...base.enemies];
    this.playerState = base.player;
    this.goldTotal = base.gold;
    this.statusValue = base.status;
    this.runStats = base.stats;
    this.rngState = base.rng;
  }

  // ---------- reading ----------

  get width(): number {
    return this.base.width;
  }
  get height(): number {
    return this.base.height;
  }
  get player(): PlayerState {
    return this.playerState;
  }
  get enemies(): readonly EnemyState[] {
    return this.enemyList;
  }
  get gold(): number {
    return this.goldTotal;
  }
  get status(): Status {
    return this.statusValue;
  }
  /** True once the level is won or lost; resolution should stop. */
  get over(): boolean {
    return this.statusValue !== 'playing';
  }
  get turn(): number {
    return this.base.turn;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.base.width && y < this.base.height;
  }

  tileAt(x: number, y: number): TileId | null {
    return this.inBounds(x, y) ? this.tiles[y * this.base.width + x]! : null;
  }

  tileDefAt(x: number, y: number): TileDef | null {
    const id = this.tileAt(x, y);
    return id === null ? null : this.rules.tiles.get(id);
  }

  enemyAt(x: number, y: number): EnemyState | undefined {
    return this.enemyList.find((e) => e.x === x && e.y === y);
  }

  enemyById(id: number): EnemyState | undefined {
    return this.enemyList.find((e) => e.id === id);
  }

  face(id: FaceId): FaceDef {
    return this.rules.faces.get(id);
  }

  faceHasTag(id: FaceId | null, tag: string): boolean {
    return id !== null && this.rules.faces.get(id).tags.includes(tag);
  }

  topFace(): FaceId {
    return topFace(this.playerState.die);
  }

  bottomFace(): FaceId | null {
    return bottomFace(this.playerState.die);
  }

  /** [slotName, face] for every slot of the die. */
  dieSlots(): Array<[string, FaceId]> {
    const die = this.playerState.die;
    return getShape(die.shape).def.slots.map((name, slot) => [name, faceInSlot(die, slot)]);
  }

  random(): number {
    const r = rngNext(this.rngState);
    this.rngState = r.state;
    return r.value;
  }

  /**
   * BFS distance (in steps) from the player to every tile, walking only on
   * enemy-passable tiles. Enemies are ignored so crowds don't freeze.
   * -1 = unreachable. Cached until tiles or the player change.
   */
  distanceFromPlayer(): Int16Array {
    if (this.distCache) return this.distCache;
    const w = this.base.width;
    const h = this.base.height;
    const dist = new Int16Array(w * h).fill(-1);
    const queue = new Int16Array(w * h);
    const start = this.playerState.y * w + this.playerState.x;
    dist[start] = 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const cur = queue[head++]!;
      const cx = cur % w;
      const cy = (cur - cx) / w;
      for (const d of ['N', 'E', 'S', 'W'] as const) {
        const nx = cx + DIR_DELTA[d].dx;
        const ny = cy + DIR_DELTA[d].dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = ny * w + nx;
        if (dist[ni] !== -1) continue;
        if (!this.rules.tiles.get(this.tiles[ni]!).enemyPassable) continue;
        dist[ni] = dist[cur]! + 1;
        queue[tail++] = ni;
      }
    }
    this.distCache = dist;
    return dist;
  }

  // ---------- writing ----------

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  setTile(x: number, y: number, id: TileId): void {
    const from = this.tileAt(x, y);
    if (from === null || from === id) return;
    this.rules.tiles.get(id); // validate
    if (!this.tilesCopied) {
      this.tiles = [...this.tiles];
      this.tilesCopied = true;
    }
    (this.tiles as TileId[])[y * this.base.width + x] = id;
    this.distCache = null;
    this.emit({ type: 'tileChanged', at: { x, y }, from, to: id });
  }

  addGold(amount: number, reason: string): void {
    if (amount === 0) return;
    this.goldTotal += amount;
    this.emit({ type: 'gold', amount, reason, total: this.goldTotal });
  }

  collectTreasure(): void {
    this.runStats = { ...this.runStats, treasuresCollected: this.runStats.treasuresCollected + 1 };
  }

  /** Rolls the die one step in `dir`, then runs landing hooks (tile, then faces). */
  rollPlayer(dir: Dir): void {
    const p = this.playerState;
    const from = { x: p.x, y: p.y };
    const to = { x: p.x + DIR_DELTA[dir].dx, y: p.y + DIR_DELTA[dir].dy };
    const die = rollDie(p.die, dir);
    this.playerState = { ...p, x: to.x, y: to.y, die };
    this.distCache = null;
    this.emit({ type: 'moved', from, to, dir, orient: die.orient });

    this.tileDefAt(to.x, to.y)?.onLand?.(this, to);
    for (const [slot, face] of this.dieSlots()) {
      if (this.over) return;
      this.face(face).onLand?.(this, slot);
    }
  }

  healPlayer(amount: number): number {
    const p = this.playerState;
    const healed = Math.max(0, Math.min(amount, p.maxHp - p.hp));
    if (healed === 0) return 0;
    this.playerState = { ...p, hp: p.hp + healed };
    this.emit({ type: 'healed', amount: healed, hp: this.playerState.hp });
    return healed;
  }

  /** Direct damage to the player (spikes, effects). Not reduced by faces. */
  hurtPlayer(amount: number, source: DamageSource): void {
    if (amount <= 0 || this.over) return;
    const p = this.playerState;
    const hp = Math.max(0, p.hp - amount);
    this.playerState = { ...p, hp };
    this.runStats = { ...this.runStats, damageTaken: this.runStats.damageTaken + (p.hp - hp) };
    this.emit({ type: 'hurt', amount, source, hp });
    if (hp <= 0) this.lose();
  }

  /** An enemy hits the player. Faces may reduce the damage (e.g. Shield on top). */
  enemyAttack(enemy: EnemyState, amount: number): void {
    if (this.over) return;
    let dmg = amount;
    for (const [slot, face] of this.dieSlots()) {
      const mod = this.face(face).modifyIncomingDamage;
      if (mod) dmg = mod(dmg, slot);
    }
    dmg = Math.max(0, dmg);
    this.emit({
      type: 'enemyAttacked',
      enemyId: enemy.id,
      from: { x: enemy.x, y: enemy.y },
      damage: dmg,
      blocked: dmg < amount,
    });
    this.hurtPlayer(dmg, { kind: 'enemy', enemyId: enemy.id });
  }

  /** Damages an enemy. Returns true if it died (it is then removed and bounty paid). */
  damageEnemy(enemyId: number, amount: number, face: FaceId, splash = false): boolean {
    const e = this.enemyById(enemyId);
    if (!e) return false;
    const at = { x: e.x, y: e.y };
    this.emit({ type: 'attacked', target: enemyId, at, face, damage: amount, splash });
    if (amount <= 0) return false;
    const hp = e.hp - amount;
    if (hp > 0) {
      this.replaceEnemy({ ...e, hp });
      return false;
    }
    this.enemyList = this.enemyList.filter((x) => x.id !== enemyId);
    this.runStats = { ...this.runStats, kills: this.runStats.kills + 1 };
    this.emit({ type: 'killed', enemyId, kind: e.kind, at });
    this.addGold(this.rules.enemies.get(e.kind).bounty, 'kill');
    return true;
  }

  moveEnemy(enemyId: number, to: Pos): void {
    const e = this.enemyById(enemyId);
    if (!e) return;
    if (this.enemyAt(to.x, to.y) || (this.playerState.x === to.x && this.playerState.y === to.y)) {
      throw new Error(`Enemy ${enemyId} cannot move onto an occupied tile`);
    }
    this.replaceEnemy({ ...e, x: to.x, y: to.y });
    this.emit({ type: 'enemyMoved', enemyId, from: { x: e.x, y: e.y }, to });
  }

  updateEnemyData(enemyId: number, patch: Readonly<Record<string, number | boolean>>): void {
    const e = this.enemyById(enemyId);
    if (e) this.replaceEnemy({ ...e, data: { ...e.data, ...patch } });
  }

  applyEffect(enemyId: number, effect: EffectId, turns: number): void {
    const e = this.enemyById(enemyId);
    if (!e) return;
    this.rules.effects.get(effect); // validate
    const effects: ActiveEffect[] = [
      ...e.effects.filter((x) => x.id !== effect),
      { id: effect, turns },
    ];
    this.replaceEnemy({ ...e, effects });
    this.emit({ type: 'effectApplied', enemyId, effect, turns });
  }

  setEnemyEffects(enemyId: number, effects: readonly ActiveEffect[]): void {
    const e = this.enemyById(enemyId);
    if (e) this.replaceEnemy({ ...e, effects });
  }

  win(): void {
    if (this.over) return;
    this.statusValue = 'won';
  }

  lose(): void {
    if (this.over) return;
    this.statusValue = 'lost';
    this.emit({ type: 'lost', turn: this.base.turn + 1 });
  }

  countMove(): void {
    this.runStats = { ...this.runStats, moves: this.runStats.moves + 1 };
  }

  private replaceEnemy(next: EnemyState): void {
    this.enemyList = this.enemyList.map((e) => (e.id === next.id ? next : e));
  }

  /** Freezes the draft into a new immutable GameState. */
  finish(turnAdvanced: boolean): GameState {
    return {
      ...this.base,
      tiles: this.tiles,
      player: this.playerState,
      enemies: this.enemyList,
      gold: this.goldTotal,
      status: this.statusValue,
      stats: this.runStats,
      rng: this.rngState,
      turn: turnAdvanced ? this.base.turn + 1 : this.base.turn,
    };
  }
}
