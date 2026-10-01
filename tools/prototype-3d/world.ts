/**
 * 3D prototype: the level as a small lit diorama (stone floor, chunky walls,
 * torches, stairs), the die as a rounded cube wearing the game's own face art,
 * and skeletons as little toy figures.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GameState } from '../../src/engine';
import { drawFace } from '../../src/game/view/art';
import { roleColor } from '../../src/game/view/roles';
import { rules } from '../mockups/kit';

export interface Grid {
  w: number;
  h: number;
  at(x: number, y: number): THREE.Vector3;
}

export function grid(state: GameState): Grid {
  const cx = (state.width - 1) / 2;
  const cz = (state.height - 1) / 2;
  return { w: state.width, h: state.height, at: (x, y) => new THREE.Vector3(x - cx, 0, y - cz) };
}

/** Small deterministic noise so the stones look hand-laid but stay the same every run. */
const rand = (x: number, y: number, k = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const tileDef = (s: GameState, x: number, y: number) =>
  x < 0 || y < 0 || x >= s.width || y >= s.height
    ? null
    : rules.tiles.get(s.tiles[y * s.width + x]!);

export interface Torch {
  flame: THREE.Mesh;
  light: THREE.PointLight;
  seed: number;
}

export interface Built {
  root: THREE.Group;
  torches: Torch[];
  exitLight: THREE.PointLight | null;
  exitAt: THREE.Vector3 | null;
}

export function buildLevel(state: GameState, g: Grid): Built {
  const root = new THREE.Group();
  const torches: Torch[] = [];
  let exitLight: THREE.PointLight | null = null;
  let exitAt: THREE.Vector3 | null = null;

  const floorGeo = new RoundedBoxGeometry(0.96, 0.22, 0.96, 2, 0.04);
  const floorMats = [0, 1, 2].map((v) => {
    const t = stoneTexture('floor', v);
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 2.5, roughness: 0.9 });
  });
  const wallGeo = new RoundedBoxGeometry(0.98, 1, 0.98, 2, 0.05);
  const wallMats = [0, 1, 2].map((v) => {
    const t = stoneTexture('wall', v);
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 3, roughness: 0.85 });
  });
  const capGeo = new RoundedBoxGeometry(1.0, 0.12, 1.0, 2, 0.04);
  const capTex = stoneTexture('cap', 0);
  const capMat = new THREE.MeshStandardMaterial({
    map: capTex,
    bumpMap: capTex,
    bumpScale: 2,
    roughness: 0.8,
  });
  const pebbleGeo = new THREE.DodecahedronGeometry(0.05, 0);
  const pebbleMat = new THREE.MeshStandardMaterial({ color: '#5a5276', roughness: 1 });

  const nearOpen = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (tileDef(state, x + dx, y + dy)?.passable) return true;
    return false;
  };

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const def = tileDef(state, x, y)!;
      const p = g.at(x, y);
      if (def.goal) {
        exitAt = p.clone();
        root.add(buildStairs(p));
        exitLight = new THREE.PointLight('#ffcf6a', 3, 3.2, 2);
        exitLight.position.set(p.x, 0.5, p.z);
        root.add(exitLight);
      } else if (def.passable) {
        const m = new THREE.Mesh(floorGeo, floorMats[(x + y * 3 + Math.floor(rand(x, y) * 3)) % 3]);
        m.position.set(p.x, -0.11 + (rand(x, y, 1) - 0.5) * 0.025, p.z);
        m.rotation.y = (rand(x, y, 2) - 0.5) * 0.06;
        m.receiveShadow = true;
        root.add(m);
        if (rand(x, y, 3) > 0.7) {
          const pb = new THREE.Mesh(pebbleGeo, pebbleMat);
          pb.position.set(
            p.x + (rand(x, y, 4) - 0.5) * 0.6,
            0.02,
            p.z + (rand(x, y, 5) - 0.5) * 0.6,
          );
          pb.castShadow = true;
          root.add(pb);
        }
      } else if (nearOpen(x, y)) {
        const hgt = 0.7 + rand(x, y, 6) * 0.22;
        const m = new THREE.Mesh(wallGeo, wallMats[Math.floor(rand(x, y, 7) * 3)]);
        m.scale.y = hgt;
        m.position.set(p.x, hgt / 2 - 0.2, p.z);
        m.castShadow = true;
        m.receiveShadow = true;
        root.add(m);
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(p.x, hgt - 0.2 + 0.03, p.z);
        cap.castShadow = true;
        cap.receiveShadow = true;
        root.add(cap);
        // a torch on some walls that face the room
        const facesRoom =
          tileDef(state, x, y + 1)?.passable ||
          tileDef(state, x + 1, y)?.passable ||
          tileDef(state, x - 1, y)?.passable;
        if (facesRoom && rand(x, y, 8) > 0.72)
          torches.push(addTorch(root, p, hgt - 0.2 + 0.09, rand(x, y, 9)));
      }
    }
  }
  // the void below
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: '#0b0912', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  ground.receiveShadow = true;
  root.add(ground);
  return { root, torches, exitLight, exitAt };
}

function buildStairs(p: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(p);
  const dark = new THREE.MeshStandardMaterial({ color: '#15111f', roughness: 1 });
  const step = new THREE.MeshStandardMaterial({ color: '#7a6a8c', roughness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({
    color: '#e2b650',
    emissive: '#e2a030',
    emissiveIntensity: 0.6,
    roughness: 0.4,
    metalness: 0.5,
  });
  const pit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), dark);
  pit.position.y = -0.36;
  g.add(pit);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.2), step);
    s.position.set(0, -0.06 - i * 0.09, -0.3 + i * 0.2);
    s.receiveShadow = true;
    g.add(s);
  }
  const rim = new THREE.BoxGeometry(0.96, 0.06, 0.07);
  for (const [x, z, r] of [
    [0, -0.46, 0],
    [0, 0.46, 0],
    [-0.46, 0, Math.PI / 2],
    [0.46, 0, Math.PI / 2],
  ] as const) {
    const m = new THREE.Mesh(rim, gold);
    m.position.set(x, 0.01, z);
    m.rotation.y = r;
    g.add(m);
  }
  return g;
}

/** Hand-made looking stone: bricks for walls, a flagstone for floors. */
function stoneTexture(kind: 'wall' | 'floor' | 'cap', v: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const base =
    kind === 'wall'
      ? ['#4e4668', '#554c70', '#4a4263'][v]!
      : kind === 'cap'
        ? '#615777'
        : ['#857682', '#8b7c86', '#7f717d'][v]!;
  const r = (i: number) => {
    const s = Math.sin(i * 91.7 + v * 13.3) * 43758.5;
    return s - Math.floor(s);
  };
  x.fillStyle = kind === 'floor' ? '#2a2436' : '#2c263a';
  x.fillRect(0, 0, 256, 256);
  const shade = (hex: string, k: number) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (sh: number) => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * k)));
    return `rgb(${f(16)},${f(8)},${f(0)})`;
  };
  if (kind === 'wall') {
    const rows = 4;
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? -64 : 0;
      for (let col = 0; col < 3; col++) {
        const i = row * 7 + col;
        x.fillStyle = shade(base, 0.85 + r(i) * 0.3);
        x.beginPath();
        x.roundRect(off + col * 128 + 5, row * 64 + 5, 118, 54, 10);
        x.fill();
        if (off) {
          x.beginPath();
          x.roundRect(off + 3 * 128 + 5, row * 64 + 5, 118, 54, 10);
          x.fill();
        }
      }
    }
  } else {
    x.fillStyle = base;
    x.beginPath();
    x.roundRect(6, 6, 244, 244, 18);
    x.fill();
    if (kind === 'floor') {
      // a crack or two
      x.strokeStyle = 'rgba(30,24,40,0.55)';
      x.lineWidth = 3;
      x.beginPath();
      let px = 40 + r(1) * 170;
      let py = 10;
      x.moveTo(px, py);
      for (let k = 0; k < 5; k++) {
        px += (r(k + 3) - 0.5) * 60;
        py += 20 + r(k + 9) * 25;
        x.lineTo(px, py);
      }
      if (r(2) > 0.4) x.stroke();
    }
  }
  // speckle
  for (let i = 0; i < 900; i++) {
    x.fillStyle = r(i + 100) > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
    x.fillRect(r(i + 200) * 256, r(i + 300) * 256, 2 + r(i) * 3, 2 + r(i + 1) * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347' });
const flameCore = new THREE.MeshBasicMaterial({ color: '#fff1b0' });

function addTorch(root: THREE.Group, p: THREE.Vector3, top: number, seed: number): Torch {
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.03, 0.26, 6),
    new THREE.MeshStandardMaterial({ color: '#6b4528', roughness: 0.9 }),
  );
  stick.position.set(p.x, top + 0.13, p.z);
  root.add(stick);
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.05, 0.08, 8),
    new THREE.MeshStandardMaterial({ color: '#3b3346', metalness: 0.6, roughness: 0.4 }),
  );
  cup.position.set(p.x, top + 0.28, p.z);
  root.add(cup);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 10), flameMat);
  flame.position.set(p.x, top + 0.46, p.z);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 8), flameCore);
  core.position.y = -0.04;
  flame.add(core);
  root.add(flame);
  const light = new THREE.PointLight('#ff9a3c', 3, 4.6, 1.5);
  light.position.set(p.x, top + 0.55, p.z);
  root.add(light);
  return { flame, light, seed };
}

export function flicker(t: Torch, time: number): void {
  const f =
    0.85 + Math.sin(time * 11 + t.seed * 40) * 0.08 + Math.sin(time * 23 + t.seed * 13) * 0.06;
  t.light.intensity = 3 * f;
  t.flame.scale.set(1, f * 1.1, 1);
  t.flame.rotation.z = Math.sin(time * 7 + t.seed * 9) * 0.08;
}

// ---------- the die ----------

const faceTex = new Map<string, THREE.CanvasTexture>();

/** The game's own face art on an ivory face with a coloured panel. */
export function faceTexture(face: string, renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const hit = faceTex.get(face);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f4ead2';
  x.fillRect(0, 0, 256, 256);
  const shade = x.createRadialGradient(128, 128, 60, 128, 128, 190);
  shade.addColorStop(0, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(120,96,60,0.28)');
  x.fillStyle = shade;
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = roleColor(face);
  x.globalAlpha = 0.55;
  x.beginPath();
  x.roundRect(30, 30, 196, 196, 34);
  x.fill();
  x.globalAlpha = 1;
  x.strokeStyle = 'rgba(60,45,30,0.35)';
  x.lineWidth = 4;
  x.stroke();
  x.save();
  x.translate(128, 128);
  x.scale(4.2, 4.2);
  drawFace(x, face, 0, 0, 30);
  x.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  faceTex.set(face, tex);
  return tex;
}

/** Box material order: +x east, -x west, +y top, -y bottom, +z south, -z north. */
export const BOX_SLOTS = ['east', 'west', 'top', 'bottom', 'south', 'north'] as const;

export function buildDie(): { mesh: THREE.Mesh; mats: THREE.MeshStandardMaterial[] } {
  const mats = BOX_SLOTS.map(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.38, metalness: 0.02 }),
  );
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(0.84, 0.84, 0.84, 5, 0.13), mats);
  mesh.castShadow = true;
  return { mesh, mats };
}

// ---------- skeletons ----------

const bone = new THREE.MeshStandardMaterial({ color: '#efe8d6', roughness: 0.6 });
const socket = new THREE.MeshStandardMaterial({ color: '#1b1622', roughness: 1 });
const eyeGlow = new THREE.MeshBasicMaterial({ color: '#ff5a6a' });
const pipOn = new THREE.MeshBasicMaterial({ color: '#ff4f63' });
const pipOff = new THREE.MeshStandardMaterial({ color: '#3a3346' });

export interface Toy {
  group: THREE.Group;
  body: THREE.Group;
  parts: THREE.Mesh[];
  pips: THREE.Mesh[];
  mats: THREE.MeshStandardMaterial[];
}

export function buildSkeleton(hp: number, maxHp: number): Toy {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const parts: THREE.Mesh[] = [];
  const mat = bone.clone();
  const add = (
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    m: THREE.Material = mat,
  ) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    body.add(mesh);
    parts.push(mesh);
    return mesh;
  };
  const leg = new THREE.CylinderGeometry(0.035, 0.03, 0.22, 6);
  add(leg, -0.07, 0.11, 0);
  add(leg, 0.07, 0.11, 0);
  add(new THREE.BoxGeometry(0.2, 0.06, 0.1), 0, 0.24, 0);
  // ribcage: three ribs and a spine
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), 0, 0.36, -0.02);
  for (let i = 0; i < 3; i++) {
    const rib = add(
      new THREE.TorusGeometry(0.09 - i * 0.01, 0.018, 6, 12, Math.PI * 1.4),
      0,
      0.31 + i * 0.055,
      0.01,
    );
    rib.rotation.set(Math.PI / 2, 0, Math.PI * 0.8);
  }
  const arm = new THREE.CylinderGeometry(0.025, 0.02, 0.22, 6);
  add(arm, -0.15, 0.34, 0).rotation.z = 0.35;
  add(arm, 0.15, 0.34, 0).rotation.z = -0.35;
  const skull = add(new THREE.SphereGeometry(0.17, 18, 14), 0, 0.6, 0);
  skull.scale.set(1, 0.92, 0.95);
  add(new RoundedBoxGeometry(0.16, 0.07, 0.12, 2, 0.02), 0, 0.47, 0.04);
  for (const sx of [-0.065, 0.065]) {
    const s = add(new THREE.SphereGeometry(0.048, 10, 8), sx, 0.61, 0.135, socket);
    s.scale.z = 0.5;
    add(new THREE.SphereGeometry(0.018, 8, 6), sx, 0.61, 0.155, eyeGlow);
  }
  const pips: THREE.Mesh[] = [];
  for (let i = 0; i < maxHp; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), i < hp ? pipOn : pipOff);
    p.position.set((i - (maxHp - 1) / 2) * 0.13, 0.9, 0);
    group.add(p);
    pips.push(p);
  }
  body.scale.setScalar(1.35);
  for (const p of pips) p.position.y = 1.18;
  return { group, body, parts, pips, mats: [mat] };
}

export function setPips(t: Toy, hp: number): void {
  t.pips.forEach((p, i) => (p.material = i < hp ? pipOn : pipOff));
}
