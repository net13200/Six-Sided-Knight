/**
 * The 3D animated opening of Six Sided Knight (prototype): four short scenes
 * played as one film, with captions, Skip, tap-to-advance and an end title.
 * Any error is shown on screen, so a phone that can't run it says why.
 *
 * ?capture  no animation loop: a recorder drives it with window.__tick(dt)
 */
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { morning, oldWell, throneRoom, you, type Stage } from './scenes';

const $ = (id: string) => document.getElementById(id)!;

function fail(msg: string): void {
  const e = $('err');
  e.hidden = false;
  e.textContent += (e.textContent ? '\n' : '') + msg;
}
addEventListener('error', (e) => fail(`Error: ${e.message}`));
addEventListener('unhandledrejection', (e) => fail(`Error: ${String(e.reason)}`));

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  fail(`3D isn't available here: ${String(e)}`);
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('view').appendChild(renderer.domElement);
const effect = new OutlineEffect(renderer, {
  defaultThickness: 0.0045,
  defaultColor: [0.1, 0.07, 0.14],
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
const hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.camera.far = 50;
sun.shadow.bias = -0.001;
scene.add(sun);
scene.add(sun.target);

function resize(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  // keep the action in frame on a phone held upright
  camera.fov = camera.aspect < 1 ? 40 + (1 - camera.aspect) * 34 : 40;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- the film ----------

const ctx = { renderer };
const MAKERS: (() => Stage)[] = [throneRoom, oldWell, () => morning(ctx), () => you(ctx)];

let index = -1;
let stage: Stage | null = null;
let t = 0;
let fadeOut = -1; // >= 0 while fading to the next scene
let ended = false;
let started = false;

function load(i: number): void {
  if (stage) {
    scene.remove(stage.root);
    stage.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
  index = i;
  stage = MAKERS[i]!();
  scene.add(stage.root);
  const l = stage.look;
  scene.background = new THREE.Color(l.background);
  scene.fog = new THREE.Fog(l.background, l.fog[0], l.fog[1]);
  sun.color.set(l.sun.color);
  sun.intensity = l.sun.intensity;
  sun.position.set(...l.sun.pos);
  hemi.color.set(l.hemi.sky);
  hemi.groundColor.set(l.hemi.ground);
  hemi.intensity = l.hemi.intensity;
  t = 0;
  fadeOut = -1;
  caption('');
}

let shownCaption = '';
function caption(text: string): void {
  if (text === shownCaption) return;
  shownCaption = text;
  const c = $('cap');
  c.classList.remove('on');
  void c.offsetWidth;
  c.textContent = text;
  if (text) c.classList.add('on');
}

function next(): void {
  if (fadeOut >= 0 || ended) return;
  // the last scene has nothing after it: go to the end title
  if (index >= MAKERS.length - 1) return end();
  fadeOut = 0;
}

function end(): void {
  ended = true;
  caption('');
  $('skip').hidden = true;
  $('end').hidden = false;
}

function restart(): void {
  ended = false;
  $('end').hidden = true;
  $('skip').hidden = false;
  load(0);
}

$('play').onclick = () => {
  started = true;
  $('start').hidden = true;
  $('skip').hidden = false;
  load(0);
};
$('skip').onclick = (e) => {
  e.stopPropagation();
  if (index < MAKERS.length - 1) load(MAKERS.length - 1);
  t = Math.max(t, 9.6);
};
$('again').onclick = restart;
$('view').onclick = () => {
  if (started && !ended) next();
};
addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.code === 'Escape') $('skip').click();
  else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') next();
});

function tick(dt: number): void {
  if (!stage) {
    // behind the start screen: the throne room, quietly
    load(0);
  }
  const s = stage!;
  if (started || index === 0) t += dt;
  if (!started) t = Math.min(t, 3.5);
  s.update(t, dt, camera);
  const dim = (s as Stage & { hemiDim?: () => number }).hemiDim?.() ?? 1;
  hemi.intensity = s.look.hemi.intensity * dim;
  sun.intensity = s.look.sun.intensity * dim;
  if (started && !ended) {
    let text = '';
    for (const c of s.captions) if (t >= c.at) text = c.text;
    caption(t > s.duration - 0.6 ? '' : text);
    const last = index === MAKERS.length - 1;
    if (t >= s.duration - (last ? 1.6 : 0) && fadeOut < 0) {
      if (last) end();
      else next();
    }
  }
  let black = 1 - Math.min(1, t / 0.6);
  if (fadeOut >= 0) {
    fadeOut += dt;
    black = Math.max(black, Math.min(1, fadeOut / 0.45));
    if (fadeOut > 0.5) {
      if (index + 1 < MAKERS.length) load(index + 1);
      else end();
    }
  }
  $('fade').style.opacity = String(black);
  effect.render(scene, camera);
}

declare global {
  interface Window {
    __tick: (dt: number) => void;
    __play: () => void;
    __ready: boolean;
  }
}
window.__tick = tick;
window.__play = () => $('play').click();
window.__ready = true;
if (new URLSearchParams(location.search).has('capture'))
  (window as unknown as { __scene: THREE.Scene }).__scene = scene;

if (!new URLSearchParams(location.search).has('capture')) {
  let last = performance.now();
  const loop = (now: number) => {
    tick(Math.min(0.05, (now - last) / 1000));
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
