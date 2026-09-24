/**
 * A campaign Gauntlet: a chapter finale of several floors played in a row.
 * HP carries over (+1 between floors, like runs), and the stars are earned
 * over the whole gauntlet: total moves within the summed par, no damage on
 * any floor, and every treasure on every floor.
 */
import type { GameState, LevelData } from '../engine';
import { healBetweenFloors } from '../meta/daily';
import type { Game } from './game';
import type { FloorRun, FloorSummary } from './runs';
import type { Lesson } from './lessons';
import type { PlaySession } from './session';
import { computeStars } from './stars';

export class Gauntlet implements FloorRun {
  private floor = 0;
  private hp = 5;
  private moves = 0;
  private damage = 0;
  private kills = 0;
  private gold = 0;
  private treasures = 0;
  private treasuresTotal = 0;
  private timeMs = 0;

  constructor(
    private readonly game: Game,
    private readonly index: number,
    private readonly floors: readonly LevelData[],
    /** The gauntlet's lesson, before the first floor (if not read yet). */
    private readonly lesson: Lesson | null = null,
  ) {}

  get key(): string {
    return this.floors[0]!.id;
  }

  /** Sum of the floors' par. */
  get par(): number {
    return this.floors.reduce((n, f) => n + (f.par ?? 0), 0);
  }

  /** Starts (or continues with) the current floor. */
  play(): Promise<void> {
    this.game.goPlaySession(this.session());
    return Promise.resolve();
  }

  private session(): PlaySession {
    const level = this.floors[this.floor]!;
    const n = this.floors.length;
    const first = this.floors[0]!;
    return {
      mode: 'campaign',
      level,
      startHp: this.hp,
      music: 'depths',
      title: `${this.index + 1}. ${first.name} · ${this.floor + 1}/${n}`,
      campaignIndex: this.index,
      lesson: this.floor === 0 ? this.lesson : null,
      onStart: () => this.game.save.update((d) => (d.lastLevelId = first.id)),
      onWin: (state, _stars, ms) => this.cleared(state, ms),
      onBack: () => this.game.goLevels(),
    };
  }

  private cleared(state: GameState, ms: number): () => void {
    const s = state.stats;
    this.moves += s.moves;
    this.damage += s.damageTaken;
    this.kills += s.kills;
    this.gold += state.gold;
    this.treasures += s.treasuresCollected;
    this.treasuresTotal += s.treasuresTotal;
    this.timeMs += ms;
    const cleared = this.floor + 1;
    if (cleared < this.floors.length) {
      this.floor = cleared;
      this.hp = healBetweenFloors(state.player.hp);
      const summary: FloorSummary = {
        mode: 'gauntlet',
        floor: cleared,
        floors: this.floors.length,
        hp: state.player.hp,
        moves: this.moves,
        stars: 0,
        final: false,
        counted: false,
        streak: 0,
        bestFloor: 0,
        newBest: false,
        crowns: 0,
      };
      return () => this.game.goFloor(summary, this);
    }
    // The whole gauntlet as one result.
    const total: GameState = {
      ...state,
      gold: this.gold,
      stats: {
        moves: this.moves,
        damageTaken: this.damage,
        kills: this.kills,
        treasuresCollected: this.treasures,
        treasuresTotal: this.treasuresTotal,
      },
    };
    const level = { ...this.floors[0]!, par: this.par };
    const stars = computeStars(level, total);
    const summary = this.game.recordWin(this.index, total, stars, this.timeMs);
    return () => this.game.goResults(this.index, total, { ...summary, par: this.par });
  }

  /** "Later" between floors: back to the map (the gauntlet starts over next time). */
  leave(): void {
    this.game.goLevels();
  }
}
