/**
 * The world map: Oddmere as one board, and you roll the die across it. Levels
 * are pedestals on a road; tap one (or any spot) and the die rolls there by
 * itself, and its card shows below, with Play. The arrow keys hop from level
 * to level. Beat a level and, next time you're on the map, the road to the
 * next one flips into place tile by tile and the die rolls along it.
 * Districts (one per chapter) stack from the village at the bottom to the
 * Well at the top; the Smith and the Daily Roll's notice board stand by the
 * start, the Well (the Depths) and the Greenwood past the last level. The
 * World button zooms out to every district and its stars; pick one and the
 * die is tossed there.
 */
import { IS_PORTAL } from '../../platform/target';
import { rollDie, type DieState, type Dir } from '../../engine';
import { t, tk } from '../../i18n';
import {
  CHAPTER_NAMES,
  CHAPTER_SIZE,
  isCompleted,
  isUnlocked,
  needsRedo,
} from '../../meta/progress';
import type { Game } from '../game';
import { gauntletPar } from '../gauntlet';
import type { Command } from '../input';
import { el, icon, iconButton, place } from '../ui';
import { drawFace } from '../view/art';
import { drawControls, sideCard, touchFirst, wrap } from '../view/backdrop';
import { cameraMatrix, drawCube3d, IDENTITY, matmul, rollRotation } from '../view/cube';
import { ease } from '../view/fx';
import { C } from '../view/palette';
import {
  BAND_ROWS,
  buildWorld,
  COLS,
  findPath,
  key,
  nearestOpen,
  stepFrom,
  TILE,
  TOP_ROWS,
  type Landmark,
  type LandmarkId,
  type Pos,
  type WorldLayout,
} from '../world/layout';
import { drawStar } from './common';
import type { Scene } from './scene';

const HUD_H = 62;
const CARD_Y = 358;
const VIEW_H = CARD_Y - HUD_H;
/** The road uses columns 1..9: shift the board half a tile left to centre it. */
const XOFF = -TILE / 2;
/** Seconds per tile: a step you make, and the die travelling by itself. */
const STEP_S = 0.16;
const TRAVEL_S = 0.085;
/** A revealed road: one tile flips every FLIP_GAP seconds, each flip taking FLIP_S. */
const FLIP_GAP = 0.11;
const FLIP_S = 0.3;
const DIE_CAMERA = cameraMatrix(-24, -52);

/** Each district's ground and scenery. */
const THEMES = [
  { ground: '#4c7a3f', dot: '#5c8c4c' }, // First Steps: fields
  { ground: '#c7dde6', dot: '#e3f0f5' }, // Deep Halls: frozen lake
  { ground: '#a08c62', dot: '#b39f73' }, // The Vaults: treasury stone
  { ground: '#76473a', dot: '#86564a' }, // Ember Keep: garrison earth
  { ground: '#6d9895', dot: '#7fa9a6' }, // Frost Crypt: frozen graveyard
  { ground: '#4d3d64', dot: '#5b4a74' }, // The Throne: palace
] as const;

const LANDMARK_NAME: Readonly<Record<LandmarkId, string>> = {
  smith: tk('Smith'),
  daily: tk('Daily Roll'),
  well: tk('The Depths'),
  greenwood: tk('The Greenwood'),
};
const LANDMARK_TEXT: Readonly<Record<LandmarkId, string>> = {
  smith: tk('Buy faces and build your own die.'),
  daily: tk('Three new floors every day, the same for everyone.'),
  well: tk('Endless floors down the Well. One life.'),
  greenwood: tk('The bonus chapter: the Eight-Sided Ranger.'),
};

/** A hash of a tile, 0..1 (scenery placement). */
function hash(c: number, r: number): number {
  let h = (c * 374761393 + r * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Roll {
  readonly dir: Dir;
  readonly from: Pos;
  readonly dur: number;
  t: number;
}

export class LevelsScene implements Scene {
  readonly name = 'levels';
  readonly backdrop = 'dungeon' as const;
  private readonly world: WorldLayout;
  private readonly unlocked: boolean[];
  private readonly open = new Set<string>();
  /** Tiles kept free of scenery (roads, pedestals, landmarks and next to them). */
  private readonly reserved = new Set<string>();
  /** Every road tile, landmark roads included (walls open there). */
  private readonly paved = new Set<string>();
  private readonly pedestalAt = new Map<string, number>();
  private readonly landmarkAt = new Map<string, Landmark>();
  private readonly roadSegment = new Map<string, number>();
  private pos: Pos;
  private die: DieState;
  private roll: Roll | null = null;
  private queue: Dir[] = [];
  private bump: { dir: Dir; t: number } | null = null;
  /** Open this landmark when the die arrives on it. */
  private goal: LandmarkId | null = null;
  private camY = 0;
  private camTarget: number | null = null;
  /** A finger (or mouse) dragging the map up or down; `moved`: it's a scroll, not a tap. */
  private drag: {
    id: number;
    y: number;
    cam: number;
    moved: boolean;
    v: number;
    t: number;
  } | null = null;
  /** The last gesture scrolled the map: its tap and click are not a tap. */
  private dragged = false;
  /** A flicked map keeps scrolling for a moment (logical px per second). */
  private fling = 0;
  private unbindScroll: (() => void) | null = null;
  private reveal: { segment: number; t: number; sounded: number } | null = null;
  private time = 0;
  private ui: HTMLElement | null = null;
  private readonly buttons: Array<{ pos: Pos; el: HTMLButtonElement }> = [];
  private playBtn: HTMLButtonElement | null = null;
  private announcer: HTMLElement | null = null;
  private lastCam = NaN;
  /** A toss to another district: wind-up, flight, then a bouncy landing. */
  private toss: {
    from: { x: number; y: number };
    to: Pos;
    t: number;
    dur: number;
    height: number;
    stage: 'windup' | 'fly' | 'land';
  } | null = null;
  /** Sparkles and dust (world coordinates). */
  private bits: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
    life: number;
    kind: 'spark' | 'dust' | 'star';
  }> = [];
  private sparkClock = 0;
  /** After rolling as far as the road goes toward a tap, bump toward it. */
  private bumpToward: Pos | null = null;
  /** The World view (every district at once). */
  private overview = false;
  private overviewT = 0;
  private overviewSel = 0;
  private worldBtn: HTMLButtonElement | null = null;
  private backBtn: HTMLElement | null = null;
  private readonly areaButtons: HTMLButtonElement[] = [];

  constructor(
    private readonly game: Game,
    /** The campaign level just left: the die stands on it. */
    at?: number,
  ) {
    const levels = game.levels;
    const save = game.save.data;
    this.world = buildWorld(levels.length, CHAPTER_SIZE);
    this.unlocked = levels.map((_, i) => isUnlocked(save, levels, i));
    const w = this.world;
    w.pedestals.forEach((p, i) => this.pedestalAt.set(key(p), i));
    w.segments.forEach((s, i) => s.forEach((p) => this.roadSegment.set(key(p), i)));
    for (const l of w.landmarks) this.landmarkAt.set(key(l.pos), l);
    const pave = (p: Pos) => {
      this.paved.add(key(p));
      this.reserved.add(key(p));
    };
    const reserve = (p: Pos) => {
      for (const [dc, dr] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        this.reserved.add(key({ c: p.c + dc, r: p.r + dr }));
    };
    // Scenery may stand right beside the road, just not on it (or around landmarks).
    w.pedestals.forEach(pave);
    w.segments.forEach((s) => s.forEach(pave));
    w.landmarks.forEach((l) => {
      l.road.forEach(pave);
      reserve(l.pos);
    });

    // The road to a newly opened level flips in once; others are already there.
    const pending = levels
      .map((l, i) => i)
      .filter((i) => i > 0 && this.unlocked[i] && !save.hints[`map:${levels[i]!.id}`]);
    if (pending.length) {
      game.save.update((d) => pending.forEach((i) => (d.hints[`map:${levels[i]!.id}`] = true)));
    }
    // Only the road into the level to play next flips in (after beating the one
    // before it); the rest, on a first visit after an update, is simply there.
    const next = game.continueIndex();
    const here = at !== undefined && at >= 0 && this.unlocked[at] ? at : undefined;
    // (Coming back from somewhere else than the level before it: no show, it's just there.)
    const reveal =
      pending.includes(next) && (here === undefined || here === next - 1) ? next : null;
    for (let i = 0; i < levels.length; i++) {
      if (!this.unlocked[i]) continue;
      this.open.add(key(w.pedestals[i]!));
      if (i !== reveal) w.segments[i]!.forEach((p) => this.open.add(key(p)));
    }
    if (reveal !== null) this.open.delete(key(w.pedestals[reveal]!));
    for (const l of w.landmarks) {
      if (this.landmarkOpen(l)) [...l.road, l.pos].forEach((p) => this.open.add(key(p)));
    }

    // The die: on the level just left, else on the level to play next (or,
    // while its road appears, the one before).
    const start = here ?? (reveal !== null ? reveal - 1 : next);
    this.pos = w.pedestals[Math.max(0, start)] ?? { c: 4, r: w.rows - 2 };
    const level = levels[Math.max(0, start)];
    this.die = {
      shape: game.rules.config.dieShape,
      loadout: level?.loadout ?? game.rules.config.defaultLoadout,
      orient: 0,
    };
    if (reveal !== null) this.reveal = { segment: reveal, t: -0.35, sounded: 0 };
    this.camY = this.followY();
  }

  exit(): void {
    this.unbindScroll?.();
  }

  /**
   * Dragging the map scrolls it (from anywhere in the view, a level button
   * included), and so does the mouse wheel. The die stays put; the camera
   * follows it again when it next moves.
   */
  private bindScroll(): void {
    const stage = this.game.stage;
    const inView = (e: PointerEvent | WheelEvent) => {
      const p = stage.toLogical(e.clientX, e.clientY);
      return p.x >= 0 && p.x <= 340 && p.y >= HUD_H && p.y < CARD_Y;
    };
    const down = (e: PointerEvent) => {
      this.dragged = false;
      if (this.drag || this.overview || this.toss || !inView(e)) return;
      this.fling = 0;
      this.drag = {
        id: e.pointerId,
        y: e.clientY,
        cam: this.camY,
        moved: false,
        v: 0,
        t: e.timeStamp,
      };
    };
    const move = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const dy = (e.clientY - d.y) / stage.scale;
      if (!d.moved && Math.abs(dy) < 8) return;
      d.moved = true;
      const cam = this.clampCam(d.cam - dy);
      const dt = Math.max(1, e.timeStamp - d.t) / 1000;
      d.v = d.v * 0.5 + ((cam - this.camY) / dt) * 0.5;
      d.t = e.timeStamp;
      this.camY = cam;
      this.camTarget = cam;
      this.syncButtons();
    };
    const up = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      if (!d.moved) return;
      this.dragged = true;
      if (!this.game.reducedMotion && e.timeStamp - d.t < 80) this.fling = d.v;
    };
    // A scroll that ended on a level button doesn't press it.
    const click = (e: MouseEvent) => {
      if (!this.dragged) return;
      this.dragged = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const wheel = (e: WheelEvent) => {
      if (this.overview || this.toss || !inView(e)) return;
      e.preventDefault();
      const px =
        e.deltaMode === 1 ? e.deltaY * 34 : e.deltaMode === 2 ? e.deltaY * VIEW_H : e.deltaY;
      this.fling = 0;
      this.camTarget = this.clampCam((this.camTarget ?? this.camY) + px / stage.scale);
    };
    const opts = { capture: true };
    window.addEventListener('pointerdown', down, opts);
    window.addEventListener('pointermove', move, opts);
    window.addEventListener('pointerup', up, opts);
    window.addEventListener('pointercancel', up, opts);
    window.addEventListener('click', click, opts);
    window.addEventListener('wheel', wheel, { capture: true, passive: false });
    this.unbindScroll = () => {
      window.removeEventListener('pointerdown', down, opts);
      window.removeEventListener('pointermove', move, opts);
      window.removeEventListener('pointerup', up, opts);
      window.removeEventListener('pointercancel', up, opts);
      window.removeEventListener('click', click, opts);
      window.removeEventListener('wheel', wheel, opts);
    };
  }

  private landmarkOpen(l: Landmark): boolean {
    return l.when === 'always' || this.game.bonusUnlocked;
  }

  // ---------- layout helpers ----------

  private get maxCam(): number {
    return this.world.rows * TILE - VIEW_H;
  }

  private clampCam(y: number): number {
    return Math.max(0, Math.min(this.maxCam, y));
  }

  /** Camera that keeps the die a little below the middle. */
  private followY(): number {
    const y = this.dieXY().y;
    return this.clampCam(y - VIEW_H * 0.58);
  }

  private dieXY(): { x: number; y: number; lift: number } {
    const base = { x: this.pos.c * TILE + TILE / 2, y: this.pos.r * TILE + TILE / 2 };
    if (!this.roll) return { ...base, lift: 0 };
    const k = Math.min(1, this.roll.t);
    const to = stepFrom(this.roll.from, this.roll.dir);
    return {
      x: (this.roll.from.c + (to.c - this.roll.from.c) * k) * TILE + TILE / 2,
      y: (this.roll.from.r + (to.r - this.roll.from.r) * k) * TILE + TILE / 2,
      lift: Math.sin(Math.PI * k) * 5,
    };
  }

  /** The chapter whose district is in the middle of the view. */
  private viewChapter(): number {
    const row = (this.camY + VIEW_H / 2) / TILE;
    const bands = this.world.bands;
    for (const b of bands) if (row >= b.top && row < b.top + BAND_ROWS) return b.chapter;
    return row < TOP_ROWS ? bands.length - 1 : 0;
  }

  private selectedLevel(): number | null {
    if (this.roll || this.toss) return null;
    const i = this.pedestalAt.get(key(this.pos));
    return i !== undefined && this.unlocked[i] ? i : null;
  }

  private selectedLandmark(): Landmark | null {
    if (this.roll || this.toss) return null;
    return this.landmarkAt.get(key(this.pos)) ?? null;
  }

  // ---------- scene ----------

  enter(ui: HTMLElement): void {
    this.ui = ui;
    this.bindScroll();
    const levels = this.game.levels;
    const save = this.game.save.data;
    this.announcer = el('div', { className: 'sr-only', testId: 'map-announcer' });
    this.announcer.setAttribute('role', 'status');
    this.announcer.setAttribute('aria-live', 'polite');
    ui.append(this.announcer);

    // Invisible buttons over the pedestals and landmarks (screen readers, tests, taps).
    levels.forEach((level, i) => {
      const unlocked = this.unlocked[i]!;
      const stars = save.levels[level.id]?.stars;
      const floors = this.game.gauntlets.get(level.id);
      const b = el('button', {
        className: 'map-spot',
        testId: `level-${i + 1}`,
        label: unlocked
          ? t('Level {n}: {name}', { n: i + 1, name: t(level.name) }) +
            (floors ? t(', gauntlet of {n} floors', { n: floors.length + 1 }) : '') +
            (isCompleted(save, level) ? t(', {n} of 3 stars', { n: stars ?? 0 }) : '') +
            (needsRedo(save, level) ? t(', changed: solve it again') : '')
          : t('Level {n}, locked', { n: i + 1 }),
        onClick: () => this.travelTo(this.world.pedestals[i]!),
      });
      b.disabled = !unlocked;
      this.buttons.push({ pos: this.world.pedestals[i]!, el: b });
      ui.append(b);
    });
    for (const l of this.world.landmarks) {
      if (!this.landmarkOpen(l)) continue;
      const b = el('button', {
        className: 'map-spot',
        testId: `landmark-${l.id}`,
        label: t(LANDMARK_NAME[l.id]),
        onClick: () => this.travelTo(l.pos, l.id),
      });
      this.buttons.push({ pos: l.pos, el: b });
      ui.append(b);
    }

    // The World view's districts: pick one and the die is tossed there.
    this.world.bands.forEach((band) => {
      const ch = band.chapter;
      const open = this.chapterOpen(ch);
      const { got, max } = this.chapterStars(ch);
      const name = t(CHAPTER_NAMES[ch] ?? '');
      const b = el('button', {
        className: 'map-spot',
        testId: `area-${ch + 1}`,
        label: open
          ? t('{name}, {n} of {max} stars', { name, n: got, max })
          : t('{name}, locked', { name }),
        onClick: () => this.tossTo(ch),
      });
      b.disabled = !open;
      b.style.display = 'none';
      const g = this.region(ch);
      place(b, g.cx - g.rx, g.cy - g.ry + 4, g.rx * 2, g.ry * 2 - 8);
      this.areaButtons.push(b);
      ui.append(b);
    });
    this.worldBtn = iconButton('map', t('World'), () => this.setOverview(!this.overview), 'world');
    this.playBtn = el('button', {
      className: 'btn primary',
      testId: 'map-play',
      onClick: () => this.play(),
    });
    ui.append(
      place(this.worldBtn, 2, 1, 60, 60),
      (this.backBtn = place(
        iconButton('back', t('Menu'), () => this.game.goMenu(), 'back'),
        4,
        414,
        64,
        62,
      )),
      place(this.playBtn, 74, 416, 262, 60),
    );
    this.syncCard();
    this.syncButtons(true);
  }

  /** Starts the selected level, or opens the landmark the die stands on. */
  private play(): void {
    if (this.reveal) return;
    const i = this.selectedLevel();
    if (i !== null) {
      // No ad here: Play on the map is navigation (portal ad rules).
      this.game.goPlay(i);
      return;
    }
    const l = this.selectedLandmark();
    if (l) this.openLandmark(l.id);
  }

  private openLandmark(id: LandmarkId): void {
    if (id === 'smith') this.game.goForge(() => this.game.goLevels());
    else if (id === 'daily') this.game.goDaily();
    else if (id === 'well') this.game.goDepths();
    else this.game.goRangerMap();
  }

  /** Rolls the die along the road to `to` (fast), then selects what's there. */
  private travelTo(to: Pos, goal: LandmarkId | null = null): void {
    if (this.reveal || this.toss) return;
    const from = this.roll ? stepFrom(this.roll.from, this.roll.dir) : this.pos;
    const path = findPath(this.open, from, to);
    if (!path) return;
    this.queue = path;
    this.goal = goal;
    this.camTarget = null;
    this.fling = 0;
    if (!this.roll) this.nextStep();
    if (!path.length && !this.roll) this.arrive();
  }

  private nextStep(): void {
    const dir = this.queue.shift();
    if (!dir) return;
    const dur = this.queue.length > 30 ? 0.045 : this.queue.length > 0 ? TRAVEL_S : STEP_S;
    this.roll = { dir, from: this.pos, dur, t: 0 };
    this.syncCard();
  }

  private arrive(): void {
    this.syncCard();
    const i = this.selectedLevel();
    const l = this.selectedLandmark();
    if (i !== null) {
      const level = this.game.levels[i]!;
      this.die = { ...this.die, loadout: level.loadout ?? this.game.rules.config.defaultLoadout };
      this.say(t('Level {n}: {name}', { n: i + 1, name: t(level.name) }));
    } else if (l) {
      this.say(t(LANDMARK_NAME[l.id]));
      if (this.goal === l.id) {
        this.goal = null;
        this.openLandmark(l.id);
      }
    }
    this.goal = null;
    if (this.bumpToward) {
      const dc = this.bumpToward.c - this.pos.c;
      const dr = this.bumpToward.r - this.pos.r;
      this.bumpToward = null;
      if (dc || dr) {
        const dir: Dir = Math.abs(dc) > Math.abs(dr) ? (dc > 0 ? 'E' : 'W') : dr > 0 ? 'S' : 'N';
        this.bump = { dir, t: 0 };
        this.game.audio.play('bump');
      }
    }
  }

  // ---------- the World view and the toss ----------

  private chapterOpen(ch: number): boolean {
    return this.unlocked[ch * CHAPTER_SIZE] === true;
  }

  private chapterStars(ch: number): { got: number; max: number } {
    const levels = this.game.levels.slice(ch * CHAPTER_SIZE, (ch + 1) * CHAPTER_SIZE);
    const save = this.game.save.data;
    return {
      got: levels.reduce((n, l) => n + (save.levels[l.id]?.stars ?? 0), 0),
      max: levels.length * 3,
    };
  }

  /**
   * A district's island on the World view's map: they wind up the page,
   * left and right in turn, from the village at the bottom to the Throne.
   */
  private region(ch: number): { cx: number; cy: number; rx: number; ry: number } {
    const n = this.world.bands.length;
    const top = 124;
    const bottom = 434;
    const cy = n > 1 ? bottom - ((bottom - top) * ch) / (n - 1) : (top + bottom) / 2;
    return { cx: ch % 2 ? 230 : 110, cy, rx: 94, ry: 39 };
  }

  /** Level k (0-9) of a district on the map: a U around the island, entering from below. */
  private regionPoint(ch: number, k: number): { x: number; y: number } {
    const g = this.region(ch);
    const deg = ch % 2 ? 150 - (k * 300) / 9 : 30 + (k * 300) / 9;
    const a = (deg * Math.PI) / 180;
    return { x: g.cx + g.rx * 0.72 * Math.cos(a), y: g.cy + g.ry * 0.56 * Math.sin(a) };
  }

  /** The Well on the map, past the last district. */
  private wellPoint(): { x: number; y: number } {
    return { x: 80, y: 96 };
  }

  /** The chapter the die is in. */
  private dieChapter(): number {
    const r = this.pos.r;
    for (const b of this.world.bands) if (r >= b.top && r < b.top + BAND_ROWS) return b.chapter;
    return r < TOP_ROWS ? this.world.bands.length - 1 : 0;
  }

  private setOverview(on: boolean): void {
    if (this.reveal || this.toss) return;
    this.overview = on;
    if (on) this.overviewSel = this.dieChapter();
    this.worldBtn?.replaceChildren(
      icon(on ? 'close' : 'map'),
      el('span', { text: on ? t('Close') : t('World') }),
    );
    this.worldBtn?.setAttribute('aria-label', on ? t('Close') : t('World'));
    for (const b of this.areaButtons) b.style.display = on ? '' : 'none';
    if (this.playBtn) this.playBtn.style.display = on ? 'none' : '';
    if (this.backBtn) this.backBtn.style.display = on ? 'none' : '';
    this.syncButtons(true);
    if (on) this.areaButtons[this.overviewSel]?.focus();
  }

  /** Where the die lands in a district: its first unbeaten level, else its first. */
  private landingIn(ch: number): Pos | null {
    const save = this.game.save.data;
    const levels = this.game.levels;
    let first: number | null = null;
    for (let i = ch * CHAPTER_SIZE; i < Math.min(levels.length, (ch + 1) * CHAPTER_SIZE); i++) {
      if (!this.unlocked[i]) break;
      first ??= i;
      if (!isCompleted(save, levels[i]!) || needsRedo(save, levels[i]!))
        return this.world.pedestals[i]!;
    }
    return first === null ? null : this.world.pedestals[first]!;
  }

  /** Picks a district in the World view: the die is tossed there. */
  private tossTo(ch: number): void {
    const to = this.landingIn(ch);
    this.setOverview(false);
    if (!to || this.roll || this.queue.length) return;
    if (key(to) === key(this.pos)) return;
    const from = this.dieXY();
    const dist = Math.hypot(to.c * TILE + TILE / 2 - from.x, to.r * TILE + TILE / 2 - from.y);
    this.camTarget = null;
    if (this.game.reducedMotion) {
      this.land(to);
      return;
    }
    this.toss = {
      from: { x: from.x, y: from.y },
      to,
      t: 0,
      dur: Math.min(1.5, 0.75 + dist / 3000),
      height: Math.min(170, 60 + dist * 0.06),
      stage: 'windup',
    };
    this.game.audio.play('click');
  }

  private land(to: Pos): void {
    this.pos = to;
    // A 180° spin on the way: the die comes down turned over twice (east).
    this.die = rollDie(rollDie(this.die, 'E'), 'E');
    this.arrive();
  }

  private updateToss(dt: number): void {
    const s = this.toss!;
    s.t += dt;
    if (s.stage === 'windup' && s.t >= 0.2) {
      s.stage = 'fly';
      s.t = 0;
      this.game.audio.play('pull');
    } else if (s.stage === 'fly') {
      // A sparkle trail behind the die.
      this.sparkClock += dt;
      if (this.sparkClock > 0.035) {
        this.sparkClock = 0;
        const p = this.tossXY();
        this.bits.push({
          x: p.x + (Math.random() - 0.5) * 10,
          y: p.y - p.h + (Math.random() - 0.5) * 10,
          vx: 0,
          vy: 10,
          t: 0,
          life: 0.45,
          kind: 'spark',
        });
      }
      if (s.t >= s.dur) {
        s.stage = 'land';
        s.t = 0;
        this.game.audio.play('bump');
        const x = s.to.c * TILE + TILE / 2;
        const y = s.to.r * TILE + TILE / 2;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          this.bits.push({
            x,
            y: y + 6,
            vx: Math.cos(a) * 40,
            vy: Math.sin(a) * 16,
            t: 0,
            life: 0.5,
            kind: 'dust',
          });
        }
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.5;
          this.bits.push({
            x,
            y: y - 12,
            vx: Math.cos(a) * 60,
            vy: Math.sin(a) * 60,
            t: 0,
            life: 0.6,
            kind: 'star',
          });
        }
      }
    } else if (s.stage === 'land') {
      // Two little hops: a clack on each.
      const before = s.t - dt;
      if (before < 0.24 && s.t >= 0.24) this.game.audio.play('click');
      if (before < 0.4 && s.t >= 0.4) this.game.audio.play('click');
      if (s.t >= 0.5) {
        this.toss = null;
        this.land(s.to);
      }
    }
  }

  /** The die's ground position and height during a toss. */
  private tossXY(): { x: number; y: number; h: number; p: number } {
    const s = this.toss!;
    const tx = s.to.c * TILE + TILE / 2;
    const ty = s.to.r * TILE + TILE / 2;
    if (s.stage === 'windup') return { x: s.from.x, y: s.from.y, h: 0, p: 0 };
    if (s.stage === 'land') {
      // Bounces: 10 px, then 4.
      const k = s.t;
      const h =
        k < 0.24
          ? Math.sin((k / 0.24) * Math.PI) * 10
          : k < 0.4
            ? Math.sin(((k - 0.24) / 0.16) * Math.PI) * 4
            : 0;
      return { x: tx, y: ty, h, p: 1 };
    }
    const p = Math.min(1, s.t / s.dur);
    const q = ease.inOut(p);
    return {
      x: s.from.x + (tx - s.from.x) * q,
      y: s.from.y + (ty - s.from.y) * q,
      h: Math.sin(Math.PI * p) * s.height,
      p,
    };
  }

  private updateBits(dt: number): void {
    for (const b of this.bits) {
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 0.92;
      b.vy = b.kind === 'star' ? b.vy + 160 * dt : b.vy * 0.92;
    }
    this.bits = this.bits.filter((b) => b.t < b.life);
  }

  private say(text: string): void {
    if (!this.announcer) return;
    this.announcer.textContent = '';
    this.announcer.textContent = text;
  }

  command(cmd: Command): void {
    if (this.overview) {
      const n = this.world.bands.length;
      if (cmd.type === 'back') this.setOverview(false);
      else if (cmd.type === 'confirm') this.tossTo(this.overviewSel);
      else if (cmd.type === 'move' && (cmd.dir === 'N' || cmd.dir === 'S')) {
        // Up is the next district (they're stacked, the last on top).
        let sel = this.overviewSel;
        do sel = Math.max(0, Math.min(n - 1, sel + (cmd.dir === 'N' ? 1 : -1)));
        while (!this.chapterOpen(sel) && sel > 0 && cmd.dir === 'N' && sel < n - 1);
        if (this.chapterOpen(sel)) this.overviewSel = sel;
        this.areaButtons[this.overviewSel]?.focus();
      } else if (cmd.type === 'tap') {
        // The island under the tap (the nearest centre where two overlap).
        let best: number | null = null;
        let bestD = 1;
        for (const b of this.world.bands) {
          const g = this.region(b.chapter);
          const d = Math.hypot((cmd.x - g.cx) / g.rx, (cmd.y - g.cy) / g.ry);
          if (d < bestD) [best, bestD] = [b.chapter, d];
        }
        if (best !== null && this.chapterOpen(best)) this.tossTo(best);
      }
      return;
    }
    if (cmd.type === 'back') {
      this.game.goMenu();
      return;
    }
    if (this.reveal || this.toss) return;
    if (cmd.type === 'confirm') this.play();
    else if (cmd.type === 'move') {
      // No rolling tile by tile: you tap where to go. Swipes do nothing here;
      // the arrow keys hop to the next (up/right) or previous level.
      if (cmd.swipe || this.roll || this.queue.length) return;
      const here = this.pedestalAt.get(key(this.pos));
      const step = cmd.dir === 'N' || cmd.dir === 'E' ? 1 : -1;
      const from = here ?? (step > 0 ? -1 : this.unlocked.length);
      let i = from + step;
      while (i >= 0 && i < this.unlocked.length && !this.unlocked[i]) i += step;
      if (i >= 0 && i < this.unlocked.length && this.unlocked[i]) {
        this.travelTo(this.world.pedestals[i]!);
      } else {
        this.bump = { dir: cmd.dir, t: 0 };
        this.game.audio.play('bump');
      }
    } else if (cmd.type === 'tap') {
      if (cmd.y < HUD_H || cmd.y >= CARD_Y || this.dragged) return;
      const c = Math.floor((cmd.x - XOFF) / TILE);
      const r = Math.floor((cmd.y - HUD_H + this.camY) / TILE);
      const k = key({ c, r });
      const l = this.landmarkAt.get(k);
      if (l && this.landmarkOpen(l)) this.travelTo(l.pos, l.id);
      else if (this.open.has(k)) this.travelTo({ c, r });
      else {
        // Grass, scenery or a locked level: as close as the road goes.
        const from = this.roll ? stepFrom(this.roll.from, this.roll.dir) : this.pos;
        const near = nearestOpen(this.open, { c, r }, from);
        if (!near) return;
        this.travelTo(near);
        this.bumpToward = { c, r };
        if (key(near) === key(this.pos) && !this.roll) this.arrive();
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.bump) {
      this.bump.t += dt / 0.18;
      if (this.bump.t >= 1) this.bump = null;
    }
    if (this.reveal) this.updateReveal(dt);
    if (this.toss) this.updateToss(dt);
    this.updateBits(dt);
    this.overviewT = Math.max(0, Math.min(1, this.overviewT + (this.overview ? dt : -dt) * 7));
    if (this.roll) {
      this.roll.t += dt / this.roll.dur;
      if (this.roll.t >= 1) {
        const { dir } = this.roll;
        this.pos = stepFrom(this.roll.from, dir);
        this.die = rollDie(this.die, dir);
        this.roll = null;
        this.game.audio.play('roll');
        if (this.queue.length) this.nextStep();
        else this.arrive();
      }
    }
    if (this.fling && this.camTarget !== null) {
      this.camTarget = this.clampCam(this.camTarget + this.fling * dt);
      this.fling *= Math.exp(-dt * 4);
      if (Math.abs(this.fling) < 20 || this.camTarget <= 0 || this.camTarget >= this.maxCam) {
        this.fling = 0;
      }
    }
    const target = this.toss
      ? this.clampCam(this.tossXY().y - VIEW_H * 0.58 - this.tossXY().h * 0.4)
      : (this.camTarget ?? this.followY());
    const k =
      this.game.reducedMotion || this.drag?.moved ? 1 : Math.min(1, dt * (this.toss ? 9 : 7));
    this.camY += (target - this.camY) * k;
    if (Math.abs(target - this.camY) < 0.3) this.camY = target;
    this.syncButtons();
  }

  private updateReveal(dt: number): void {
    const r = this.reveal!;
    const tiles = this.world.segments[r.segment]!;
    r.t += this.game.reducedMotion ? 1 : dt;
    const flipping = Math.floor(r.t / FLIP_GAP);
    while (r.sounded <= flipping && r.sounded < tiles.length && r.t >= 0) {
      this.game.audio.play('click', 0);
      r.sounded++;
    }
    if (r.t >= tiles.length * FLIP_GAP + FLIP_S) {
      tiles.forEach((p) => this.open.add(key(p)));
      const ped = this.world.pedestals[r.segment]!;
      this.open.add(key(ped));
      this.reveal = null;
      this.game.audio.play('unlock');
      this.travelTo(ped);
    }
  }

  /** Keeps the invisible buttons over what they stand for; off-view ones are taken out. */
  private syncButtons(force = false): void {
    if (!force && Math.abs(this.camY - this.lastCam) < 0.5) return;
    this.lastCam = this.camY;
    for (const { pos, el: b } of this.buttons) {
      // A bit bigger than the tile: touch targets stay at least 44 px on small phones.
      const y = HUD_H + pos.r * TILE - this.camY;
      place(b, pos.c * TILE + XOFF - 13, y - 13, TILE + 26, TILE + 26);
      b.style.display = !this.overview && y > HUD_H - 6 && y + TILE < CARD_Y + 6 ? '' : 'none';
    }
  }

  private syncCard(): void {
    if (!this.playBtn) return;
    const i = this.selectedLevel();
    const l = this.selectedLandmark();
    const label = i !== null ? t('Play') : l ? t('Enter') : t('Play');
    this.playBtn.replaceChildren(icon('play'), el('span', { text: label }));
    this.playBtn.disabled = (i === null && !l) || !!this.reveal || !!this.toss;
  }

  // ---------- drawing ----------

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#17141f';
    ctx.fillRect(0, 0, 340, 480);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD_H, 340, VIEW_H);
    ctx.clip();
    ctx.translate(XOFF, HUD_H - Math.round(this.camY));
    const r0 = Math.max(0, Math.floor(this.camY / TILE) - 1);
    const r1 = Math.min(this.world.rows - 1, Math.ceil((this.camY + VIEW_H) / TILE) + 1);
    this.drawGround(ctx, r0, r1);
    this.drawRoads(ctx, r0, r1);
    this.drawLandmarks(ctx, r0, r1);
    this.drawPedestals(ctx, r0, r1);
    this.drawFolk(ctx, r0, r1);
    this.drawDie(ctx);
    this.drawBits(ctx);
    ctx.restore();
    this.drawHud(ctx);
    this.drawCard(ctx);
    if (this.overviewT > 0) this.drawOverview(ctx);
  }

  private themeOf(r: number): number {
    for (const b of this.world.bands) if (r >= b.top && r < b.top + BAND_ROWS) return b.chapter;
    return r < TOP_ROWS ? -1 : 0;
  }

  private drawGround(ctx: CanvasRenderingContext2D, r0: number, r1: number): void {
    for (let r = r0; r <= r1; r++) {
      const th = this.themeOf(r);
      const theme = th < 0 ? { ground: '#221c33', dot: '#2d2542' } : THEMES[th % THEMES.length]!;
      ctx.fillStyle = theme.ground;
      ctx.fillRect(-TILE, r * TILE, 340 + 2 * TILE, TILE + 1);
      for (let c = 0; c <= COLS; c++) {
        const h = hash(c, r);
        const x = c * TILE;
        const y = r * TILE;
        ctx.fillStyle = theme.dot;
        ctx.fillRect(x + 6 + h * 20, y + 8 + ((h * 97) % 1) * 18, 5, 2.5);
        if (!this.reserved.has(key({ c, r })) && h > 0.8) this.drawScenery(ctx, th, c, r, h);
      }
    }
    // District walls, with a gap where the road goes through.
    for (const b of this.world.bands) {
      const r = b.top;
      if (r < r0 || r > r1) continue;
      for (let c = 0; c <= COLS; c++) {
        if (this.paved.has(key({ c, r }))) continue;
        const x = c * TILE;
        const y = r * TILE;
        ctx.fillStyle = '#5a5268';
        ctx.fillRect(x, y + 6, TILE, TILE - 12);
        ctx.fillStyle = '#6f6680';
        ctx.fillRect(x + 1, y + 6, TILE / 2 - 2, 9);
        ctx.fillRect(x + TILE / 2 + 1, y + 17, TILE / 2 - 2, 9);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y + TILE - 6, TILE, 4);
      }
    }
  }

  private drawScenery(
    ctx: CanvasRenderingContext2D,
    th: number,
    c: number,
    r: number,
    h: number,
  ): void {
    const x = c * TILE + TILE / 2;
    const y = r * TILE + TILE / 2;
    const kind = Math.floor(((h - 0.8) / 0.2) * 3);
    ctx.save();
    ctx.translate(x, y);
    if (th === -1) {
      // Night sky above the Well: little stars.
      ctx.fillStyle = 'rgba(255,241,176,0.8)';
      ctx.fillRect(-1, -1, 2, 2);
    } else if (th === 0) {
      if (kind === 0) this.bush(ctx, '#3d6b35', '#2e5429');
      else if (kind === 1) this.flowers(ctx);
      else this.fence(ctx);
    } else if (th === 1) {
      if (kind === 2) this.pine(ctx, '#3f6b58', true);
      else this.snowMound(ctx);
    } else if (th === 2) {
      if (kind === 0) this.goldPile(ctx);
      else this.statue(ctx);
    } else if (th === 3) {
      if (kind === 0) this.tower(ctx);
      else this.rocks(ctx, '#5c3429');
    } else if (th === 4) {
      if (kind === 0) this.pine(ctx, '#3b5f5c', true);
      else this.grave(ctx);
    } else {
      this.pillar(ctx);
    }
    ctx.restore();
  }

  // Scenery pieces, drawn around (0,0) in a tile.
  private bush(ctx: CanvasRenderingContext2D, fill: string, dark: string): void {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 6, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    for (const [dx, dy, rr] of [
      [-5, 0, 7],
      [5, 1, 6],
      [0, -4, 7],
    ] as const) {
      ctx.beginPath();
      ctx.arc(dx, dy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private flowers(ctx: CanvasRenderingContext2D): void {
    for (const [dx, dy, col] of [
      [-6, -3, '#ffd75e'],
      [4, 2, '#f4b39c'],
      [-1, 6, '#ece6d6'],
      [7, -5, '#ffd75e'],
    ] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(dx, dy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private fence(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#8a6a3f';
    ctx.fillRect(-14, -4, 28, 3);
    ctx.fillRect(-14, 3, 28, 3);
    ctx.fillStyle = '#6b5130';
    ctx.fillRect(-11, -8, 4, 16);
    ctx.fillRect(7, -8, 4, 16);
  }

  private pine(ctx: CanvasRenderingContext2D, fill: string, snow: boolean): void {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const w = 7 + i * 3;
      const top = -14 + i * 7;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(-w, top + 10);
      ctx.lineTo(w, top + 10);
      ctx.closePath();
      ctx.fill();
      if (snow) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.moveTo(0, top);
        ctx.lineTo(-w * 0.4, top + 4);
        ctx.lineTo(w * 0.4, top + 4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private snowMound(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#eef7fa';
    ctx.beginPath();
    ctx.ellipse(0, 4, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a9ccd8';
    ctx.beginPath();
    ctx.ellipse(-6, -6, 7, 3, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  private goldPile(ctx: CanvasRenderingContext2D): void {
    for (const [dx, dy] of [
      [-6, 4],
      [4, 5],
      [-1, -1],
      [6, -2],
      [-6, -4],
    ] as const) {
      ctx.fillStyle = '#c9a22e';
      ctx.beginPath();
      ctx.arc(dx, dy + 1, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(dx, dy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private statue(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#6f6680';
    ctx.fillRect(-9, 4, 18, 8);
    ctx.fillStyle = '#8c8398';
    ctx.beginPath();
    ctx.roundRect(-7, -12, 14, 17, 4);
    ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(-4, -7, 3, 2);
    ctx.fillRect(1, -7, 3, 2);
  }

  private tower(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-9, 10, 20, 4);
    ctx.fillStyle = '#6d6480';
    ctx.fillRect(-9, -8, 18, 20);
    ctx.fillStyle = '#7b728f';
    for (let i = 0; i < 3; i++) ctx.fillRect(-9 + i * 7, -13, 4, 6);
    ctx.fillStyle = '#231d2b';
    ctx.fillRect(-2, -2, 4, 7);
    ctx.fillStyle = C.hurt;
    ctx.fillRect(9, -12, 8, 5);
  }

  private rocks(ctx: CanvasRenderingContext2D, fill: string): void {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(-4, 3, 8, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(6, 5, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private grave(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-8, 8, 16, 4);
    ctx.fillStyle = '#9aa7b0';
    ctx.beginPath();
    ctx.roundRect(-7, -10, 14, 19, [7, 7, 1, 1]);
    ctx.fill();
    ctx.fillStyle = '#6f7d87';
    ctx.fillRect(-1, -6, 2, 8);
    ctx.fillRect(-4, -3, 8, 2);
  }

  private pillar(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-8, 10, 18, 4);
    ctx.fillStyle = '#8f7fae';
    ctx.fillRect(-6, -12, 12, 24);
    ctx.fillStyle = '#a597c2';
    ctx.fillRect(-8, -14, 16, 4);
    ctx.fillRect(-8, 10, 16, 3);
    ctx.fillStyle = C.gold;
    ctx.fillRect(-1, -20, 2, 5);
  }

  private stone(ctx: CanvasRenderingContext2D, x: number, y: number, scaleY = 1): void {
    const h = (TILE - 8) * scaleY;
    ctx.fillStyle = '#625a72';
    ctx.beginPath();
    ctx.roundRect(x + 3, y + TILE / 2 - h / 2 + 1, TILE - 6, h + 4, 6);
    ctx.fill();
    ctx.fillStyle = '#9a92a8';
    ctx.beginPath();
    ctx.roundRect(x + 3, y + TILE / 2 - h / 2 - 1, TILE - 6, h, 6);
    ctx.fill();
  }

  private pipFace(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scaleY: number,
    n: number,
  ): void {
    const h = (TILE - 8) * scaleY;
    ctx.fillStyle = '#b8ae98';
    ctx.beginPath();
    ctx.roundRect(x + 3, y + TILE / 2 - h / 2 + 1, TILE - 6, h + 4, 6);
    ctx.fill();
    ctx.fillStyle = '#ece6d6';
    ctx.beginPath();
    ctx.roundRect(x + 3, y + TILE / 2 - h / 2 - 1, TILE - 6, h, 6);
    ctx.fill();
    ctx.save();
    ctx.translate(x + TILE / 2, y + TILE / 2 - 1);
    ctx.scale(1, scaleY);
    drawFace(ctx, `Pip${n}`, 0, 0, 20);
    ctx.restore();
  }

  private drawRoads(ctx: CanvasRenderingContext2D, r0: number, r1: number): void {
    const visible = (p: Pos) => p.r >= r0 && p.r <= r1;
    const frontier = this.unlocked.lastIndexOf(true);
    this.world.segments.forEach((seg, i) => {
      const revealing = this.reveal?.segment === i;
      seg.forEach((p, k) => {
        if (!visible(p)) return;
        const x = p.c * TILE;
        const y = p.r * TILE;
        if (revealing) {
          const f = (this.reveal!.t - k * FLIP_GAP) / FLIP_S;
          if (f <= 0) this.dashed(ctx, x, y, 'rgba(236,230,214,0.35)');
          else if (f >= 1) this.stone(ctx, x, y);
          else {
            const s = Math.abs(Math.cos(Math.PI * f));
            const lift = Math.sin(Math.PI * f) * 8;
            if (f < 0.5) this.pipFace(ctx, x, y - lift, s, (k % 6) + 1);
            else this.stone(ctx, x, y - lift, s);
          }
        } else if (this.unlocked[i]) this.stone(ctx, x, y);
        else if (i === frontier + 1) this.dashed(ctx, x, y, 'rgba(236,230,214,0.28)');
        else this.track(ctx, x, y);
      });
    });
    for (const l of this.world.landmarks) {
      if (!this.landmarkOpen(l)) continue;
      for (const p of l.road)
        if (visible(p) && !this.pedestalAt.has(key(p))) this.stone(ctx, p.c * TILE, p.r * TILE);
    }
  }

  /** A faint stone on the road ahead, so its way can be seen. */
  private track(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.beginPath();
    ctx.roundRect(x + 8, y + 9, TILE - 16, TILE - 18, 5);
    ctx.fill();
  }

  private dashed(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 5, TILE - 8, TILE - 10, 6);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawPedestals(ctx: CanvasRenderingContext2D, r0: number, r1: number): void {
    const save = this.game.save.data;
    const levels = this.game.levels;
    const next = this.game.continueIndex();
    this.world.pedestals.forEach((p, i) => {
      if (p.r < r0 || p.r > r1) return;
      const level = levels[i]!;
      const x = p.c * TILE + TILE / 2;
      const y = p.r * TILE + TILE / 2;
      const hidden =
        this.reveal?.segment === i && this.reveal.t < this.world.segments[i]!.length * FLIP_GAP;
      const unlocked = this.unlocked[i] && !hidden;
      const stars = save.levels[level.id]?.stars ?? 0;
      const done = isCompleted(save, level);
      const gauntlet = this.game.gauntlets.has(level.id);
      let top = '#3a3550';
      let edge = '#231d2b';
      if (unlocked && done && stars === 3) [top, edge] = [C.gold, '#8a6414'];
      else if (unlocked && done) [top, edge] = ['#b3a8c9', '#6d6480'];
      else if (unlocked) [top, edge] = ['#ece6d6', '#8d86a0'];
      if (gauntlet) {
        // Gatehouse towers either side.
        ctx.fillStyle = unlocked ? '#7b728f' : '#4a4358';
        ctx.fillRect(x - 19, y - 16, 7, 24);
        ctx.fillRect(x + 12, y - 16, 7, 24);
        ctx.fillRect(x - 20, y - 19, 3, 4);
        ctx.fillRect(x - 15, y - 19, 3, 4);
        ctx.fillRect(x + 12, y - 19, 3, 4);
        ctx.fillRect(x + 17, y - 19, 3, 4);
      }
      if (unlocked && !done && i === next) {
        const pulse = this.game.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 4);
        ctx.fillStyle = `rgba(255,215,94,${0.18 + 0.2 * pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.roundRect(x - 14, y - 11, 28, 24, 8);
      ctx.fill();
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.roundRect(x - 14, y - 14, 28, 22, 8);
      ctx.fill();
      if (unlocked) {
        ctx.fillStyle = '#231d2b';
        ctx.font = '800 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x, y - 2.5);
      }
      if (unlocked && done) {
        for (let s = 0; s < 3; s++) drawStar(ctx, x - 9 + s * 9, y + 16, 3.6, s < stars);
      }
      if (unlocked && needsRedo(save, level)) {
        ctx.fillStyle = C.heal;
        ctx.beginPath();
        ctx.roundRect(x - 14, y - 26, 28, 11, 5);
        ctx.fill();
        ctx.fillStyle = '#10240f';
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('NEW'), x, y - 20, 26);
      }
      // A district all at ★★★: a gold medal with a check by its last level.
      if (
        i % CHAPTER_SIZE === CHAPTER_SIZE - 1 &&
        this.districtGold(Math.floor(i / CHAPTER_SIZE))
      ) {
        drawCompleteMedal(ctx, x + 26, y - 14, 9, this.game.reducedMotion ? 0 : this.time);
      }
    });
  }

  private districtGold(chapter: number): boolean {
    const levels = this.game.levels.slice(chapter * CHAPTER_SIZE, (chapter + 1) * CHAPTER_SIZE);
    const save = this.game.save.data;
    return (
      levels.length > 0 &&
      levels.every((l) => (save.levels[l.id]?.stars ?? 0) === 3 && !needsRedo(save, l))
    );
  }

  private drawLandmarks(ctx: CanvasRenderingContext2D, r0: number, r1: number): void {
    for (const l of this.world.landmarks) {
      const p = l.pos;
      if (p.r < r0 - 2 || p.r > r1 + 2) continue;
      const x = p.c * TILE + TILE / 2;
      const y = p.r * TILE + TILE / 2;
      const open = this.landmarkOpen(l);
      ctx.save();
      ctx.translate(x, y);
      if (l.id === 'smith') this.forge(ctx);
      else if (l.id === 'daily') this.noticeBoard(ctx);
      else if (l.id === 'well') this.well(ctx, open);
      else this.greenwood(ctx, open);
      ctx.restore();
      if (open || l.id === 'well')
        this.pill(ctx, t(LANDMARK_NAME[l.id]), x, y + 26, l.id === 'daily' ? C.gold : C.text);
    }
  }

  private pill(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
  ): void {
    ctx.font = 'bold 10px system-ui, sans-serif';
    const w = Math.min(96, ctx.measureText(text).width + 12);
    const cx = Math.max(w / 2 + 2, Math.min(338 - w / 2, x));
    ctx.fillStyle = 'rgba(20,18,28,0.85)';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y - 7, w, 14, 7);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, y + 0.5, w - 8);
  }

  private forge(ctx: CanvasRenderingContext2D): void {
    const puff = this.game.reducedMotion ? 0 : (this.time * 0.6) % 1;
    ctx.fillStyle = `rgba(236,230,214,${0.35 * (1 - puff)})`;
    ctx.beginPath();
    ctx.arc(6 + puff * 4, -26 - puff * 14, 4 + puff * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#463a30';
    ctx.fillRect(3, -24, 6, 10);
    ctx.fillStyle = '#9c4a2e';
    ctx.beginPath();
    ctx.moveTo(-18, -8);
    ctx.lineTo(0, -20);
    ctx.lineTo(18, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#463a30';
    ctx.fillRect(-15, 8, 30, 5);
    ctx.fillStyle = '#6b5a4c';
    ctx.fillRect(-15, -8, 30, 17);
    const glow = this.game.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(this.time * 7);
    ctx.fillStyle = `rgba(255,157,58,${glow})`;
    ctx.beginPath();
    ctx.roundRect(-5, -3, 10, 12, [5, 5, 0, 0]);
    ctx.fill();
  }

  private noticeBoard(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#5e4726';
    ctx.fillRect(-13, -2, 3, 16);
    ctx.fillRect(10, -2, 3, 16);
    ctx.fillStyle = '#5e4726';
    ctx.fillRect(-16, -15, 32, 20);
    ctx.fillStyle = '#a07c4a';
    ctx.fillRect(-16, -17, 32, 20);
    ctx.save();
    ctx.rotate(-0.06);
    ctx.fillStyle = '#ece6d6';
    ctx.fillRect(-12, -14, 11, 13);
    ctx.restore();
    ctx.save();
    ctx.rotate(0.05);
    ctx.fillStyle = C.gold;
    ctx.fillRect(2, -14, 10, 11);
    ctx.restore();
  }

  private well(ctx: CanvasRenderingContext2D, open: boolean): void {
    const glow = this.game.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 2);
    const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 44);
    g.addColorStop(0, `rgba(160,120,255,${0.35 + 0.2 * glow})`);
    g.addColorStop(1, 'rgba(160,120,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-46, -46, 92, 92);
    ctx.fillStyle = '#6d6480';
    ctx.beginPath();
    ctx.ellipse(0, 2, 24, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d86a0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0d0b14';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!open) {
      // Not yet: the Queen's chair still stands over it.
      ctx.fillStyle = '#5b4a74';
      ctx.fillRect(-8, -24, 16, 20);
      ctx.fillStyle = C.gold;
      ctx.fillRect(-8, -27, 16, 4);
    }
  }

  private greenwood(ctx: CanvasRenderingContext2D, open: boolean): void {
    for (const [dx, dy] of [
      [-14, -6],
      [0, -12],
      [13, -4],
      [-6, 6],
      [9, 8],
    ] as const) {
      ctx.save();
      ctx.translate(dx, dy);
      this.pine(ctx, '#2c5a33', false);
      ctx.restore();
    }
    if (!open) {
      ctx.fillStyle = 'rgba(200,205,220,0.7)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 30, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The townsfolk: dice dozing around each district, awake once it's all gold. */
  private drawFolk(ctx: CanvasRenderingContext2D, r0: number, r1: number): void {
    const colors = ['#e3dccb', '#f1d78e', '#b8e6b9', '#b3cff5'];
    for (const band of this.world.bands) {
      if (band.top > r1 || band.top + BAND_ROWS < r0) continue;
      const awake = this.districtGold(band.chapter);
      let placed = 0;
      for (let r = band.top + 1; r < band.top + BAND_ROWS && placed < 3; r++) {
        for (let c = 0; c < COLS && placed < 3; c++) {
          const h = hash(c + 50, r + 7);
          if (h < 0.93 || this.reserved.has(key({ c, r })) || hash(c, r) > 0.8) continue;
          if (r < r0 || r > r1) {
            placed++;
            continue;
          }
          const x = c * TILE + TILE / 2;
          const y = r * TILE + TILE / 2;
          const hop =
            awake && !this.game.reducedMotion ? Math.abs(Math.sin(this.time * 4 + c)) * 6 : 0;
          ctx.save();
          ctx.translate(x, y - hop);
          ctx.rotate(awake ? 0 : -0.15);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.roundRect(-9, -7, 18, 18, 4);
          ctx.fill();
          ctx.fillStyle = colors[placed % colors.length]!;
          ctx.beginPath();
          ctx.roundRect(-9, -10, 18, 18, 4);
          ctx.fill();
          ctx.fillStyle = '#231d2b';
          ctx.beginPath();
          ctx.arc(-4, -5, 1.8, 0, Math.PI * 2);
          ctx.arc(4, 3, 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (!awake) {
            const z = this.game.reducedMotion ? 0 : (this.time * 0.8 + c * 0.3) % 1;
            ctx.fillStyle = `rgba(236,230,214,${0.8 * (1 - z)})`;
            ctx.font = '800 9px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('z', x + 10 + z * 4, y - 14 - z * 10);
          }
          placed++;
        }
      }
    }
  }

  private drawDie(ctx: CanvasRenderingContext2D): void {
    if (this.toss) {
      this.drawTossedDie(ctx);
      return;
    }
    const { x, y, lift } = this.dieXY();
    let bx = 0;
    let by = 0;
    if (this.bump) {
      const s = Math.sin(Math.PI * this.bump.t) * 3;
      const d = stepFrom({ c: 0, r: 0 }, this.bump.dir);
      bx = d.c * s;
      by = d.r * s;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 9, 13 - lift, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const model = this.roll ? rollRotation(this.roll.dir, Math.min(1, this.roll.t)) : IDENTITY;
    drawCube3d(ctx, this.die, x + bx, y - 8 - lift + by, 19, DIE_CAMERA, model);
  }

  private drawTossedDie(ctx: CanvasRenderingContext2D): void {
    const s = this.toss!;
    const { x, y, h, p } = this.tossXY();
    // Shadow on the ground: smaller and fainter the higher the die flies.
    const far = Math.min(1, h / 120);
    ctx.fillStyle = `rgba(0,0,0,${0.3 - 0.18 * far})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 9, 13 * (1 - 0.5 * far), 5 * (1 - 0.5 * far), 0, 0, Math.PI * 2);
    ctx.fill();
    // Squash and stretch: crouch before the jump, stretch in the air, squish on landing.
    let sx: number;
    let sy: number;
    if (s.stage === 'windup') {
      const w = Math.sin((s.t / 0.2) * Math.PI * 0.5);
      sx = 1 + 0.22 * w;
      sy = 1 - 0.25 * w;
    } else if (s.stage === 'fly') {
      const k = p < 0.15 ? 1 - p / 0.15 : 0;
      sx = 1 - 0.12 * k;
      sy = 1 + 0.18 * k;
    } else {
      const k = Math.max(0, 1 - s.t / 0.14);
      sx = 1 + 0.3 * k;
      sy = 1 - 0.28 * k;
    }
    const grow = 1 + h / 260;
    const model =
      s.stage === 'fly'
        ? matmul(rollRotation('N', 4 * ease.inOut(p)), rollRotation('E', 2 * ease.inOut(p)))
        : s.stage === 'land'
          ? matmul(rollRotation('N', 4), rollRotation('E', 2))
          : IDENTITY;
    ctx.save();
    ctx.translate(x, y + 2 - h);
    ctx.scale(sx * grow, sy * grow);
    drawCube3d(ctx, this.die, 0, -10, 19, DIE_CAMERA, model);
    ctx.restore();
    if (s.stage === 'windup') {
      // A little "!" pops up before the jump.
      const k = Math.min(1, s.t / 0.12);
      ctx.fillStyle = C.gold;
      ctx.font = `900 ${10 + 6 * k}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', x + 14, y - 34 - 4 * k);
    }
  }

  private drawBits(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bits) {
      const k = 1 - b.t / b.life;
      if (b.kind === 'dust') {
        ctx.fillStyle = `rgba(236,230,214,${0.5 * k})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3 + (1 - k) * 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const r = b.kind === 'star' ? 4 * k + 1 : 2.5 * k;
        ctx.fillStyle =
          b.kind === 'star' ? `rgba(255,215,94,${k})` : `rgba(255,241,176,${0.9 * k})`;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const rr = i % 2 ? r * 0.4 : r;
          ctx.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /** The World view: a map of Oddmere, the road winding through each district to the Throne. */
  private drawOverview(ctx: CanvasRenderingContext2D): void {
    const a = this.game.reducedMotion ? (this.overview ? 1 : 0) : this.overviewT;
    const INK = '#5b4630';
    const top = HUD_H;
    const h = 480 - HUD_H;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, (1 - a) * 10);
    // Parchment, darker toward its edges, with a double ink border.
    ctx.fillStyle = '#e6d5ae';
    ctx.fillRect(0, top, 340, h);
    const vg = ctx.createRadialGradient(170, top + h / 2, 120, 170, top + h / 2, 300);
    vg.addColorStop(0, 'rgba(120,90,50,0)');
    vg.addColorStop(1, 'rgba(120,90,50,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, top, 340, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(5, top + 5, 330, h - 10);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(9, top + 9, 322, h - 18);

    const n = this.world.bands.length;
    const inIsland = (x: number, y: number) =>
      this.world.bands.some((b) => {
        const g = this.region(b.chapter);
        return Math.hypot((x - g.cx) / g.rx, (y - g.cy) / g.ry) < 1.15;
      });
    // The sea: little ink waves.
    ctx.strokeStyle = 'rgba(91,70,48,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = 20 + hash(i, 3) * 300;
      const y = top + 16 + hash(i, 9) * (h - 32);
      if (inIsland(x, y)) continue;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.quadraticCurveTo(x - 3, y - 3, x, y);
      ctx.quadraticCurveTo(x + 3, y + 3, x + 6, y);
      ctx.stroke();
    }

    // The islands, back to front (the Throne first, so lower ones overlap it).
    const save = this.game.save.data;
    const dieCh = this.dieChapter();
    for (let ch = n - 1; ch >= 0; ch--) this.drawIsland(ctx, ch, INK);

    // The road: through every level, district to district, up to the Well.
    const pts: Array<{ x: number; y: number; i: number }> = [];
    for (let ch = 0; ch < n; ch++) {
      for (let k = 0; k < CHAPTER_SIZE; k++) {
        const i = ch * CHAPTER_SIZE + k;
        if (i >= this.game.levels.length) break;
        pts.push({ ...this.regionPoint(ch, k), i });
      }
    }
    const well = this.wellPoint();
    ctx.lineCap = 'round';
    for (let j = 0; j < pts.length; j++) {
      const p = pts[j]!;
      const q = j + 1 < pts.length ? pts[j + 1]! : null;
      const to = q ?? well;
      const walked = q ? this.unlocked[q.i] : this.game.bonusUnlocked;
      ctx.strokeStyle = walked ? INK : 'rgba(91,70,48,0.35)';
      ctx.lineWidth = walked ? 2 : 1.5;
      ctx.setLineDash(walked ? [4, 3] : [2, 4]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // One dot per level: gold for ★★★, lilac beaten, white open, faint locked.
    for (const p of pts) {
      const level = this.game.levels[p.i]!;
      const stars = save.levels[level.id]?.stars ?? 0;
      const done = isCompleted(save, level) && !needsRedo(save, level);
      const open = this.unlocked[p.i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = !open
        ? 'rgba(230,213,174,0.9)'
        : done
          ? stars === 3
            ? '#e8ad1c'
            : '#a58fce'
          : '#fffaf0';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = open ? INK : 'rgba(91,70,48,0.4)';
      ctx.stroke();
    }
    this.drawMapWell(ctx, well.x, well.y, INK);

    // You are here: the die, bobbing on its level.
    const at = this.pedestalAt.get(key(this.pos));
    const g0 = this.region(dieCh);
    const here =
      at !== undefined
        ? this.regionPoint(Math.floor(at / CHAPTER_SIZE), at % CHAPTER_SIZE)
        : { x: g0.cx, y: g0.cy + g0.ry * 0.6 };
    const bob = this.game.reducedMotion ? 0 : Math.abs(Math.sin(this.time * 3)) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(here.x, here.y + 2, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawCube3d(ctx, this.die, here.x, here.y - 9 - bob, 10, DIE_CAMERA);

    this.drawCompass(ctx, 300, 448, INK);
    ctx.restore();
  }

  /** One district on the map: its island, name, stars and a bit of its scenery. */
  private drawIsland(ctx: CanvasRenderingContext2D, ch: number, ink: string): void {
    const g = this.region(ch);
    const open = this.chapterOpen(ch);
    const theme = THEMES[ch % THEMES.length]!;
    const shape = () => {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const t2 = (i / 24) * Math.PI * 2;
        const wob = 1 + 0.07 * Math.sin(3 * t2 + ch * 1.7) + 0.05 * Math.sin(5 * t2 + ch * 2.9);
        const x = g.cx + Math.cos(t2) * g.rx * wob;
        const y = g.cy + Math.sin(t2) * g.ry * wob;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    // Shallows around the coast, then the land.
    ctx.save();
    ctx.translate(g.cx, g.cy);
    ctx.scale(1.08, 1.12);
    ctx.translate(-g.cx, -g.cy);
    shape();
    ctx.fillStyle = 'rgba(120,160,170,0.25)';
    ctx.fill();
    ctx.restore();
    shape();
    ctx.fillStyle = theme.ground;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // A little of the district's scenery at either end.
    for (const [dx, dy] of [
      [-0.8, -0.2],
      [0.8, 0.25],
    ] as const) {
      ctx.save();
      ctx.translate(g.cx + dx * g.rx, g.cy + dy * g.ry);
      ctx.scale(0.62, 0.62);
      if (ch === 0) this.bush(ctx, '#3d6b35', '#2e5429');
      else if (ch === 1) this.pine(ctx, '#3f6b58', true);
      else if (ch === 2) this.goldPile(ctx);
      else if (ch === 3) this.tower(ctx);
      else if (ch === 4) this.grave(ctx);
      else this.pillar(ctx);
      ctx.restore();
    }
    if (!open) {
      // Not reached yet: fog and hatching.
      ctx.fillStyle = 'rgba(230,213,174,0.55)';
      ctx.fillRect(g.cx - g.rx - 10, g.cy - g.ry - 10, g.rx * 2 + 20, g.ry * 2 + 20);
      ctx.strokeStyle = 'rgba(91,70,48,0.22)';
      ctx.lineWidth = 1;
      for (let x = -g.ry * 2; x < g.rx * 2 + g.ry * 2; x += 7) {
        ctx.beginPath();
        ctx.moveTo(g.cx - g.rx + x, g.cy - g.ry - 4);
        ctx.lineTo(g.cx - g.rx + x - g.ry * 2, g.cy + g.ry + 4);
        ctx.stroke();
      }
    }
    ctx.restore();
    shape();
    const sel = this.overview && ch === this.overviewSel;
    ctx.strokeStyle = sel ? '#e8ad1c' : ink;
    ctx.lineWidth = sel ? 3 : 1.6;
    ctx.stroke();

    // The label: a little banner with the name and the stars.
    const { got, max } = this.chapterStars(ch);
    const name = t(CHAPTER_NAMES[ch] ?? '');
    const complete = open && this.districtGold(ch);
    ctx.font = '800 11px system-ui, sans-serif';
    const w = Math.min(112, Math.max(64, ctx.measureText(name).width + 16));
    ctx.fillStyle = complete
      ? '#f6cf5a'
      : open
        ? 'rgba(250,244,228,0.92)'
        : 'rgba(230,213,174,0.95)';
    ctx.beginPath();
    ctx.roundRect(g.cx - w / 2, g.cy - 15, w, 28, 6);
    ctx.fill();
    ctx.strokeStyle = complete ? '#8a5a08' : ink;
    ctx.lineWidth = complete ? 1.8 : 1;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = open ? ink : 'rgba(91,70,48,0.55)';
    ctx.fillText(name, g.cx, g.cy - 6, w - 8);
    if (open) {
      ctx.font = 'bold 10px system-ui, sans-serif';
      const text = `${got}/${max}`;
      const tw = ctx.measureText(text).width;
      drawStar(ctx, g.cx - tw / 2 - 5, g.cy + 6.5, 4, got > 0);
      ctx.fillStyle = complete ? '#6b4404' : '#a0700c';
      ctx.fillText(text, g.cx + 4, g.cy + 7);
    } else {
      // A padlock.
      ctx.strokeStyle = 'rgba(91,70,48,0.7)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(g.cx - 4.5, g.cy + 3, 9, 7, 1.5);
      ctx.moveTo(g.cx - 2.5, g.cy + 3);
      ctx.arc(g.cx, g.cy + 2.5, 2.5, Math.PI, 0);
      ctx.lineTo(g.cx + 2.5, g.cy + 3);
      ctx.stroke();
    }
    if (complete) {
      // Every level at ★★★: the banner turns gold and gets a medal with a check.
      drawCompleteMedal(
        ctx,
        g.cx + w / 2 + 2,
        g.cy - 14,
        9,
        this.game.reducedMotion ? 0 : this.time,
      );
    }
  }

  private drawMapWell(ctx: CanvasRenderingContext2D, x: number, y: number, ink: string): void {
    const open = this.game.bonusUnlocked;
    if (open) {
      const glow = ctx.createRadialGradient(x, y, 4, x, y, 26);
      glow.addColorStop(0, 'rgba(150,110,240,0.45)');
      glow.addColorStop(1, 'rgba(150,110,240,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 26, y - 26, 52, 52);
    }
    ctx.fillStyle = '#8d86a0';
    ctx.beginPath();
    ctx.ellipse(x, y, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#1a1424';
    ctx.beginPath();
    ctx.ellipse(x, y, 9, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('The Well'), x, y + 17, 90);
  }

  private drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number, ink: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = i % 2 ? ink : '#b08d57';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(3.5, 0);
      ctx.lineTo(-3.5, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = ink;
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -21);
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#1d1a28';
    ctx.fillRect(0, 0, 340, HUD_H);
    ctx.fillStyle = '#3a3550';
    ctx.fillRect(0, HUD_H - 1, 340, 1);
    const ch = this.viewChapter();
    const levels = this.game.levels.slice(ch * CHAPTER_SIZE, (ch + 1) * CHAPTER_SIZE);
    const save = this.game.save.data;
    const got = levels.reduce((n, l) => n + (save.levels[l.id]?.stars ?? 0), 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textDim;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(t('Chapter {n}', { n: ch + 1 }).toUpperCase(), 170, 16, 200);
    ctx.fillStyle = C.gold;
    ctx.font = '800 17px system-ui, sans-serif';
    ctx.fillText(t(CHAPTER_NAMES[ch] ?? ''), 170, 34, 200);
    drawStar(ctx, 156, 51, 4, true);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const stars = `${got} / ${levels.length * 3}`;
    ctx.fillText(stars, 163, 51.5);
    if (this.districtGold(ch))
      drawCompleteMedal(ctx, 172 + ctx.measureText(stars).width, 50, 5.5, 0);
  }

  private drawCard(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#1d1a28';
    ctx.fillRect(0, CARD_Y, 340, 480 - CARD_Y);
    ctx.fillStyle = '#3a3550';
    ctx.fillRect(0, CARD_Y, 340, 1);
    const i = this.selectedLevel();
    const l = this.selectedLandmark();
    ctx.textBaseline = 'middle';
    if (i !== null) {
      const level = this.game.levels[i]!;
      const rec = this.game.save.data.levels[level.id];
      const done = isCompleted(this.game.save.data, level);
      ctx.fillStyle = '#2e2940';
      ctx.beginPath();
      ctx.roundRect(10, CARD_Y + 8, 34, 34, 9);
      ctx.fill();
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = C.gold;
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), 27, CARD_Y + 25.5);
      ctx.textAlign = 'left';
      ctx.fillStyle = C.text;
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.fillText(t(level.name), 52, CARD_Y + 18, 200);
      ctx.fillStyle = C.textDim;
      ctx.font = '11px system-ui, sans-serif';
      const floors = this.game.gauntlets.get(level.id);
      // A gauntlet's par is for the whole run, never one floor's.
      const parN = floors ? gauntletPar([level, ...floors]) : level.par;
      const par = parN !== undefined ? t('Par {n}', { n: parN }) : '';
      const sub = needsRedo(this.game.save.data, level)
        ? t('Changed: solve it again')
        : done && rec
          ? `${par} · ${t('your best {n} moves', { n: rec.bestMoves })}`
          : floors
            ? `${par} · ${t('Gauntlet: {n} floors in a row', { n: floors.length + 1 })}`
            : `${par} · ${t('Not played yet')}`;
      ctx.fillText(sub, 52, CARD_Y + 34, 206);
      const stars = done ? (rec?.stars ?? 0) : 0;
      for (let s = 0; s < 3; s++) drawStar(ctx, 282 + s * 20, CARD_Y + 25, 7, s < stars);
    } else if (l) {
      ctx.textAlign = 'left';
      ctx.fillStyle = C.gold;
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.fillText(t(LANDMARK_NAME[l.id]), 12, CARD_Y + 17, 316);
      ctx.fillStyle = C.textDim;
      ctx.font = '11px system-ui, sans-serif';
      wrap(ctx, t(LANDMARK_TEXT[l.id]), 12, CARD_Y + 33, 316, 13);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = C.textDim;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(t('Roll to a level, or tap one'), 170, CARD_Y + 25, 316);
    }
  }

  /** Wide screens: the district's progress on the left, controls on the right. */
  renderSide(ctx: CanvasRenderingContext2D, side: 'left' | 'right', w: number, h: number): void {
    const cardH = 230;
    ctx.save();
    ctx.translate(0, (h - cardH) / 2);
    if (side === 'left') {
      const ch = this.viewChapter();
      const levels = this.game.levels.slice(ch * CHAPTER_SIZE, (ch + 1) * CHAPTER_SIZE);
      const save = this.game.save.data;
      let y = sideCard(ctx, w, cardH, t('Chapter {n}', { n: ch + 1 }));
      ctx.fillStyle = C.text;
      ctx.font = '800 20px system-ui, sans-serif';
      ctx.textAlign = 'left';
      y = wrap(ctx, t(CHAPTER_NAMES[ch] ?? ''), 16, y + 4, w - 32, 24);
      const got = levels.reduce((n, l) => n + (save.levels[l.id]?.stars ?? 0), 0);
      const done = levels.filter((l) => isCompleted(save, l)).length;
      ctx.fillStyle = C.textDim;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(t('{n}/{max} levels', { n: done, max: levels.length }), 16, y + 12);
      drawStar(ctx, 24, y + 42, 8, true);
      ctx.fillStyle = C.gold;
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.fillText(`${got} / ${levels.length * 3}`, 40, y + 43);
    } else {
      const y = sideCard(ctx, w, cardH, t('How to play'));
      drawControls(
        ctx,
        w,
        y + 4,
        touchFirst()
          ? [[t('Tap'), t('Roll to that level')]]
          : [
              ['← ↑ → ↓', t('Hop to the next or previous level')],
              ['Enter', t('Play the level you are on')],
              // Portals: Esc only leaves fullscreen there.
              ...(IS_PORTAL ? [] : [['Esc', t('Back to the menu')] as const]),
            ],
      );
    }
    ctx.restore();
  }
}

/**
 * A district's "all done" mark: a round gold medal with a big check and two
 * ribbon tails. A slow shine runs across it (`time` 0 holds it still).
 */
function drawCompleteMedal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  time: number,
): void {
  ctx.save();
  // Ribbon tails.
  ctx.fillStyle = '#c0392b';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * r * 0.2, y + r * 0.3);
    ctx.lineTo(x + side * r * 0.85, y + r * 1.55);
    ctx.lineTo(x + side * r * 0.45, y + r * 1.35);
    ctx.lineTo(x + side * r * 0.2, y + r * 1.7);
    ctx.lineTo(x - side * r * 0.1, y + r * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  // The medal.
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#8a5a08';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.84, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd75e';
  ctx.fill();
  if (time) {
    // A shine sweeping across now and then.
    const k = (time * 0.5) % 2;
    if (k < 1) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.translate(x - r * 2 + k * r * 4, y);
      ctx.rotate(0.5);
      ctx.fillRect(-r * 0.2, -r * 2, r * 0.4, r * 4);
      ctx.restore();
    }
  }
  // The check.
  ctx.strokeStyle = '#6b4404';
  ctx.lineWidth = Math.max(1.4, r * 0.28);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45, y + r * 0.02);
  ctx.lineTo(x - r * 0.1, y + r * 0.38);
  ctx.lineTo(x + r * 0.5, y - r * 0.35);
  ctx.stroke();
  ctx.restore();
}
