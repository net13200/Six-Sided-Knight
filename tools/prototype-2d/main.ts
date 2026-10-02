/**
 * 2D lit-dungeon prototype of level 10 (Crowd Control): the real engine and
 * level, drawn on a plain 2D canvas with stone rooms, shadow-casting
 * torchlight and effects. Not part of the game yet.
 *
 * ?capture  no animation loop: a recorder drives it with window.__tick(dt)
 */
import {
  createState,
  parseTextLevel,
  step,
  type Dir,
  type GameEvent,
  type GameState,
} from '../../src/engine';
import { solve } from '../../src/solver/solve';
import { dangerTiles, drawBoard } from '../../src/game/view/board';
import { Fx } from '../../src/game/view/fx';
import { animateBump, animateTurn } from '../../src/game/view/animate';
import { predictOutcome } from '../../src/game/view/outcome';
import type { Audio } from '../../src/game/audio';
import {
  cameraMatrix,
  drawCube3d,
  facesOf,
  IDENTITY,
  rollRotation,
  rotZ,
  type M3,
} from '../../src/game/view/cube';
import { drawEnemy, drawFace } from '../../src/game/view/art';
import { rollWheel, rules, ICON } from '../mockups/kit';
import lvl10 from '../../src/levels/data/c1-10.txt?raw';
import { drawLevel, drawSconce, isOpen, wallSegments } from './art2d';
import { Fx2d } from './fx2d';
import { drawLighting, type Light } from './light';

const CAPTURE = new URLSearchParams(location.search).has('capture');

const level = parseTextLevel(lvl10);
const PAR = level.par ?? 8;
let state: GameState = createState(rules, level);
const history: GameState[] = [];

// ---------- canvas & layout ----------

const canvas = document.createElement('canvas');
document.getElementById('view')!.appendChild(canvas);
const ctx = canvas.getContext('2d')!;
const darkCanvas = document.createElement('canvas');
const dark = darkCanvas.getContext('2d')!;

const { segs, sconces } = wallSegments(state);

// only frame the part of the grid that is drawn (rooms and their walls)
let bx0 = Infinity,
  by0 = Infinity,
  bx1 = -Infinity,
  by1 = -Infinity;
for (let y = 0; y < state.height; y++)
  for (let x = 0; x < state.width; x++)
    if (isOpen(state, x, y)) {
      bx0 = Math.min(bx0, x - 1);
      by0 = Math.min(by0, y - 1);
      bx1 = Math.max(bx1, x + 2);
      by1 = Math.max(by1, y + 2);
    }

let px = 60; // device pixels per tile
let ox = 0; // where tile (0, 0) sits, in device pixels
let oy = 0;
let levelArt: HTMLCanvasElement | null = null;
let classicScale = 1;
let classicX = 0;
let classicY = 0;

function layout(): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  darkCanvas.width = Math.round(canvas.width / 2);
  darkCanvas.height = Math.round(canvas.height / 2);
  const portrait = h > w;
  // where the board may go (CSS px), clear of the HUD
  const R = portrait
    ? { x: 8, y: 160, w: w - 16, h: h - 160 - 270 }
    : { x: w * 0.22, y: 78, w: w * 0.56, h: h - 92 };
  const tiles = Math.min(R.w / (bx1 - bx0), R.h / (by1 - by0));
  px = tiles * dpr;
  ox = (R.x + R.w / 2) * dpr - ((bx0 + bx1) / 2) * px;
  oy = (R.y + R.h / 2) * dpr - ((by0 + by1) / 2) * px;
  levelArt = drawLevel(state, px);
  // the old look: the game's own board (320 x 360 logical px) in the same space
  classicScale = Math.min(R.w / 320, R.h / 360) * dpr;
  classicX = (R.x + R.w / 2) * dpr;
  classicY = (R.y + R.h / 2) * dpr;
}
addEventListener('resize', layout);

// ---------- what's on the board ----------

const CAM = cameraMatrix(0, -16);

interface DieView {
  x: number;
  y: number;
  z: number;
  model: M3;
  scale: number;
  state: GameState;
  alpha: number;
}
const die: DieView = { x: 0, y: 0, z: 0, model: IDENTITY, scale: 1, state, alpha: 1 };

interface Toy {
  id: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  flash: number;
  hp: number;
}
let toys = new Map<number, Toy>();

function placeAll(s: GameState): void {
  die.x = s.player.x + 0.5;
  die.y = s.player.y + 0.5;
  die.z = 0;
  die.model = IDENTITY;
  die.scale = 1;
  die.alpha = 1;
  die.state = s;
  toys = new Map(
    s.enemies.map((e) => [
      e.id,
      { id: e.id, x: e.x + 0.5, y: e.y + 0.5, z: 0, dx: 0, dy: 0, flash: 0, hp: e.hp },
    ]),
  );
  dieLight.poly = null;
}

const fx = new Fx2d();

// ---------- lights ----------

const staticLights: Light[] = sconces.map((s) => ({
  x: s.lx,
  y: s.ly,
  radius: 2.9,
  color: 'rgba(255,130,40,0.34)',
  power: 0.95,
  poly: null,
}));
for (let y = 0; y < state.height; y++)
  for (let x = 0; x < state.width; x++)
    if (rules.tiles.get(state.tiles[y * state.width + x]!).goal)
      staticLights.push({
        x: x + 0.5,
        y: y + 0.5,
        radius: 1.9,
        color: 'rgba(255,200,90,0.35)',
        power: 0.8,
        poly: null,
      });
const dieLight: Light = {
  x: 0,
  y: 0,
  radius: 2.2,
  color: 'rgba(255,215,150,0.14)',
  power: 0.7,
  poly: null,
};

// ---------- timeline ----------

interface Tween {
  t: number;
  delay: number;
  dur: number;
  update: (k: number) => void;
  done?: () => void;
}
let tweens: Tween[] = [];
const tween = (delay: number, dur: number, update: (k: number) => void, done?: () => void) =>
  tweens.push({ t: 0, delay, dur, update, done });
const later = (delay: number, fn: () => void) => tween(delay, 0, () => {}, fn);
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

const DV: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const ROLL = 0.24;

let busy = false;
let queued: Dir | null = null;

function move(dir: Dir): void {
  document.getElementById('tip')?.classList.add('gone');
  if (state.status !== 'playing') return;
  if (busy) {
    queued = dir;
    return;
  }
  const res = step(rules, state, { type: 'move', dir });
  const before = state;
  busy = true;
  if (!res.consumed) {
    animateBump(classicFx, SILENT, dir);
    bump(dir);
    later(0.2, finish);
    return;
  }
  history.push(before);
  state = res.state;
  trail = [];
  classicFx.finishAll();
  animateTurn(classicFx, SILENT, res.events, before, res.state);
  play(res.events, dir, before);
}

function bump(dir: Dir): void {
  const [dx, dy] = DV[dir];
  const x0 = die.x;
  const y0 = die.y;
  tween(0, 0.2, (k) => {
    const s = Math.sin(k * Math.PI) * 0.1;
    die.x = x0 + dx * s;
    die.y = y0 + dy * s;
  });
}

function play(events: readonly GameEvent[], dir: Dir, before: GameState): void {
  const after = state;
  const moved = events.some((e) => e.type === 'moved');
  const fromX = before.player.x + 0.5;
  const fromY = before.player.y + 0.5;
  let end = ROLL;

  for (const e of events) {
    if (e.type !== 'attacked') continue;
    const tx = e.at.x + 0.5;
    const ty = e.at.y + 0.5;
    const killed = events.some((k) => k.type === 'killed' && k.enemyId === e.target);
    later(e.splash ? 0.14 : 0.08, () => {
      if (e.face === 'Bomb') fx.explosion(tx, ty, !e.splash);
      else fx.slash(tx, ty, Math.atan2(DV[dir][1], DV[dir][0]));
      fx.text(tx, ty, `-${e.damage}`, e.splash ? '#ff9d3a' : '#ffd75e', e.splash ? 0.85 : 1.1);
      const toy = toys.get(e.target);
      if (!toy) return;
      if (killed) {
        fx.bones(tx, ty, fromX, fromY);
        fx.coin(tx, ty, 0.15);
        toys.delete(e.target);
      } else {
        toy.hp = after.enemies.find((x) => x.id === e.target)?.hp ?? 0;
        tween(0, 0.25, (k) => {
          toy.flash = 1 - k;
          toy.dx = DV[dir][0] * Math.sin(k * Math.PI) * 0.12;
          toy.dy = DV[dir][1] * Math.sin(k * Math.PI) * 0.12;
        });
      }
    });
  }

  if (moved) {
    const [dx, dy] = DV[dir];
    die.state = before;
    tween(
      0,
      ROLL,
      (k) => {
        const e = easeInOut(k);
        die.x = fromX + dx * e;
        die.y = fromY + dy * e;
        die.z = Math.sin(e * Math.PI) * 0.16;
        die.model = rollRotation(dir, e);
        dieLight.poly = null;
      },
      () => {
        die.state = after;
        die.model = IDENTITY;
        die.z = 0;
        die.x = after.player.x + 0.5;
        die.y = after.player.y + 0.5;
        dieLight.poly = null;
        fx.dust(die.x, die.y + 0.25);
        tween(0, 0.16, (k) => (die.scale = 1 + Math.sin(k * Math.PI) * 0.06));
      },
    );
  } else {
    bump(dir);
    later(0.2, () => (die.state = after));
    end = 0.2;
  }

  let t = end + 0.02;
  const hops = events.filter((e) => e.type === 'enemyMoved');
  for (const e of hops) {
    if (e.type !== 'enemyMoved') continue;
    const toy = toys.get(e.enemyId);
    if (!toy) continue;
    const ax = e.from.x + 0.5;
    const ay = e.from.y + 0.5;
    const bx = e.to.x + 0.5;
    const by = e.to.y + 0.5;
    tween(t, 0.2, (k) => {
      const q = easeOut(k);
      toy.x = ax + (bx - ax) * q;
      toy.y = ay + (by - ay) * q;
      toy.z = Math.sin(k * Math.PI) * 0.2;
    });
  }
  if (hops.length) t += 0.2;
  for (const e of events) {
    if (e.type !== 'enemyAttacked') continue;
    const toy = toys.get(e.enemyId);
    if (!toy) continue;
    const tx = after.player.x + 0.5;
    const ty = after.player.y + 0.5;
    const ex = e.from.x + 0.5;
    const ey = e.from.y + 0.5;
    const d = Math.hypot(tx - ex, ty - ey) || 1;
    tween(t, 0.24, (k) => {
      toy.dx = ((tx - ex) / d) * Math.sin(k * Math.PI) * 0.32;
      toy.dy = ((ty - ey) / d) * Math.sin(k * Math.PI) * 0.32;
    });
    later(t + 0.12, () => {
      if (e.blocked) {
        fx.text(tx, ty, 'BLOCK', '#8fc6ff', 0.8);
        fx.flash(tx, ty, 'rgba(140,190,255,0.4)', 1.6, 0.25, 0.6);
      } else {
        fx.text(tx, ty, `-${e.damage}`, '#ff5a6a', 1.1);
        fx.shake = Math.max(fx.shake, 0.14);
        hurtFlash();
      }
      updateHud();
    });
    t += 0.26;
  }

  if (after.status === 'won') {
    later(end + 0.05, win);
    return;
  }
  if (after.status === 'lost') {
    later(t + 0.3, () => {
      busy = false;
      retry();
    });
    return;
  }
  later(Math.max(end, t) + 0.02, finish);
  updateHud(before);
}

function finish(): void {
  busy = false;
  updateHud();
  if (queued) {
    const d = queued;
    queued = null;
    move(d);
  }
}

function win(): void {
  updateHud();
  fx.glint(die.x, die.y, '#ffd75e', 24);
  fx.flash(die.x, die.y, 'rgba(255,210,110,0.6)', 3, 1, 1);
  tween(0.1, 0.8, (k) => {
    const e = easeInOut(k);
    die.scale = 1 - e * 0.55;
    die.model = rotZ(e * Math.PI * 1.5);
    die.alpha = 1 - e * 0.8;
  });
  later(1.0, () => {
    busy = false;
    showResult();
  });
}

function undo(): void {
  const prev = history.pop();
  if (!prev || busy) return;
  state = prev;
  classicFx.finishAll();
  placeAll(state);
  trail = [];
  updateHud();
}

function retry(): void {
  if (busy && state.status === 'playing') return;
  state = createState(rules, level);
  history.length = 0;
  tweens = [];
  busy = false;
  document.getElementById('result')!.hidden = true;
  classicFx.finishAll();
  placeAll(state);
  trail = [];
  updateHud();
}

// ---------- hint ----------

let trail: { x: number; y: number }[] = [];
let trailAge = 0;
function showHint(): void {
  if (busy) return;
  const r = solve(rules, state);
  trail = [];
  if (r.status !== 'solved') return;
  let s = state;
  for (const d of r.path) {
    s = step(rules, s, { type: 'move', dir: d }).state;
    trail.push({ x: s.player.x + 0.5, y: s.player.y + 0.5 });
  }
  trailAge = 0;
}

// ---------- drawing ----------

let time = 0;

/** The old look, animated by the game's own animator. */
const classicFx = new Fx();
const SILENT = { play() {} } as unknown as Audio;
let classic = false;
try {
  classic = localStorage.getItem('ssk-proto-look') === 'old';
} catch {
  // no storage: start with the new look
}

function renderClassic(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#14121c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const k = classicScale;
  ctx.setTransform(k, 0, 0, k, classicX - 170 * k, classicY - 230 * k);
  const outcomes = classicFx.busy
    ? undefined
    : (['N', 'E', 'S', 'W'] as Dir[]).map((d) => [d, predictOutcome(rules, state, d)] as const);
  drawBoard(ctx, rules, state, classicFx.compute(), classicFx, outcomes);
  ctx.fillStyle = `rgba(255,215,94,${Math.max(0, 1 - trailAge / 5)})`;
  for (const p of trail) {
    ctx.beginPath();
    ctx.arc(10 + p.x * 40, 50 + p.y * 40, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

const lookBtn = document.getElementById('b-look')!;
function setLook(old: boolean): void {
  classic = old;
  lookBtn.textContent = old ? 'New look' : 'Old look';
  lookBtn.setAttribute('aria-pressed', String(old));
  try {
    localStorage.setItem('ssk-proto-look', old ? 'old' : 'new');
  } catch {
    // not remembered: fine
  }
}
lookBtn.onclick = () => setLook(!classic);
setLook(classic);

function render(): void {
  const W = canvas.width;
  const H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#050407';
  ctx.fillRect(0, 0, W, H);
  const sh = fx.shake * px * 0.25;
  const sx = Math.sin(time * 61) * sh;
  const sy = Math.cos(time * 47) * sh;
  const X = ox + sx;
  const Y = oy + sy;
  if (levelArt) ctx.drawImage(levelArt, X, Y);

  // danger tiles
  if (state.status === 'playing' && !busy) {
    ctx.fillStyle = `rgba(255,60,80,${0.2 + Math.sin(time * 4) * 0.07})`;
    for (const p of dangerTiles(rules, state)) {
      ctx.beginPath();
      ctx.roundRect(X + (p.x + 0.08) * px, Y + (p.y + 0.08) * px, px * 0.84, px * 0.84, px * 0.1);
      ctx.fill();
    }
  }
  // hint trail
  trail.forEach((p, i) => {
    const pulse = Math.max(0, 1 - Math.abs(((trailAge * 6 - i) % (trail.length + 4)) - 0)) * 0.5;
    ctx.fillStyle = `rgba(255,215,94,${Math.max(0, 1 - trailAge / 5)})`;
    ctx.beginPath();
    ctx.arc(X + p.x * px, Y + p.y * px, px * (0.09 + pulse * 0.06), 0, Math.PI * 2);
    ctx.fill();
  });

  // figures, back to front
  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  const k = px / 40; // the game's art is drawn for 40 px tiles
  for (const t of toys.values()) {
    const e = state.enemies.find((q) => q.id === t.id) ?? before(t.id);
    if (!e) continue;
    items.push({
      y: t.y,
      draw: () => {
        const cx = X + (t.x + t.dx) * px;
        const cy = Y + (t.y + t.dy) * px;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 0.28 * px, 0.28 * px, 0.1 * px, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(cx, cy - (t.z + 0.06) * px);
        ctx.scale(k * 1.15, k * 1.15);
        const look = { lookX: die.x - t.x, lookY: die.y - t.y, flash: t.flash, t: time };
        const n = Math.hypot(look.lookX, look.lookY) || 1;
        drawEnemy(ctx, rules.enemies.get(e.kind), { ...e, hp: t.hp }, 0, 0, {
          ...look,
          lookX: look.lookX / n,
          lookY: look.lookY / n,
        });
        ctx.restore();
      },
    });
  }
  items.push({
    y: die.y,
    draw: () => {
      const cx = X + die.x * px;
      const cy = Y + die.y * px;
      ctx.fillStyle = `rgba(0,0,0,${0.4 * die.alpha})`;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy + 0.3 * px,
        0.36 * px * die.scale * (1 - die.z),
        0.12 * px * die.scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.save();
      ctx.globalAlpha = die.alpha;
      ctx.translate(cx, cy - die.z * px - 0.05 * px);
      ctx.scale(die.scale, die.scale);
      drawCube3d(ctx, die.state.player.die, 0, 0, px * 0.8, CAM, die.model);
      ctx.restore();
    },
  });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  fx.drawUnder(ctx, px, X, Y);

  // light
  dieLight.x = die.x;
  dieLight.y = die.y;
  const lights = [...staticLights, ...(die.alpha > 0.3 ? [dieLight] : []), ...fx.flashes];
  drawLighting(ctx, dark, lights, segs, px, X, Y, 'rgba(8,12,32,0.86)');
  for (const [i, s] of sconces.entries())
    drawSconce(ctx, X + s.x * px, Y + s.y * px, px, time, i * 0.37);
  fx.drawOver(ctx, px, X, Y);
}

/** An enemy that just died is no longer in the state, but its toy may still be drawn this frame. */
function before(id: number) {
  return history.at(-1)?.enemies.find((q) => q.id === id);
}

// ---------- HUD ----------

const $ = (id: string) => document.getElementById(id)!;
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-icon]'))
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[b.dataset.icon!]}"/></svg>`;

const hearts = [...document.querySelectorAll<HTMLCanvasElement>('.heart')];
function drawHearts(hp: number): void {
  hearts.forEach((c, i) => {
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    x.globalAlpha = i < hp ? 1 : 0.2;
    drawFace(x, 'Heart', c.width / 2, c.height / 2, c.width * 0.8);
  });
}

const wheel = $('wheel') as HTMLCanvasElement;
function drawWheel(s: GameState): void {
  const x = wheel.getContext('2d')!;
  x.clearRect(0, 0, wheel.width, wheel.height);
  const f = facesOf(s.player.die);
  rollWheel(x, wheel.width / 2, wheel.height / 2, wheel.width / 2 - 4, {
    N: f.north!,
    E: f.east!,
    S: f.south!,
    W: f.west!,
  });
}

const starsFor = (moves: number) => (moves <= PAR ? 3 : moves <= PAR + 2 ? 2 : 1);

function updateHud(s: GameState = state): void {
  const moves = s.stats.moves;
  $('count').textContent = `${moves}/${PAR}`;
  $('fill').style.width = `${Math.min(100, (moves / PAR) * 100)}%`;
  const n = starsFor(moves);
  document.querySelectorAll('.meter .st').forEach((el, i) => el.classList.toggle('off', i >= n));
  drawHearts(s.player.hp);
  drawWheel(s);
}

let lastHp = state.player.hp;
function hurtFlash(): void {
  const el = $('hurt');
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  const lost = hearts[state.player.hp];
  if (lost && state.player.hp < lastHp) {
    lost.classList.remove('pop');
    void lost.offsetWidth;
    lost.classList.add('pop');
  }
  lastHp = state.player.hp;
}

function showResult(): void {
  const n = starsFor(state.stats.moves);
  const r = $('result');
  r.querySelectorAll('.big').forEach((el, i) => el.classList.toggle('off', i >= n));
  $('rmoves').textContent = `${state.stats.moves}`;
  r.hidden = false;
}

$('b-undo').onclick = undo;
$('b-retry').onclick = retry;
$('b-hint').onclick = showHint;
$('r-next').onclick = retry;
$('r-retry').onclick = retry;

const KEYS: Record<string, Dir> = {
  ArrowUp: 'N',
  ArrowRight: 'E',
  ArrowDown: 'S',
  ArrowLeft: 'W',
  KeyW: 'N',
  KeyD: 'E',
  KeyS: 'S',
  KeyA: 'W',
};
addEventListener('keydown', (e) => {
  const d = KEYS[e.code];
  if (d) {
    e.preventDefault();
    move(d);
  } else if (e.code === 'KeyZ') undo();
  else if (e.code === 'KeyR') retry();
  else if (e.code === 'KeyH') showHint();
});
let touch: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => (touch = { x: e.clientX, y: e.clientY }));
addEventListener('pointerup', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  touch = null;
  if (Math.hypot(dx, dy) < 24) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N');
});

// ---------- loop ----------

function tick(dt: number): void {
  time += dt;
  trailAge += dt;
  for (const tw of tweens) {
    if (tw.delay > 0) {
      tw.delay -= dt;
      if (tw.delay > 0) continue;
    }
    tw.t += dt;
    tw.update(tw.dur === 0 ? 1 : Math.min(1, tw.t / tw.dur));
  }
  const done = tweens.filter((tw) => tw.delay <= 0 && (tw.dur === 0 || tw.t >= tw.dur));
  tweens = tweens.filter((tw) => !done.includes(tw));
  for (const tw of done) tw.done?.();
  // stairs sparkle
  if (Math.floor(time * 3) !== Math.floor((time - dt) * 3)) {
    const ex = staticLights.at(-1)!;
    fx.glint(ex.x, ex.y, '#ffd75e', 1, 0.3);
  }
  fx.update(dt);
  classicFx.update(dt);
  if (classic) renderClassic();
  else render();
}

layout();
placeAll(state);
updateHud();

declare global {
  interface Window {
    __tick: (dt: number) => void;
    __move: (d: Dir) => void;
    __busy: () => boolean;
    __hint: () => void;
    __ready: boolean;
  }
}
window.__tick = tick;
window.__move = move;
window.__busy = () => busy || tweens.length > 0;
window.__hint = showHint;
window.__ready = true;

if (!CAPTURE) {
  let last = performance.now();
  const loop = (now: number) => {
    tick(Math.min(0.05, (now - last) / 1000));
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
