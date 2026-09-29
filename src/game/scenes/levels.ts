/**
 * The world map: Oddmere as one board, and you roll the die across it. Levels
 * are pedestals on a road; roll onto one (swipe, arrow keys, or tap it and
 * the die rolls there by itself) and its card shows below, with Play. Beat a
 * level and, next time you're on the map, the road to the next one flips into
 * place tile by tile and the die rolls along it. Districts (one per chapter)
 * stack from the village at the bottom to the Well at the top; the Smith and
 * the Daily Roll's notice board stand by the start, the Well (the Depths) and
 * the Greenwood past the last level.
 */
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
import type { Command } from '../input';
import { el, icon, iconButton, place } from '../ui';
import { drawFace } from '../view/art';
import { drawControls, sideCard, touchFirst, wrap } from '../view/backdrop';
import { cameraMatrix, drawCube3d, IDENTITY, rollRotation } from '../view/cube';
import { C } from '../view/palette';
import {
  BAND_ROWS,
  buildWorld,
  COLS,
  findPath,
  key,
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
  private reveal: { segment: number; t: number; sounded: number } | null = null;
  private time = 0;
  private ui: HTMLElement | null = null;
  private readonly buttons: Array<{ pos: Pos; el: HTMLButtonElement }> = [];
  private playBtn: HTMLButtonElement | null = null;
  private announcer: HTMLElement | null = null;
  private lastCam = NaN;

  constructor(
    private readonly game: Game,
    /** Look at this chapter's district first (the die stays where it is). */
    private readonly chapter?: number,
  ) {
    const levels = game.levels;
    const save = game.save.data;
    this.world = buildWorld(levels.length, CHAPTER_SIZE);
    this.unlocked = levels.map((_, i) => isUnlocked(save, levels, i));
    const w = this.world;
    w.pedestals.forEach((p, i) => this.pedestalAt.set(key(p), i));
    w.segments.forEach((s, i) => s.forEach((p) => this.roadSegment.set(key(p), i)));
    for (const l of w.landmarks) this.landmarkAt.set(key(l.pos), l);
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
    w.pedestals.forEach(reserve);
    w.segments.forEach((s) => s.forEach(reserve));
    w.landmarks.forEach((l) => [l.pos, ...l.road].forEach(reserve));

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
    const reveal = pending.includes(next) ? next : null;
    for (let i = 0; i < levels.length; i++) {
      if (!this.unlocked[i]) continue;
      this.open.add(key(w.pedestals[i]!));
      if (i !== reveal) w.segments[i]!.forEach((p) => this.open.add(key(p)));
    }
    if (reveal !== null) this.open.delete(key(w.pedestals[reveal]!));
    for (const l of w.landmarks) {
      if (this.landmarkOpen(l)) [...l.road, l.pos].forEach((p) => this.open.add(key(p)));
    }

    // The die: on the level to play next (or, while its road appears, the one before).
    const start = reveal !== null ? reveal - 1 : next;
    this.pos = w.pedestals[Math.max(0, start)] ?? { c: 4, r: w.rows - 2 };
    const level = levels[Math.max(0, start)];
    this.die = {
      shape: game.rules.config.dieShape,
      loadout: level?.loadout ?? game.rules.config.defaultLoadout,
      orient: 0,
    };
    if (reveal !== null) this.reveal = { segment: reveal, t: -0.35, sounded: 0 };
    this.camY = this.followY();
    if (chapter !== undefined) {
      this.camY = this.bandY(chapter);
      this.camTarget = this.camY;
    }
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

  /** Camera showing a district from its start (past the last one: the Well). */
  private bandY(chapter: number): number {
    if (chapter >= this.world.bands.length) return 0;
    const band = this.world.bands[chapter];
    if (!band) return this.camY;
    return this.clampCam((band.top + BAND_ROWS) * TILE - VIEW_H);
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
    if (this.roll) return null;
    const i = this.pedestalAt.get(key(this.pos));
    return i !== undefined && this.unlocked[i] ? i : null;
  }

  private selectedLandmark(): Landmark | null {
    if (this.roll) return null;
    return this.landmarkAt.get(key(this.pos)) ?? null;
  }

  // ---------- scene ----------

  enter(ui: HTMLElement): void {
    this.ui = ui;
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

    const chapters = this.world.bands.length;
    const look = (d: number) => {
      // Past the last district: the top of the world (the Well).
      const now = this.camY < TOP_ROWS * TILE ? chapters : this.viewChapter();
      const ch = Math.max(0, Math.min(chapters, now + d));
      this.camTarget = this.bandY(ch);
    };
    this.playBtn = el('button', {
      className: 'btn primary',
      testId: 'map-play',
      onClick: () => this.play(),
    });
    ui.append(
      place(
        iconButton('back', t('Prev'), () => look(-1), 'chapter-prev'),
        2,
        1,
        60,
        60,
      ),
      place(
        iconButton('next', t('Next'), () => look(1), 'chapter-next'),
        278,
        1,
        60,
        60,
      ),
      place(
        iconButton('back', t('Menu'), () => this.game.goMenu(), 'back'),
        4,
        414,
        64,
        62,
      ),
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
      this.game.breakThen('map-level', () => this.game.goPlay(i), i);
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
    if (this.reveal) return;
    const from = this.roll ? stepFrom(this.roll.from, this.roll.dir) : this.pos;
    const path = findPath(this.open, from, to);
    if (!path) return;
    this.queue = path;
    this.goal = goal;
    this.camTarget = null;
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
  }

  private say(text: string): void {
    if (!this.announcer) return;
    this.announcer.textContent = '';
    this.announcer.textContent = text;
  }

  command(cmd: Command): void {
    if (cmd.type === 'back') {
      this.game.goMenu();
      return;
    }
    if (this.reveal) return;
    if (cmd.type === 'confirm') this.play();
    else if (cmd.type === 'move') {
      if (this.roll || this.queue.length) return;
      const to = stepFrom(this.pos, cmd.dir);
      this.camTarget = null;
      if (this.open.has(key(to))) {
        this.queue = [cmd.dir];
        this.nextStep();
      } else {
        this.bump = { dir: cmd.dir, t: 0 };
        this.game.audio.play('bump');
      }
    } else if (cmd.type === 'tap') {
      if (cmd.y < HUD_H || cmd.y >= CARD_Y) return;
      const c = Math.floor(cmd.x / TILE);
      const r = Math.floor((cmd.y - HUD_H + this.camY) / TILE);
      const k = key({ c, r });
      const i = this.pedestalAt.get(k);
      const l = this.landmarkAt.get(k);
      if (i !== undefined && this.unlocked[i]) this.travelTo({ c, r });
      else if (l && this.landmarkOpen(l)) this.travelTo(l.pos, l.id);
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.bump) {
      this.bump.t += dt / 0.18;
      if (this.bump.t >= 1) this.bump = null;
    }
    if (this.reveal) this.updateReveal(dt);
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
    const target = this.camTarget ?? this.followY();
    const k = this.game.reducedMotion ? 1 : Math.min(1, dt * 7);
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
      place(b, pos.c * TILE - 13, y - 13, TILE + 26, TILE + 26);
      b.style.display = y > HUD_H - 6 && y + TILE < CARD_Y + 6 ? '' : 'none';
    }
  }

  private syncCard(): void {
    if (!this.playBtn) return;
    const i = this.selectedLevel();
    const l = this.selectedLandmark();
    const label = i !== null ? t('Play') : l ? t('Enter') : t('Play');
    this.playBtn.replaceChildren(icon('play'), el('span', { text: label }));
    this.playBtn.disabled = (i === null && !l) || !!this.reveal;
  }

  // ---------- drawing ----------

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#17141f';
    ctx.fillRect(0, 0, 340, 480);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD_H, 340, VIEW_H);
    ctx.clip();
    ctx.translate(0, HUD_H - Math.round(this.camY));
    const r0 = Math.max(0, Math.floor(this.camY / TILE) - 1);
    const r1 = Math.min(this.world.rows - 1, Math.ceil((this.camY + VIEW_H) / TILE) + 1);
    this.drawGround(ctx, r0, r1);
    this.drawRoads(ctx, r0, r1);
    this.drawLandmarks(ctx, r0, r1);
    this.drawPedestals(ctx, r0, r1);
    this.drawFolk(ctx, r0, r1);
    this.drawDie(ctx);
    ctx.restore();
    this.drawHud(ctx);
    this.drawCard(ctx);
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
      ctx.fillRect(0, r * TILE, 340, TILE + 1);
      for (let c = 0; c < COLS; c++) {
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
      for (let c = 0; c < COLS; c++) {
        if (this.roadSegment.has(key({ c, r }))) continue;
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
      });
    });
    for (const l of this.world.landmarks) {
      if (!this.landmarkOpen(l)) continue;
      for (const p of l.road)
        if (visible(p) && !this.pedestalAt.has(key(p))) this.stone(ctx, p.c * TILE, p.r * TILE);
    }
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
      // A district all at ★★★: its gold flag flies at the last level.
      if (
        i % CHAPTER_SIZE === CHAPTER_SIZE - 1 &&
        this.districtGold(Math.floor(i / CHAPTER_SIZE))
      ) {
        const wave = this.game.reducedMotion ? 0 : Math.sin(this.time * 5) * 2;
        ctx.fillStyle = '#5e4726';
        ctx.fillRect(x + 16, y - 30, 3, 36);
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.moveTo(x + 19, y - 30);
        ctx.lineTo(x + 36, y - 24 + wave);
        ctx.lineTo(x + 19, y - 18);
        ctx.closePath();
        ctx.fill();
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
    ctx.fillText(`${got} / ${levels.length * 3}`, 163, 51.5);
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
      const par = level.par !== undefined ? t('Par {n}', { n: level.par }) : '';
      const sub = needsRedo(this.game.save.data, level)
        ? t('Changed: solve it again')
        : done && rec
          ? `${par} · ${t('your best {n} moves', { n: rec.bestMoves })}`
          : floors
            ? t('Gauntlet: {n} floors in a row', { n: floors.length + 1 })
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
          ? [
              [t('Swipe'), t('Roll along the road')],
              [t('Tap'), t('Roll to that level')],
            ]
          : [
              ['← ↑ → ↓', t('Roll along the road')],
              ['Enter', t('Play the level you are on')],
              ['Esc', t('Back to the menu')],
            ],
      );
    }
    ctx.restore();
  }
}
