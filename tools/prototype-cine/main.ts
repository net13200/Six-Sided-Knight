/**
 * "Story cut" prototype: the game keeps its own board and look, while the
 * title, story and transitions get a cinematic, lit treatment. Title → story
 * (4 animated scenes) → level 10 fades up from the dark → play (the game's
 * own board and animations, plus a blast flash and scattering bones) → win:
 * a gold beam and a closing iris → star card. Knock-out dims the lights.
 */
import { createState, parseTextLevel, step, type Dir, type GameState } from '../../src/engine';
import { solve } from '../../src/solver/solve';
import { drawBoard } from '../../src/game/view/board';
import { Fx } from '../../src/game/view/fx';
import { animateBump, animateTurn } from '../../src/game/view/animate';
import { predictOutcome } from '../../src/game/view/outcome';
import { cameraMatrix, drawCube3d, facesOf } from '../../src/game/view/cube';
import { drawFace } from '../../src/game/view/art';
import { drawStoryArt } from '../../src/game/view/story-art';
import { INTRO } from '../../src/game/story';
import type { Audio } from '../../src/game/audio';
import { rollWheel, rules, ICON } from '../mockups/kit';
import lvl10 from '../../src/levels/data/c1-10.txt?raw';
import { Fx2d } from '../prototype-2d/fx2d';

const level = parseTextLevel(lvl10);
const PAR = level.par ?? 8;
let state: GameState = createState(rules, level);
const history: GameState[] = [];

type Mode = 'title' | 'story' | 'reveal' | 'play' | 'win' | 'ko';
let mode: Mode = 'title';
let modeT = 0;

const canvas = document.createElement('canvas');
document.getElementById('view')!.appendChild(canvas);
const ctx = canvas.getContext('2d')!;
const $ = (id: string) => document.getElementById(id)!;

// ---------- layout ----------

let dpr = 1;
let W = 0;
let H = 0;
let k = 1; // board scale (device px per logical px)
let bcx = 0; // board centre on screen (device px)
let bcy = 0;

function layout(): void {
  dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = W = Math.round(w * dpr);
  canvas.height = H = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const portrait = h > w;
  const R = portrait
    ? { x: 8, y: 116, w: w - 16, h: h - 116 - 270 }
    : { x: w * 0.22, y: 78, w: w * 0.56, h: h - 92 };
  k = Math.min(R.w / 320, R.h / 360) * dpr;
  bcx = (R.x + R.w / 2) * dpr;
  bcy = (R.y + R.h / 2) * dpr;
}
addEventListener('resize', layout);

/** A tile's centre on screen. */
const tileXY = (x: number, y: number): [number, number] => [
  bcx + (10 + (x + 0.5) * 40 - 170) * k,
  bcy + (50 + (y + 0.5) * 40 - 230) * k,
];

let exit = { x: 0, y: 0 };
for (let y = 0; y < state.height; y++)
  for (let x = 0; x < state.width; x++)
    if (rules.tiles.get(state.tiles[y * state.width + x]!).goal) exit = { x, y };

// ---------- particles for the title and story ----------

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
  color: string;
}
let motes: Mote[] = [];
function spawnMotes(dt: number, color: string, rate: number): void {
  let n = rate * dt;
  while (n > 0) {
    if (Math.random() < n)
      motes.push({
        x: Math.random() * W,
        y: H * (0.55 + Math.random() * 0.5),
        vx: (Math.random() - 0.5) * 12 * dpr,
        vy: -(14 + Math.random() * 30) * dpr,
        age: 0,
        life: 3 + Math.random() * 4,
        r: (1 + Math.random() * 2.2) * dpr,
        color,
      });
    n -= 1;
  }
  for (const m of motes) {
    m.age += dt;
    m.x += (m.vx + Math.sin(m.age * 2 + m.y * 0.01) * 8 * dpr) * dt;
    m.y += m.vy * dt;
  }
  motes = motes.filter((m) => m.age < m.life);
}
function drawMotes(): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    const a = Math.sin((m.age / m.life) * Math.PI);
    ctx.fillStyle = m.color.replace('A', String(a * 0.8));
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function glow(x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function vignette(strength: number): void {
  const g = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.25,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.75,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Slow light shafts falling from above (x, y). */
function rays(x: number, y: number, len: number, color: string, t: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + (i - 2) * 0.17 + Math.sin(t * 0.3 + i * 1.7) * 0.05;
    const w = 0.05 + (i % 2) * 0.03;
    const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a - w) * len, y + Math.sin(a - w) * len);
    ctx.lineTo(x + Math.cos(a + w) * len, y + Math.sin(a + w) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Darkness everywhere except a soft circle of radius r around (x, y). */
function iris(x: number, y: number, r: number, alpha = 1): void {
  const g = ctx.createRadialGradient(x, y, Math.max(0, r * 0.72), x, y, Math.max(1, r));
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(3,2,6,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

// ---------- title ----------

const LOGO_DIE = {
  shape: 'd6',
  loadout: ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Coin'],
  orient: 0,
} as const;

function renderTitle(t: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b1426');
  g.addColorStop(1, '#07050b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H * 0.52;
  const s = Math.min(W, H) * 0.17;
  const flick = 0.9 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.04;
  for (const side of [-1, 1]) {
    const tx = cx + side * Math.min(W * 0.36, H * 0.6);
    glow(tx, cy - s * 0.8, s * 3.4 * flick, 'rgba(255,140,50,0.28)');
    glow(tx, cy - s * 0.8, s * 0.35, 'rgba(255,220,150,0.9)');
  }
  rays(cx, -s, H * 1.1, 'rgba(255,215,140,0.1)', t);
  // pedestal and pool of light
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(cx, cy + s * 1.05, s * 2, 'rgba(255,190,110,0.22)');
  ctx.restore();
  ctx.fillStyle = '#2a2236';
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 1.15, s * 1.3, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a304c';
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 1.05, s * 1.3, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = Math.sin(t * 2) * s * 0.06;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 1.02, s * (0.75 - bob / s), s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  drawCube3d(ctx, LOGO_DIE, cx, cy + bob, s, cameraMatrix(-38 + t * 24, -30));
  drawMotes();
  vignette(0.7);
  const fade = 1 - smooth(t / 1.2);
  if (fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- story ----------

const PALETTE: Record<string, { top: string; bottom: string; light: string; mote: string }> = {
  queen: {
    top: '#2c1844',
    bottom: '#09060f',
    light: 'rgba(255,205,110,0.35)',
    mote: 'rgba(255,215,120,A)',
  },
  well: {
    top: '#0f2c38',
    bottom: '#04080c',
    light: 'rgba(120,220,255,0.3)',
    mote: 'rgba(150,230,255,A)',
  },
  dice: {
    top: '#3c2840',
    bottom: '#0f0a13',
    light: 'rgba(255,170,190,0.3)',
    mote: 'rgba(255,200,220,A)',
  },
  you: {
    top: '#2e1b0c',
    bottom: '#090605',
    light: 'rgba(255,160,70,0.4)',
    mote: 'rgba(255,170,80,A)',
  },
};

let page = 0;
let typed = 0;
let leaving = -1; // >= 0 while fading out of a scene

function renderStory(t: number): void {
  const p = INTRO[page]!;
  const pal = PALETTE[p.art] ?? PALETTE.you!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.top);
  g.addColorStop(1, pal.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const portrait = H > W;
  const artH = portrait ? H * 0.42 : H * 0.6;
  const A = Math.min((W * 0.9) / 320, artH / 230);
  const push = 1 + Math.min(t, 10) * 0.012; // slow push-in
  const cx = W / 2 + Math.sin(t * 0.25) * 6 * dpr;
  const cy = portrait ? H * 0.4 : H * 0.42;
  rays(cx, cy - 180 * A, H, pal.light.replace(/[\d.]+\)$/, '0.12)'), t);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(cx, cy, 190 * A * push, pal.light);
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(A * push, A * push);
  drawStoryArt(ctx, rules, p, 0, 0, t, false);
  ctx.restore();
  drawMotes();
  vignette(0.75);
  // letterbox bars
  const bar = H * 0.075 * smooth(storyT / 0.8);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
  // fade in at a scene's start, out when leaving
  const fin = 1 - smooth(t / 0.6);
  const fout = leaving >= 0 ? smooth(leaving / 0.45) : 0;
  const f = Math.max(fin, fout);
  if (f > 0) {
    ctx.fillStyle = `rgba(0,0,0,${f})`;
    ctx.fillRect(0, 0, W, H);
  }
}
let storyT = 0;

function showPage(i: number): void {
  page = i;
  typed = 0;
  modeT = 0;
  leaving = -1;
  motes = [];
  $('s-title').textContent = INTRO[i]!.title ?? '';
  $('s-text').textContent = '';
  $('s-more').classList.remove('on');
}

function storyTap(): void {
  const text = INTRO[page]!.text;
  if (leaving >= 0) return;
  if (typed < text.length) {
    typed = text.length;
    return;
  }
  leaving = 0;
}

// ---------- the level ----------

const classicFx = new Fx();
const juice = new Fx2d();
const SILENT = { play() {} } as unknown as Audio;
let timers: { at: number; fn: () => void }[] = [];
let clock = 0;
const after = (d: number, fn: () => void) => timers.push({ at: clock + d, fn });

function startLevel(): void {
  state = createState(rules, level);
  history.length = 0;
  classicFx.finishAll();
  trail = [];
  setMode('reveal');
  updateHud();
  const b = $('banner');
  b.classList.remove('on');
  void b.offsetWidth;
  b.classList.add('on');
}

function move(dir: Dir): void {
  if (mode !== 'play' || state.status !== 'playing') return;
  document.getElementById('tip')?.classList.add('gone');
  classicFx.finishAll();
  const before = state;
  const res = step(rules, state, { type: 'move', dir });
  if (!res.consumed) {
    animateBump(classicFx, SILENT, dir);
    return;
  }
  history.push(before);
  state = res.state;
  trail = [];
  animateTurn(classicFx, SILENT, res.events, before, res.state);
  // extra juice on top of the game's own animation
  const [fx0, fy0] = [before.player.x + 0.5, before.player.y + 0.5];
  for (const e of res.events) {
    if (e.type === 'attacked' && e.face === 'Bomb')
      after(0.08, () => juice.explosion(e.at.x + 0.5, e.at.y + 0.5, !e.splash));
    if (e.type === 'killed') after(0.12, () => juice.bones(e.at.x + 0.5, e.at.y + 0.5, fx0, fy0));
  }
  updateHud();
  if (state.status === 'won') after(0.55, () => setMode('win'));
  if (state.status === 'lost') after(0.6, () => setMode('ko'));
}

function undo(): void {
  if (mode === 'ko') {
    $('ko').hidden = true;
    setMode('play');
  } else if (mode !== 'play') return;
  const prev = history.pop();
  if (!prev) return;
  classicFx.finishAll();
  state = prev;
  trail = [];
  updateHud();
}

function retry(): void {
  $('ko').hidden = true;
  $('result').hidden = true;
  startLevel();
}

let trail: { x: number; y: number }[] = [];
let trailAge = 0;
function showHint(): void {
  if (mode !== 'play') return;
  const r = solve(rules, state);
  trail = [];
  if (r.status !== 'solved') return;
  let s = state;
  for (const d of r.path) {
    s = step(rules, s, { type: 'move', dir: d }).state;
    trail.push({ x: s.player.x, y: s.player.y });
  }
  trailAge = 0;
}

function renderBoard(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#14121c';
  ctx.fillRect(0, 0, W, H);
  const sh = juice.shake * 40 * k * 0.25;
  const sx = Math.sin(clock * 61) * sh;
  const sy = Math.cos(clock * 47) * sh;
  ctx.setTransform(k, 0, 0, k, bcx - 170 * k + sx, bcy - 230 * k + sy);
  const outcomes =
    classicFx.busy || mode !== 'play'
      ? undefined
      : (['N', 'E', 'S', 'W'] as Dir[]).map((d) => [d, predictOutcome(rules, state, d)] as const);
  drawBoard(ctx, rules, state, classicFx.compute(), classicFx, outcomes);
  ctx.fillStyle = `rgba(255,215,94,${Math.max(0, 1 - trailAge / 5)})`;
  for (const p of trail) {
    ctx.beginPath();
    ctx.arc(10 + (p.x + 0.5) * 40, 50 + (p.y + 0.5) * 40, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // the blast lights up the room; bones and sparks fly
  const px = 40 * k;
  const ox = bcx + (10 - 170) * k + sx;
  const oy = bcy + (50 - 230) * k + sy;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of juice.flashes) {
    const r = f.radius * px * 1.3;
    const g = ctx.createRadialGradient(
      ox + f.x * px,
      oy + f.y * px,
      0,
      ox + f.x * px,
      oy + f.y * px,
      r,
    );
    g.addColorStop(0, `rgba(255,160,70,${0.55 * f.power})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  juice.drawUnder(ctx, px, ox, oy);
  juice.drawOver(ctx, px, ox, oy);
}

function renderPlay(t: number): void {
  renderBoard();
  const [dx, dy] = tileXY(state.player.x, state.player.y);
  const big = Math.hypot(W, H);
  if (mode === 'reveal') {
    // the room fades up from the dark, starting at the die
    iris(dx, dy, 40 * k + ease(t / 1.4) * big, 1);
    if (t > 1.4) setMode('play');
  } else if (mode === 'win') {
    const [ex, ey] = tileXY(exit.x, exit.y);
    // a gold beam rises from the stairs, then the iris closes on them
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beam = smooth(t / 0.5) * (1 - smooth((t - 1.1) / 0.4));
    const bw = 30 * k * (0.6 + beam * 0.5);
    const g = ctx.createLinearGradient(0, ey, 0, 0);
    g.addColorStop(0, `rgba(255,220,120,${0.85 * beam})`);
    g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ex - bw / 2, 0, bw, ey + 14 * k);
    glow(ex, ey, 120 * k * (0.5 + beam), `rgba(255,210,110,${0.6 * beam})`);
    ctx.restore();
    if (Math.random() < 0.5)
      juice.glint(
        (ex - (bcx - 160 * k)) / (40 * k),
        (ey - (bcy - 180 * k)) / (40 * k),
        '#ffd75e',
        1,
        0.3,
      );
    const close = smooth((t - 0.7) / 0.7);
    if (close > 0) iris(ex, ey, Math.max(0, (1 - close) * big), 1);
    if (t > 1.45 && $('result').hidden) showResult();
  } else if (mode === 'ko') {
    // the lights go down and the colour drains away
    const d = smooth(t / 0.9);
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = `rgba(128,128,128,${d})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    iris(dx, dy, big * (1 - d * 0.75), 0.85);
    ctx.fillStyle = `rgba(5,4,12,${d * 0.45})`;
    ctx.fillRect(0, 0, W, H);
    if (t > 0.6 && $('ko').hidden) $('ko').hidden = false;
  }
}

// ---------- modes ----------

function setMode(m: Mode): void {
  mode = m;
  modeT = 0;
  document.body.className = m === 'title' ? 'title' : m === 'story' ? 'story' : 'play';
  $('title').hidden = m !== 'title';
  $('story').hidden = m !== 'story';
  if (m === 'story') {
    storyT = 0;
    showPage(0);
  }
  if (m === 'title') motes = [];
}

$('t-play').onclick = () => setMode('story');
$('story').onclick = (e) => {
  if ((e.target as HTMLElement).id !== 's-skip') storyTap();
};
$('s-skip').onclick = () => {
  leaving = 0;
  page = INTRO.length - 1;
};
$('b-undo').onclick = undo;
$('b-retry').onclick = retry;
$('b-hint').onclick = showHint;
$('k-undo').onclick = undo;
$('k-retry').onclick = retry;
$('r-next').onclick = retry;
$('r-retry').onclick = retry;
$('r-story').onclick = () => {
  $('result').hidden = true;
  setMode('title');
};

// ---------- HUD ----------

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-icon]'))
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[b.dataset.icon!]}"/></svg>`;

const hearts = [...document.querySelectorAll<HTMLCanvasElement>('.heart')];
const wheel = $('wheel') as HTMLCanvasElement;
const starsFor = (moves: number) => (moves <= PAR ? 3 : moves <= PAR + 2 ? 2 : 1);

function updateHud(): void {
  const moves = state.stats.moves;
  $('count').textContent = `${moves}/${PAR}`;
  $('fill').style.width = `${Math.min(100, (moves / PAR) * 100)}%`;
  const n = starsFor(moves);
  document.querySelectorAll('.meter .st').forEach((el, i) => el.classList.toggle('off', i >= n));
  hearts.forEach((c, i) => {
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    x.globalAlpha = i < state.player.hp ? 1 : 0.2;
    drawFace(x, 'Heart', c.width / 2, c.height / 2, c.width * 0.8);
  });
  const x = wheel.getContext('2d')!;
  x.clearRect(0, 0, wheel.width, wheel.height);
  const f = facesOf(state.player.die);
  rollWheel(x, wheel.width / 2, wheel.height / 2, wheel.width / 2 - 4, {
    N: f.north!,
    E: f.east!,
    S: f.south!,
    W: f.west!,
  });
}

function showResult(): void {
  const n = starsFor(state.stats.moves);
  const r = $('result');
  r.querySelectorAll('.big').forEach((el, i) => el.classList.toggle('off', i >= n));
  $('rmoves').textContent = `${state.stats.moves}`;
  r.hidden = false;
}

{
  const c = $('ko-heart') as HTMLCanvasElement;
  const x = c.getContext('2d')!;
  x.globalAlpha = 0.35;
  drawFace(x, 'Heart', 90, 90, 140);
}

// ---------- input ----------

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
  if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) return setMode('story');
  if (mode === 'story') {
    if (e.code === 'Escape') $('s-skip').click();
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowRight') storyTap();
    return;
  }
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
  clock += dt;
  modeT += dt;
  trailAge += dt;
  const due = timers.filter((t) => t.at <= clock);
  timers = timers.filter((t) => t.at > clock);
  for (const t of due) t.fn();
  classicFx.update(dt);
  juice.update(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (mode === 'title') {
    spawnMotes(dt, 'rgba(255,180,90,A)', 6);
    renderTitle(modeT);
  } else if (mode === 'story') {
    storyT += dt;
    const p = INTRO[page]!;
    spawnMotes(dt, (PALETTE[p.art] ?? PALETTE.you!).mote, 9);
    if (modeT > 0.5 && typed < p.text.length) {
      typed = Math.min(p.text.length, typed + dt * 38);
    }
    $('s-text').textContent = p.text.slice(0, Math.floor(typed));
    $('s-more').classList.toggle('on', typed >= p.text.length && leaving < 0);
    if (leaving >= 0) {
      leaving += dt;
      if (leaving > 0.5) {
        if (page + 1 < INTRO.length) showPage(page + 1);
        else startLevel();
      }
    }
    if (mode === 'story') renderStory(modeT);
    else renderPlay(modeT);
  } else {
    renderPlay(modeT);
  }
}

layout();
setMode('title');
updateHud();

declare global {
  interface Window {
    __tick: (dt: number) => void;
    __ready: boolean;
  }
}
window.__tick = tick;
window.__ready = true;

if (!new URLSearchParams(location.search).has('capture')) {
  let last = performance.now();
  const loop = (now: number) => {
    tick(Math.min(0.05, (now - last) / 1000));
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
