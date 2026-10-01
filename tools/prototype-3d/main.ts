/**
 * 3D prototype of level 10 (Crowd Control): the real engine and level, drawn
 * as a lit diorama with Three.js. Not part of the game yet.
 *
 * ?demo     plays the par solution by itself
 * ?capture  no animation loop: a recorder drives it with window.__tick(dt)
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  createState,
  parseTextLevel,
  step,
  type Dir,
  type GameEvent,
  type GameState,
} from '../../src/engine';
import { solve } from '../../src/solver/solve';
import { dangerTiles } from '../../src/game/view/board';
import { facesOf } from '../../src/game/view/cube';
import { drawFace } from '../../src/game/view/art';
import { rollWheel, rules, ICON } from '../mockups/kit';
import lvl10 from '../../src/levels/data/c1-10.txt?raw';
import { Effects } from './fx3d';
import {
  BOX_SLOTS,
  buildDie,
  buildLevel,
  buildSkeleton,
  faceTexture,
  flicker,
  grid,
  setPips,
  type Toy,
} from './world';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const DEMO = params.has('demo');

const level = parseTextLevel(lvl10);
const PAR = level.par ?? 8;
let state: GameState = createState(rules, level);
const history: GameState[] = [];
const g = grid(state);

// ---------- renderer, scene, camera ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('view')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d0b14');
scene.fog = new THREE.Fog('#0d0b14', 11, 22);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

scene.add(new THREE.HemisphereLight('#b9c2ff', '#3a2618', 1.3));
const sun = new THREE.DirectionalLight('#fff0dc', 2.4);
sun.position.set(-4, 9, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -6;
sun.shadow.camera.right = 6;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -6;
sun.shadow.bias = -0.0005;
sun.shadow.radius = 4;
scene.add(sun);
const rim = new THREE.DirectionalLight('#7b8cff', 0.6);
rim.position.set(5, 4, -6);
scene.add(rim);

const built = buildLevel(state, g);
scene.add(built.root);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const fx = new Effects(scene);

// dust motes floating in the torchlight
const motes = new THREE.Points(
  new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      Array.from({ length: 50 }, (_, i) => [
        Math.sin(i * 12.9) * 1.6,
        0.2 + ((i * 7.31) % 1) * 2.4,
        Math.cos(i * 7.7) * 3.6,
      ]).flat(),
      3,
    ),
  ),
  new THREE.PointsMaterial({
    color: '#ffd9a0',
    size: 0.03,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  }),
);
scene.add(motes);

// ---------- the die ----------

const die = buildDie();
scene.add(die.mesh);

function dressDie(s: GameState): void {
  const faces = facesOf(s.player.die);
  BOX_SLOTS.forEach((slot, i) => {
    die.mats[i]!.map = faceTexture(faces[slot] ?? 'Pip1', renderer);
    die.mats[i]!.needsUpdate = true;
  });
}

function placeDie(s: GameState): void {
  die.mesh.position.copy(g.at(s.player.x, s.player.y)).setY(0.42);
  die.mesh.quaternion.identity();
  die.mesh.scale.set(1, 1, 1);
  dressDie(s);
}

// ---------- enemies ----------

const toys = new Map<number, Toy & { from: THREE.Vector3; to: THREE.Vector3 }>();
const maxHp = new Map<number, number>();

function syncToys(s: GameState): void {
  for (const [id, t] of toys) {
    if (!s.enemies.some((e) => e.id === id)) {
      t.group.removeFromParent();
      toys.delete(id);
    }
  }
  for (const e of s.enemies) {
    if (!maxHp.has(e.id)) maxHp.set(e.id, Math.max(e.hp, rules.enemies.get(e.kind).hp ?? e.hp));
    let t = toys.get(e.id);
    if (!t) {
      const toy = buildSkeleton(e.hp, maxHp.get(e.id)!);
      t = { ...toy, from: new THREE.Vector3(), to: new THREE.Vector3() };
      scene.add(t.group);
      toys.set(e.id, t);
    }
    setPips(t, e.hp);
    const p = g.at(e.x, e.y);
    t.group.position.copy(p);
    t.from.copy(p);
    t.to.copy(p);
  }
}

// ---------- danger tiles ----------

const dangerMat = new THREE.MeshBasicMaterial({
  color: '#ff3d55',
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
});
const dangerGeo = new THREE.PlaneGeometry(0.9, 0.9);
let dangers: THREE.Mesh[] = [];
function showDanger(s: GameState): void {
  for (const d of dangers) d.removeFromParent();
  dangers =
    s.status === 'playing'
      ? dangerTiles(rules, s).map((p) => {
          const m = new THREE.Mesh(dangerGeo, dangerMat);
          m.rotation.x = -Math.PI / 2;
          m.position.copy(g.at(p.x, p.y)).setY(0.012);
          scene.add(m);
          return m;
        })
      : [];
}

// ---------- hint trail ----------

let trail: THREE.Mesh[] = [];
let trailAge = 0;
function showHint(): void {
  const r = solve(rules, state);
  for (const m of trail) m.removeFromParent();
  trail = [];
  if (r.status !== 'solved') return;
  let s = state;
  const mat = new THREE.MeshBasicMaterial({
    color: '#ffd75e',
    transparent: true,
    depthWrite: false,
  });
  r.path.forEach((d, i) => {
    s = step(rules, s, { type: 'move', dir: d }).state;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16), mat);
    m.position.copy(g.at(s.player.x, s.player.y)).setY(0.03);
    m.userData.i = i;
    scene.add(m);
    trail.push(m);
  });
  trailAge = 0;
}

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

const DIRV: Record<Dir, THREE.Vector3> = {
  N: new THREE.Vector3(0, 0, -1),
  E: new THREE.Vector3(1, 0, 0),
  S: new THREE.Vector3(0, 0, 1),
  W: new THREE.Vector3(-1, 0, 0),
};
/** The axis the die tips around when it rolls that way (right-handed, angle +90°). */
const AXIS: Record<Dir, THREE.Vector3> = {
  N: new THREE.Vector3(-1, 0, 0),
  S: new THREE.Vector3(1, 0, 0),
  E: new THREE.Vector3(0, 0, -1),
  W: new THREE.Vector3(0, 0, 1),
};

const ROLL = 0.26;

function animateRoll(dir: Dir, from: THREE.Vector3, after: GameState, onLand: () => void): void {
  const pivot = from.clone().add(DIRV[dir].clone().multiplyScalar(0.42)).setY(0);
  const offset = from.clone().setY(0.42).sub(pivot);
  const q = new THREE.Quaternion();
  tween(
    0,
    ROLL,
    (k) => {
      const a = easeInOut(k) * (Math.PI / 2);
      q.setFromAxisAngle(AXIS[dir], a);
      die.mesh.quaternion.copy(q);
      die.mesh.position.copy(pivot).add(offset.clone().applyQuaternion(q));
    },
    () => {
      placeDie(after);
      // a little squash on landing
      tween(0, 0.16, (k) => {
        const s = Math.sin(k * Math.PI) * 0.07;
        die.mesh.scale.set(1 + s, 1 - s, 1 + s);
        die.mesh.position.y = 0.42 - s * 0.4;
      });
      fx.dust(die.mesh.position.clone().setY(0));
      onLand();
    },
  );
}

function animateBump(dir: Dir, after: GameState): void {
  const base = die.mesh.position.clone();
  const q = new THREE.Quaternion();
  tween(
    0,
    0.2,
    (k) => {
      const a = Math.sin(k * Math.PI) * 0.22;
      q.setFromAxisAngle(AXIS[dir], a);
      die.mesh.quaternion.copy(q);
      die.mesh.position.copy(base).addScaledVector(DIRV[dir], Math.sin(k * Math.PI) * 0.08);
    },
    () => placeDie(after),
  );
}

let busy = false;
let queued: Dir | null = null;

function move(dir: Dir): void {
  if (state.status !== 'playing') return;
  if (busy) {
    queued = dir;
    return;
  }
  const res = step(rules, state, { type: 'move', dir });
  const before = state;
  const from = g.at(before.player.x, before.player.y);
  if (!res.consumed) {
    busy = true;
    animateBump(dir, before);
    later(0.2, finish);
    return;
  }
  history.push(before);
  state = res.state;
  busy = true;
  for (const m of trail) m.removeFromParent();
  trail = [];
  showDanger(state);
  play(res.events, dir, from, before);
}

function play(
  events: readonly GameEvent[],
  dir: Dir,
  from: THREE.Vector3,
  before: GameState,
): void {
  const moved = events.some((e) => e.type === 'moved');
  const after = state;
  let end = ROLL;
  const kills = events.filter((e) => e.type === 'killed').length;

  // the leading face strikes as the die tips over
  events.forEach((e) => {
    if (e.type !== 'attacked') return;
    const toy = toys.get(e.target);
    const at = g.at(e.at.x, e.at.y);
    const killed = events.some((k) => k.type === 'killed' && k.enemyId === e.target);
    const d = e.splash ? 0.16 : 0.1;
    later(d, () => {
      if (e.face === 'Bomb' && !e.splash) fx.explosion(at, true);
      else if (e.face === 'Bomb') fx.explosion(at, false);
      else fx.slash(at, DIRV[dir]);
      fx.text(at, `-${e.damage}`, e.splash ? '#ff9d3a' : '#ffd75e', e.splash ? 0.42 : 0.55);
      if (!toy) return;
      if (killed) {
        fx.shatter(toy.parts, from);
        fx.coin(at, 0.15);
        toy.group.removeFromParent();
        toys.delete(e.target);
      } else {
        const hp = after.enemies.find((x) => x.id === e.target)?.hp ?? 0;
        setPips(toy, hp);
        toy.mats[0]!.emissive.set('#ffffff');
        tween(0, 0.25, (k) => {
          toy.mats[0]!.emissiveIntensity = 1 - k;
          toy.body.rotation.x = Math.sin(k * Math.PI) * -0.4 * (DIRV[dir].z || 1);
        });
      }
    });
  });
  if (kills >= 2) {
    later(0.3, () => callout(kills >= 3 ? 'TRIPLE!' : 'DOUBLE!'));
  }

  if (moved) {
    animateRoll(dir, from, after, () => {});
  } else {
    animateBump(dir, after);
    end = 0.2;
  }

  // then the enemies take their turn
  let enemyT = end + 0.02;
  const hops = events.filter((e) => e.type === 'enemyMoved');
  for (const e of hops) {
    if (e.type !== 'enemyMoved') continue;
    const toy = toys.get(e.enemyId);
    if (!toy) continue;
    const a = g.at(e.from.x, e.from.y);
    const b = g.at(e.to.x, e.to.y);
    tween(enemyT, 0.2, (k) => {
      toy.group.position.lerpVectors(a, b, easeOut(k));
      toy.group.position.y = Math.sin(k * Math.PI) * 0.18;
    });
  }
  if (hops.length) enemyT += 0.2;
  for (const e of events) {
    if (e.type !== 'enemyAttacked') continue;
    const toy = toys.get(e.enemyId);
    if (!toy) continue;
    const base = toy.group.position.clone();
    const target = g.at(after.player.x, after.player.y);
    const dirTo = target.clone().sub(g.at(e.from.x, e.from.y)).normalize();
    tween(enemyT, 0.24, (k) => {
      toy.group.position.copy(base).addScaledVector(dirTo, Math.sin(k * Math.PI) * 0.32);
    });
    later(enemyT + 0.12, () => {
      if (e.blocked) {
        fx.text(target, 'BLOCK', '#8fc6ff', 0.5);
        fx.flash(target, '#8fc6ff', 10, 0.25, 3);
      } else {
        fx.text(target, `-${e.damage}`, '#ff5a6a', 0.55);
        fx.shake = Math.max(fx.shake, 0.14);
        hurtFlash();
      }
      updateHud();
    });
    enemyT += 0.26;
  }

  if (after.status === 'won') {
    later(end + 0.05, () => win());
    return;
  }
  if (after.status === 'lost') {
    later(enemyT + 0.2, () => {
      busy = false;
      showLost();
    });
    return;
  }
  later(Math.max(end, enemyT) + 0.02, finish);
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
  const at = built.exitAt!;
  fx.sparkle(at, '#ffd75e', 26);
  fx.flash(at, '#ffd27a', 18, 0.9, 5);
  const start = die.mesh.position.clone();
  tween(0.1, 0.8, (k) => {
    const e = easeInOut(k);
    die.mesh.position.set(start.x, 0.42 - e * 0.9, start.z);
    die.mesh.rotation.y = e * Math.PI * 1.5;
    const s = 1 - e * 0.45;
    die.mesh.scale.set(s, s, s);
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
  resetView();
}

function retry(): void {
  if (busy && state.status === 'playing') return;
  state = createState(rules, level);
  history.length = 0;
  tweens = [];
  busy = false;
  document.getElementById('result')!.hidden = true;
  resetView();
}

function resetView(): void {
  placeDie(state);
  syncToys(state);
  showDanger(state);
  for (const m of trail) m.removeFromParent();
  trail = [];
  updateHud();
}

// ---------- HUD ----------

const $ = (id: string) => document.getElementById(id)!;

function svg(name: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[name]}"/></svg>`;
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-icon]'))
  b.innerHTML = svg(b.dataset.icon!);

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

function starsFor(moves: number): number {
  return moves <= PAR ? 3 : moves <= PAR + 2 ? 2 : 1;
}

function updateHud(s: GameState = state): void {
  const moves = s.stats.moves;
  $('count').textContent = `${moves}/${PAR}`;
  ($('fill') as HTMLElement).style.width = `${Math.min(100, (moves / PAR) * 100)}%`;
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

function callout(text: string): void {
  const el = $('callout');
  el.textContent = text;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

function showResult(): void {
  const n = starsFor(state.stats.moves);
  const r = $('result');
  r.querySelectorAll('.big').forEach((el, i) => el.classList.toggle('off', i >= n));
  $('rmoves').textContent = `${state.stats.moves}`;
  r.hidden = false;
}

function showLost(): void {
  retry();
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
renderer.domElement.addEventListener(
  'pointerdown',
  (e) => (touch = { x: e.clientX, y: e.clientY }),
);
addEventListener('pointerup', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  touch = null;
  if (Math.hypot(dx, dy) < 24) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N');
});

// ---------- camera framing ----------

const look = new THREE.Vector3();
let dist = 12;
const PITCH = THREE.MathUtils.degToRad(50);

function frame(): void {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  camera.aspect = w / h;
  const portrait = h > w;
  // where the board may sit on screen (NDC), clear of the HUD
  const R = portrait
    ? { x0: -0.95, x1: 0.95, y0: -0.36, y1: 0.66 }
    : { x0: -0.56, x1: 0.56, y0: -0.93, y1: 0.74 };
  const corners: THREE.Vector3[] = [];
  for (const x of [-g.w / 2, g.w / 2])
    for (const z of [-g.h / 2, g.h / 2])
      for (const y of [-0.2, 0.9]) corners.push(new THREE.Vector3(x, y, z));
  look.set(0, 0, 0);
  dist = 14;
  for (let i = 0; i < 60; i++) {
    place(0, 0);
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const c of corners) {
      const p = c.clone().project(camera);
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    const s = Math.max((x1 - x0) / (R.x1 - R.x0), (y1 - y0) / (R.y1 - R.y0));
    dist *= 1 + (s - 1) * 0.5;
    look.x += ((x0 + x1) / 2 - (R.x0 + R.x1) / 2) * dist * 0.2;
    look.z -= ((y0 + y1) / 2 - (R.y0 + R.y1) / 2) * dist * 0.25;
  }
}

function place(shakeX: number, shakeY: number, intro = 1): void {
  const d = dist * (1 + (1 - intro) * 0.5);
  const pitch = PITCH + (1 - intro) * 0.35;
  const yaw = (1 - intro) * -0.5;
  camera.position.set(
    look.x + Math.sin(yaw) * Math.cos(pitch) * d + shakeX,
    look.y + Math.sin(pitch) * d + shakeY,
    look.z + Math.cos(yaw) * Math.cos(pitch) * d,
  );
  camera.lookAt(look.x + shakeX * 0.5, look.y, look.z);
  camera.updateProjectionMatrix();
}

addEventListener('resize', frame);

// ---------- loop ----------

let time = 0;
let introT = 0;

function tick(dt: number): void {
  time += dt;
  introT = Math.min(1, introT + dt / 1.4);
  for (const tw of tweens) {
    if (tw.delay > 0) {
      tw.delay -= dt;
      if (tw.delay > 0) continue;
    }
    tw.t += dt;
    const k = tw.dur === 0 ? 1 : Math.min(1, tw.t / tw.dur);
    tw.update(k);
  }
  const done = tweens.filter((tw) => tw.delay <= 0 && (tw.dur === 0 || tw.t >= tw.dur));
  tweens = tweens.filter((tw) => !done.includes(tw));
  for (const tw of done) tw.done?.();

  for (const t of built.torches) flicker(t, time);
  if (built.exitLight) built.exitLight.intensity = 2.6 + Math.sin(time * 3) * 0.6;
  if (built.exitAt && Math.floor(time * 4) !== Math.floor((time - dt) * 4))
    fx.sparkle(built.exitAt, '#ffd75e', 1, 0.3);
  dangerMat.opacity = 0.16 + Math.sin(time * 4) * 0.07;
  motes.rotation.y = time * 0.02;
  motes.position.y = Math.sin(time * 0.5) * 0.05;

  // skeletons idle, and turn to face the die
  const dp = die.mesh.position;
  for (const t of toys.values()) {
    t.body.position.y = Math.abs(Math.sin(time * 3 + t.group.position.x * 2)) * 0.03;
    t.body.rotation.z = Math.sin(time * 2 + t.group.position.z) * 0.04;
    const want = Math.atan2(dp.x - t.group.position.x, dp.z - t.group.position.z);
    t.group.rotation.y += (want - t.group.rotation.y) * Math.min(1, dt * 8);
  }
  trailAge += dt;
  trail.forEach((m, i) => {
    const k = trailAge * 6 - i;
    const s = 1 + Math.max(0, 1 - Math.abs(k % (trail.length + 4))) * 0.8;
    m.scale.set(s, 1, s);
    (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - trailAge / 4);
  });

  fx.update(dt);
  const sh = fx.shake;
  place(Math.sin(time * 61) * sh * 0.5, Math.cos(time * 47) * sh * 0.4, easeInOut(introT));
  composer.render(dt);
}

placeDie(state);
syncToys(state);
showDanger(state);
updateHud();
frame();

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
  if (DEMO) {
    const path = solve(rules, state).path;
    let i = 0;
    const next = () => {
      if (i >= path.length) return;
      if (busy) return void setTimeout(next, 100);
      move(path[i++]!);
      setTimeout(next, 650);
    };
    setTimeout(next, 1800);
  }
}
