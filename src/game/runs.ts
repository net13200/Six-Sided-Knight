/**
 * Multi-floor runs: Daily Roll (3 floors, same for everyone each UTC day) and
 * Depths (endless). A run generates each floor, carries HP between floors
 * (+1 heal), saves progress so leaving and coming back resumes it, and
 * prefetches the next floor while the current one is played.
 */
import type { LevelData } from '../engine';
import type { GenParams } from '../gen/generate';
import {
  DAILY_FLOORS,
  currentStreak,
  dailyFloorParams,
  healBetweenFloors,
  recordDaily,
} from '../meta/daily';
import { depthsFloorParams } from '../meta/depths';
import type { RunProgress } from '../meta/save';
import { newlyUnlocked, unlockedSkins, type SkinDef } from '../meta/skins';
import { STARTING_FACES, crownsForStars, earnCrowns, playerLoadout } from '../meta/store';
import type { Game } from './game';
import type { PlaySession } from './session';

/** Something played floor by floor (Daily Roll, Depths, a campaign Gauntlet). */
export interface FloorRun {
  /** Daily: the UTC date. Depths: the run seed. Gauntlet: the level id. */
  readonly key: string;
  /** Plays the current floor. */
  play(): Promise<void>;
}

export interface FloorSummary {
  readonly mode: 'daily' | 'depths' | 'gauntlet';
  /** Floor just cleared. */
  readonly floor: number;
  /** Total floors (daily), or null (endless). */
  readonly floors: number | null;
  readonly hp: number;
  readonly moves: number;
  readonly stars: number;
  readonly final: boolean;
  /** Daily: whether this completion counted for the streak (false = practice). */
  readonly counted: boolean;
  readonly streak: number;
  readonly bestFloor: number;
  readonly newBest: boolean;
  /** Crowns earned on this floor (first daily completion, or a new Depths record). */
  readonly crowns: number;
  /** Skins unlocked (a daily streak milestone). */
  readonly newSkins?: readonly SkinDef[];
}

export class Run implements FloorRun {
  private progress: RunProgress;

  constructor(
    private readonly game: Game,
    readonly mode: 'daily' | 'depths',
    progress: RunProgress,
    /** Practice runs (daily replays) don't save or count. */
    readonly practice = false,
  ) {
    this.progress = { ...progress };
  }

  get floor(): number {
    return this.progress.floor;
  }

  /** Daily: the UTC date. Depths: the run seed. */
  get key(): string {
    return this.progress.key;
  }

  /**
   * Runs are played with the player's custom die. Depths fixes it for the
   * whole run; the Daily Roll uses the current die on every floor, so the
   * player can change it between floors (the floors themselves never change).
   */
  static newDaily(game: Game, date: string, practice = false): Run {
    return new Run(game, 'daily', { key: date, floor: 1, hp: 5, moves: 0, stars: 0 }, practice);
  }

  static newDepths(game: Game, seed: number): Run {
    const die = playerLoadout(game.save.data);
    return new Run(game, 'depths', {
      key: String(seed),
      floor: 1,
      hp: 5,
      moves: 0,
      stars: 0,
      die,
    });
  }

  /** The die for the next floor. */
  get die(): readonly string[] {
    if (this.mode === 'daily') return playerLoadout(this.game.save.data);
    return this.progress.die ?? STARTING_FACES;
  }

  params(floor = this.progress.floor): GenParams {
    return this.mode === 'daily'
      ? dailyFloorParams(this.progress.key, floor, this.die)
      : depthsFloorParams(Number(this.progress.key), floor, this.die);
  }

  /** Generates (or fetches the prefetched) current floor, then starts playing it. */
  async play(): Promise<void> {
    this.persist();
    const { level, winnable } = await this.game.levelService.generate(this.params());
    this.game.goPlaySession(this.session(level, winnable !== false));
  }

  private session(level: LevelData, winnable = true): PlaySession {
    const p = this.progress;
    const title =
      this.mode === 'daily'
        ? `Daily Roll · floor ${p.floor}/${DAILY_FLOORS}${this.practice ? ' (practice)' : ''}`
        : `Depths · floor ${p.floor}`;
    return {
      mode: this.mode,
      level,
      startHp: p.hp,
      title,
      ...(winnable ? {} : { notice: "Your die can't win this floor. Change it in the Forge" }),
      campaignIndex: null,
      onStart: () => {
        const more = this.mode === 'depths' || p.floor < DAILY_FLOORS;
        if (more) this.game.levelService.prefetch(this.params(p.floor + 1));
      },
      onWin: (state, stars) => {
        const summary = this.floorCleared(state.stats.moves, state.player.hp, stars.count);
        return () => this.game.goFloor(summary, this);
      },
      onBack: () => (this.mode === 'daily' ? this.game.goDaily() : this.game.goDepths()),
    };
  }

  private floorCleared(moves: number, hp: number, stars: number): FloorSummary {
    const p = this.progress;
    p.moves += moves;
    p.stars += stars;
    p.hp = hp;
    const cleared = p.floor;
    const final = this.mode === 'daily' && cleared >= DAILY_FLOORS;
    const game = this.game;
    let counted = false;
    let newBest = false;
    let crowns = 0;
    const skinsBefore = unlockedSkins(game.save.data);

    if (this.mode === 'daily' && final) {
      const date = p.key;
      if (!this.practice) {
        game.save.update((d) => {
          counted = recordDaily(d, date, { moves: p.moves, hp: p.hp, stars: p.stars });
          if (counted) crowns = earnCrowns(d, crownsForStars(p.stars));
          d.daily.inProgress = null;
        });
      }
      if (counted) {
        game.analytics.track('daily_completed', { date, moves: p.moves, hp: p.hp });
        game.analytics.track('streak_length', { days: game.save.data.daily.streak });
      }
    } else {
      // More floors to go: heal and move on.
      p.floor += 1;
      p.hp = healBetweenFloors(p.hp);
      if (this.mode === 'depths') {
        game.save.update((d) => {
          newBest = cleared > d.depths.bestFloor;
          // Only floors past your record pay out, so an endless run can't be farmed.
          if (newBest) crowns = earnCrowns(d, crownsForStars(stars));
          d.depths.bestFloor = Math.max(d.depths.bestFloor, cleared);
        });
      }
      this.persist();
    }

    if (crowns > 0) game.analytics.track('crowns_earned', { amount: crowns, source: this.mode });
    const today = p.key;
    return {
      mode: this.mode,
      floor: cleared,
      floors: this.mode === 'daily' ? DAILY_FLOORS : null,
      hp: hp,
      moves: p.moves,
      stars: p.stars,
      final,
      counted,
      streak: this.mode === 'daily' ? currentStreak(game.save.data, today) : 0,
      bestFloor: game.save.data.depths.bestFloor,
      newBest,
      crowns,
      newSkins: newlyUnlocked(skinsBefore, unlockedSkins(game.save.data)),
    };
  }

  /** Saves the run so it can be resumed (not for practice runs). */
  private persist(): void {
    if (this.practice) return;
    const p = { ...this.progress };
    this.game.save.update((d) => {
      if (this.mode === 'daily') d.daily.inProgress = p;
      else d.depths.inProgress = p;
    });
  }

  /** Ends a Depths run (the player surfaces). */
  abandon(): void {
    if (this.mode !== 'depths') return;
    this.game.save.update((d) => (d.depths.inProgress = null));
  }
}
