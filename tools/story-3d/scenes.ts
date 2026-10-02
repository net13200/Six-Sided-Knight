/**
 * The four opening scenes, each a little stage with its own set, lighting,
 * actors, camera path and captions:
 * 1. Oddmere: the Queen drowning in decisions, slumping on her throne.
 * 2. The Old Well: she walks out at night and makes her wish; it bursts.
 * 3. Morning: the wish sweeps the village and everyone pops into a die.
 * 4. You: cut off mid-sentence, you become the one die that rolls on purpose.
 */
import * as THREE from 'three';
import {
  banner,
  bubble,
  candle,
  gameDie,
  glowSprite,
  goat,
  house,
  idle,
  mesh,
  person,
  pillar,
  pipDie,
  scroll,
  throne,
  toon,
  tree,
  walk,
  well,
  type Person,
} from './models';
import { cameraAt, easeOut, elastic, Particles, Roller, smooth } from './kit3d';

export interface Look {
  background: string;
  fog: [number, number];
  sun: { color: string; intensity: number; pos: [number, number, number] };
  hemi: { sky: string; ground: string; intensity: number };
}

export interface Stage {
  root: THREE.Group;
  look: Look;
  duration: number;
  captions: { at: number; text: string }[];
  update(t: number, dt: number, cam: THREE.PerspectiveCamera): void;
}

export interface Ctx {
  renderer: THREE.WebGLRenderer;
}

function ground(color: string, size = 60): THREE.Mesh {
  const g = new THREE.Mesh(new THREE.CircleGeometry(size, 48), toon(color));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  return g;
}

function tiles(a: string, b: string, n = 16): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const s = 256 / 8;
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      x.fillStyle = (i + j) % 2 ? a : b;
      x.fillRect(i * s, j * s, s, s);
      x.strokeStyle = 'rgba(0,0,0,0.25)';
      x.strokeRect(i * s, j * s, s, s);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(n / 8, n / 8);
  tex.magFilter = THREE.NearestFilter;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(n, n), new THREE.MeshToonMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

const noOutline = (o: THREE.Object3D) => {
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.Material | undefined;
    if (m) m.userData.outlineParameters = { visible: false };
  });
};

// ================= 1. Oddmere =================

export function throneRoom(): Stage {
  const root = new THREE.Group();
  root.add(tiles('#5c4f78', '#6c5f8a', 20));
  const carpet = mesh(new THREE.PlaneGeometry(2.2, 14), toon('#a3283f'), 0, 0.01, 3);
  carpet.rotation.x = -Math.PI / 2;
  root.add(carpet);
  const wall = mesh(new THREE.BoxGeometry(20, 8, 0.5), toon('#3d3452'), 0, 4, -3.2);
  root.add(wall);
  // tall windows with light pouring in
  for (const x of [-4.5, 4.5]) {
    const win = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 3.2),
      new THREE.MeshBasicMaterial({ color: '#ffe6b0' }),
    );
    win.position.set(x, 3.6, -2.94);
    noOutline(win);
    root.add(win);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 1.8, 7, 4, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#ffd99a',
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    shaft.position.set(x * 0.75, 2.2, -0.6);
    shaft.rotation.set(0.75, Math.PI / 4, 0);
    noOutline(shaft);
    root.add(shaft);
  }
  for (const [x, c] of [
    [-2.2, '#2f5fb0'],
    [2.2, '#2f5fb0'],
  ] as const) {
    const b = banner(c);
    b.position.set(x, 4.3, -2.92);
    root.add(b);
  }
  for (const z of [-1, 2.5, 6]) {
    for (const x of [-3, 3]) {
      const p = pillar(5);
      p.position.set(x, 0, z);
      root.add(p);
    }
  }
  const th = throne();
  th.position.set(0, 0.16, -1.6);
  root.add(th);
  const flames: THREE.Mesh[] = [];
  const lights: THREE.PointLight[] = [];
  for (const x of [-1.6, 1.6]) {
    const stand = mesh(
      new THREE.CylinderGeometry(0.06, 0.12, 1.2, 8),
      toon('#c8a24a'),
      x,
      0.6,
      -1.0,
    );
    root.add(stand);
    const c = candle();
    c.group.position.set(x, 1.2, -1.0);
    root.add(c.group);
    flames.push(c.flame);
    const l = new THREE.PointLight('#ffad5a', 6, 6, 1.6);
    l.position.set(x, 1.7, -0.9);
    root.add(l);
    lights.push(l);
    const g = glowSprite('#ffb560', 0.7);
    g.position.set(x, 1.58, -1.0);
    noOutline(g);
    root.add(g);
  }
  const queen = person({ robe: '#7d3fb3', hat: 'crown', hair: '#c9c2cf', trim: '#ffd75e' });
  queen.group.position.set(0, 0.62, -1.45);
  root.add(queen.group);
  // the endless decisions
  const marks = ['?', '!', '?', '§', '…', '?', '!', '%', '?', '#', '?', '!', '?', '&'];
  const papers = marks.map((m, i) => {
    const s = scroll(m);
    noOutline(s);
    root.add(s);
    return {
      s,
      a: (i / marks.length) * Math.PI * 2,
      r: 1.2 + (i % 3) * 0.45,
      h: 1.1 + (i % 4) * 0.45,
      v: new THREE.Vector3(),
      fallen: false,
    };
  });
  const sigh = new Particles(root);
  let sighed = false;

  return {
    root,
    duration: 10,
    look: {
      background: '#140d1c',
      fog: [10, 26],
      sun: { color: '#ffd9a0', intensity: 1.6, pos: [-4, 8, -1] },
      hemi: { sky: '#8a7aff', ground: '#3a2010', intensity: 0.9 },
    },
    captions: [
      { at: 0.6, text: 'In Oddmere, the Queen decided everything.' },
      { at: 5.2, text: 'After forty years, she was tired.' },
    ],
    update(t, dt, cam) {
      cameraAt(
        [
          { t: 0, p: [0, 1.7, 11], l: [0, 1.6, -1] },
          { t: 4.5, p: [2.6, 2.4, 5], l: [0, 1.7, -1.4] },
          { t: 10, p: [0.7, 1.9, 2.4], l: [0, 1.55, -1.4] },
        ],
        t,
        cam,
      );
      for (const [i, f] of flames.entries()) {
        const k = 0.85 + Math.sin(t * 13 + i * 3) * 0.1 + Math.sin(t * 29 + i) * 0.06;
        f.scale.set(1, k, 1);
        lights[i]!.intensity = 6 * k;
      }
      const busy = 1 - smooth((t - 5) / 1.2);
      // deciding, deciding: head darting, arms waving
      queen.head.rotation.y = Math.sin(t * 5.5) * 0.6 * busy;
      queen.armR.rotation.x = -0.6 - Math.sin(t * 7) * 0.7 * busy;
      queen.armL.rotation.x = -0.4 - Math.sin(t * 6 + 1) * 0.6 * busy;
      // ...then she slumps
      const slump = smooth((t - 5.6) / 1.4);
      queen.body.rotation.x = slump * 0.3;
      queen.head.rotation.x = slump * 0.45;
      queen.armL.rotation.z = -0.12 - slump * 0.25;
      queen.armR.rotation.z = 0.12 + slump * 0.25;
      if (t > 7 && !sighed) {
        sighed = true;
        sigh.puff(new THREE.Vector3(0.1, 1.85, -0.9), 5, 0.1);
      }
      sigh.update(dt);
      for (const p of papers) {
        if (t < 5.6) {
          p.a += dt * (1.2 + p.r * 0.3);
          p.s.position.set(
            Math.cos(p.a) * p.r,
            p.h + 0.5 + Math.sin(t * 2 + p.a) * 0.15,
            -1.3 + Math.sin(p.a) * p.r * 0.7,
          );
          p.s.rotation.set(
            Math.sin(t * 3 + p.a) * 0.4,
            -p.a + Math.PI / 2,
            Math.cos(t * 2 + p.a) * 0.3,
          );
        } else {
          // the papers drift down to the floor
          if (!p.fallen) {
            p.fallen = true;
            p.v.set(Math.cos(p.a) * 0.5, 0, Math.sin(p.a) * 0.5);
          }
          if (p.s.position.y > 0.03) {
            p.v.y -= dt * 2.2;
            p.v.y = Math.max(p.v.y, -1.3);
            p.s.position.addScaledVector(p.v, dt);
            p.s.rotation.x += dt * 2;
            p.s.rotation.z += dt * 1.3;
          } else {
            p.s.position.y = 0.02;
            p.s.rotation.set(-Math.PI / 2, 0, p.a);
          }
        }
      }
    },
  };
}

// ================= 2. The Old Well =================

function nightSky(root: THREE.Group): THREE.Points {
  const pts: number[] = [];
  for (let i = 0; i < 400; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = 0.15 + Math.random() * 1.2;
    pts.push(Math.cos(a) * Math.cos(e) * 45, Math.sin(e) * 45, Math.sin(a) * Math.cos(e) * 45);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.PointsMaterial({ color: '#ffffff', size: 0.18, fog: false }),
  );
  root.add(stars);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(2, 20, 16),
    new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false }),
  );
  moon.position.set(-14, 16, -30);
  noOutline(moon);
  root.add(moon);
  const halo = glowSprite('#bcd0ff', 14);
  halo.material.fog = false;
  halo.position.copy(moon.position);
  root.add(halo);
  return stars;
}

export function oldWell(): Stage {
  const root = new THREE.Group();
  root.add(ground('#24402f'));
  nightSky(root);
  const w = well();
  root.add(w.group);
  const waterMat = w.water.material as THREE.MeshBasicMaterial;
  for (const [x, z, c, r] of [
    [-7, -7, '#c9b48a', '#5a3d6b'],
    [6, -8, '#bfae8f', '#3d5a6b'],
    [10, -3, '#c9b48a', '#6b3d3d'],
  ] as const) {
    const h = house(c, r);
    h.position.set(x, 0, z);
    h.rotation.y = -x * 0.04;
    root.add(h);
  }
  for (const [x, z, s] of [
    [-4, -4, 1.2],
    [4, -5, 1.4],
    [-9, 1, 1.1],
    [8, 2, 1.3],
    [-2.5, -7, 1.5],
  ] as const) {
    const tr = tree(s);
    tr.position.set(x, 0, z);
    root.add(tr);
  }
  for (let i = 0; i < 40; i++) {
    const tuft = mesh(
      new THREE.ConeGeometry(0.06, 0.25, 4),
      toon('#3f6b4a'),
      (Math.random() - 0.5) * 18,
      0.12,
      (Math.random() - 0.5) * 12,
    );
    root.add(tuft);
  }
  const queen = person({ robe: '#7d3fb3', hat: 'crown', hair: '#c9c2cf', trim: '#ffd75e' });
  root.add(queen.group);
  const wish = bubble('I wish I never had to decide anything again.', 2.3);
  wish.visible = false;
  root.add(wish);
  const wellLight = new THREE.PointLight('#7fe6ff', 0, 12, 1.4);
  wellLight.position.set(0, 1.2, 0);
  root.add(wellLight);
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#8ff0ff',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  beamMat.userData.outlineParameters = { visible: false };
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 14, 20, 1, true), beamMat);
  beam.position.y = 7.4;
  root.add(beam);
  const waveMat = new THREE.MeshBasicMaterial({
    color: '#9ff3ff',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  waveMat.userData.outlineParameters = { visible: false };
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), waveMat);
  wave.rotation.x = -Math.PI / 2;
  wave.position.y = 0.05;
  root.add(wave);
  const fx = new Particles(root);
  const flies = Array.from({ length: 14 }, (_, i) => {
    const g = glowSprite('#d8ff8a', 0.18);
    root.add(g);
    return { g, a: i * 1.7, r: 2 + (i % 5) };
  });
  const start = new THREE.Vector3(-6.5, 0, 2.6);
  const stop = new THREE.Vector3(-1.25, 0, 0.35);

  return {
    root,
    duration: 11,
    look: {
      background: '#0a1322',
      fog: [14, 42],
      sun: { color: '#9fb8ff', intensity: 1.1, pos: [-8, 12, -6] },
      hemi: { sky: '#4060a0', ground: '#101820', intensity: 0.7 },
    },
    captions: [
      { at: 0.6, text: 'So she went to the Old Well and made a wish.' },
      { at: 7, text: 'The Well was generous. Too generous.' },
    ],
    update(t, dt, cam) {
      cameraAt(
        [
          { t: 0, p: [-8, 2.4, 8], l: [-4, 1.1, 0.5] },
          { t: 4, p: [-3.8, 2.1, 4.6], l: [-0.8, 1.3, 0] },
          // hold wide enough to read her wish above her
          { t: 5.2, p: [-2.4, 2.2, 5.6], l: [-0.9, 1.75, 0.2] },
          { t: 6.6, p: [-2.1, 2.2, 5.3], l: [-0.8, 1.75, 0.2] },
          { t: 7.6, p: [-1.4, 1.6, 3.8], l: [-0.2, 1.7, 0] },
          { t: 11, p: [2, 8, 13], l: [0, 1, 0] },
        ],
        t,
        cam,
      );
      // she walks to the Well
      const k = smooth(t / 4);
      queen.group.position.lerpVectors(start, stop, k);
      queen.group.rotation.y =
        Math.atan2(stop.x - start.x, stop.z - start.z) * (1 - smooth((t - 3.6) / 0.6)) +
        (Math.PI / 2 - 0.25) * smooth((t - 3.6) / 0.6);
      if (t < 4) walk(queen, t, 1 - smooth((t - 3.5) / 0.5));
      else idle(queen, t);
      // leaning in to make the wish
      const lean = smooth((t - 4.2) / 0.6) * (1 - smooth((t - 7.1) / 0.3));
      queen.body.rotation.x = lean * 0.35;
      queen.armR.rotation.x = -lean * 1.2;
      wish.visible = t > 4.5 && t < 7;
      wish.position.set(-1.0, 2.5 + Math.sin(t * 2) * 0.04, 0.35);
      // the Well answers
      const glow = smooth((t - 6.2) / 0.8);
      waterMat.color.set('#1b3d52').lerp(new THREE.Color('#bff8ff'), glow);
      wellLight.intensity = glow * 14;
      beamMat.opacity = glow * 0.35 * (1 - smooth((t - 9.5) / 1.2));
      beam.scale.set(1 + Math.sin(t * 8) * 0.05, 1, 1 + Math.sin(t * 8) * 0.05);
      if (t > 6.2 && t < 9.6 && Math.floor(t * 12) !== Math.floor((t - dt) * 12))
        fx.sparkle(new THREE.Vector3(0, 0.6, 0), '#aef6ff', 3, 0.5, 3.5, 0.35);
      // she staggers back as the wave bursts out
      if (t > 7.1) {
        const back = easeOut((t - 7.1) / 0.6);
        queen.group.position.x = stop.x - back * 0.6;
        queen.body.rotation.x = -back * 0.25;
        queen.armL.rotation.x = -back * 2.2;
        queen.armR.rotation.x = -back * 2.2;
      }
      const wk = Math.max(0, (t - 7.1) / 3);
      wave.scale.setScalar(0.5 + wk * 28);
      waveMat.opacity = t > 7.1 ? 0.9 * (1 - smooth(wk)) : 0;
      for (const f of flies) {
        f.a += dt * 0.5;
        f.g.position.set(
          Math.cos(f.a) * f.r,
          0.6 + Math.sin(t * 1.3 + f.a) * 0.4,
          Math.sin(f.a * 1.3) * f.r - 1,
        );
        f.g.material.opacity = 0.5 + Math.sin(t * 4 + f.a) * 0.5;
      }
      fx.update(dt);
    },
  };
}

// ================= 3. Morning: everyone becomes a die =================

interface Villager {
  p?: Person;
  goat?: ReturnType<typeof goat>;
  die: Roller;
  pos: THREE.Vector3;
  turned: boolean;
  born?: number;
  seed: number;
}

function village(root: THREE.Group, grassy = '#7fbf5f'): void {
  root.add(ground(grassy));
  const path = mesh(new THREE.CircleGeometry(4.2, 32), toon('#d9c79a'), 0, 0.01, 0);
  path.rotation.x = -Math.PI / 2;
  root.add(path);
  for (const [x, z, c, r, ry] of [
    [-6, -5, '#f0e2c2', '#c0503c', 0.5],
    [0, -7.5, '#e8d6b0', '#3c6bc0', 0],
    [6, -5, '#f0e2c2', '#8a4fb0', -0.5],
    [-8.5, 1.5, '#e8d6b0', '#3c9a6b', 1.2],
    [8.5, 1.5, '#f0e2c2', '#c08a3c', -1.2],
  ] as const) {
    const h = house(c, r);
    h.position.set(x, 0, z);
    h.rotation.y = ry;
    root.add(h);
  }
  for (const [x, z, s] of [
    [-3.5, -8, 1.3],
    [3.5, -9, 1.5],
    [-10, -3, 1.4],
    [10, -3, 1.2],
    [-6, 5, 1.1],
    [6.5, 5.5, 1.3],
  ] as const) {
    const tr = tree(s);
    tr.position.set(x, 0, z);
    root.add(tr);
  }
}

const FOLK: {
  robe: string;
  hat: 'hood' | 'cap' | 'none';
  hatColor?: string;
  hair: string;
  at: [number, number];
}[] = [
  { robe: '#c0503c', hat: 'cap', hatColor: '#5a3d2b', hair: '#3a2a1a', at: [-2.4, -1.2] },
  { robe: '#3c8ac0', hat: 'none', hair: '#e0b050', at: [-0.8, -2.2] },
  { robe: '#5aa05a', hat: 'hood', hatColor: '#3d6b3d', hair: '#3a2a1a', at: [1.2, -1.8] },
  { robe: '#c08a3c', hat: 'cap', hatColor: '#7a2638', hair: '#5b3a22', at: [2.6, -0.4] },
  { robe: '#8a4fb0', hat: 'none', hair: '#2a1a12', at: [-2.8, 1.0] },
];

export function morning(ctx: Ctx): Stage {
  const root = new THREE.Group();
  village(root);
  const fx = new Particles(root);
  const folk: Villager[] = FOLK.map((f, i) => {
    const p = person({ robe: f.robe, hat: f.hat, hatColor: f.hatColor, hair: f.hair, scale: 0.9 });
    p.group.position.set(f.at[0], 0, f.at[1]);
    p.group.rotation.y = Math.atan2(-f.at[0], 4 - f.at[1]) + (i % 2 ? 0.4 : -0.4);
    root.add(p.group);
    const d = pipDie(ctx.renderer, f.robe, 0.7);
    d.position.set(f.at[0], 0.35, f.at[1]);
    d.scale.setScalar(0);
    root.add(d);
    return {
      p,
      die: new Roller(d, 0.7, 4.2),
      pos: new THREE.Vector3(f.at[0], 0, f.at[1]),
      turned: false,
      seed: i,
    };
  });
  // the goat, eating the council's notes
  const g = goat();
  g.group.position.set(1.4, 0, 1.4);
  g.group.rotation.y = 2.5;
  root.add(g.group);
  const notes = scroll('§');
  notes.position.set(0.9, 0.03, 1.7);
  notes.rotation.x = -Math.PI / 2;
  noOutline(notes);
  root.add(notes);
  const gd = pipDie(ctx.renderer, '#f2efe6', 0.6);
  for (const s of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.05, 0.25, 6), toon('#5b4a3a'), s * 0.15, 0.38, 0);
    horn.rotation.z = -s * 0.3;
    gd.add(horn);
  }
  gd.position.set(1.4, 0.3, 1.4);
  gd.scale.setScalar(0);
  root.add(gd);
  folk.push({
    goat: g,
    die: new Roller(gd, 0.6, 4.2),
    pos: new THREE.Vector3(1.4, 0, 1.4),
    turned: false,
    seed: 9,
  });

  const waveMat = new THREE.MeshBasicMaterial({
    color: '#7fe8ff',
    transparent: true,
    opacity: 0.5,
    blending: THREE.NormalBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  waveMat.userData.outlineParameters = { visible: false };
  const wave = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.1, 64, 1, true), waveMat);
  const origin = new THREE.Vector3(-14, 0, -10);
  wave.position.copy(origin).setY(0.55);
  root.add(wave);

  return {
    root,
    duration: 10.5,
    look: {
      background: '#8cc8ee',
      fog: [18, 46],
      sun: { color: '#fff1d6', intensity: 2.4, pos: [8, 12, 6] },
      hemi: { sky: '#cfe8ff', ground: '#5a7a3a', intensity: 1.1 },
    },
    captions: [
      { at: 0.6, text: 'By morning, everyone in Oddmere was a die.' },
      { at: 6, text: 'Even the goat. Nobody decides anything now.' },
    ],
    update(t, dt, cam) {
      cameraAt(
        [
          { t: 0, p: [1, 2.6, 9], l: [0, 1, -0.5] },
          { t: 4.5, p: [5.5, 3.4, 7], l: [0, 0.8, -0.5] },
          { t: 10.5, p: [-2, 6.5, 9.5], l: [0, 0.3, -0.3] },
        ],
        t,
        cam,
      );
      const r = Math.max(0, (t - 0.8) * 5.2);
      wave.scale.set(r, 1, r);
      waveMat.opacity = 0.5 * (1 - smooth((t - 6) / 1.5));
      for (const v of folk) {
        if (!v.turned) {
          if (v.p) idle(v.p, t, v.seed);
          if (v.goat) v.goat.head.rotation.z = -0.5 + Math.abs(Math.sin(t * 5)) * 0.35;
          if (v.pos.distanceTo(origin) < r) {
            v.turned = true;
            v.born = t;
            fx.puff(v.pos.clone().setY(0.6), 9, 0.22);
            v.die.mesh.rotation.y = (v.seed % 4) * (Math.PI / 2); // square to the grid, so rolls land flat
          }
        } else {
          const born = v.born ?? t;
          const obj = v.p?.group ?? v.goat!.group;
          const gone = (t - born) / 0.15;
          obj.scale.setScalar(Math.max(0.001, 1 - gone));
          obj.visible = gone < 1;
          const k = (t - born - 0.05) / 0.6;
          if (k < 1) v.die.mesh.scale.setScalar(k <= 0 ? 0.001 : Math.max(0.001, elastic(k)));
          else {
            v.die.mesh.scale.setScalar(1);
            v.die.wander = t > born + 1;
          }
          v.die.update(dt);
        }
      }
      if (t > 3 && notes.visible && folk.at(-1)!.turned) notes.visible = t < 3.5;
      fx.update(dt);
    },
  };
}

// ================= 4. You =================

export function you(ctx: Ctx): Stage {
  const root = new THREE.Group();
  village(root);
  const fx = new Particles(root);
  const knight = person({ robe: '#2f5fb0', hat: 'helmet', hair: '#5b3a22', trim: '#ffd75e' });
  root.add(knight.group);
  const said = bubble('Wait! I was just about to say...', 3);
  said.position.set(0, 2.35, 0);
  root.add(said);
  const me = gameDie(ctx.renderer, 0.8);
  me.position.set(0, 0.4, 0);
  me.scale.setScalar(0);
  root.add(me);
  const mine = new Roller(me, 0.8, 6);
  // everyone else, tumbling about at random
  const others = FOLK.map((f, i) => {
    const d = pipDie(ctx.renderer, f.robe, 0.7);
    const a = (i / FOLK.length) * Math.PI * 2;
    d.position.set(
      Math.round((Math.cos(a) * 3.2) / 0.7) * 0.7,
      0.35,
      Math.round((Math.sin(a) * 1.4 - 3) / 0.7) * 0.7,
    );
    root.add(d);
    const r = new Roller(d, 0.7, 3.4, new THREE.Vector3(0, 0, -3));
    r.wander = true;
    return r;
  });
  const spot = new THREE.SpotLight('#ffe2a8', 0, 14, 0.35, 0.6, 1.2);
  spot.position.set(0, 9, 3);
  spot.target = me;
  root.add(spot);
  const halo = glowSprite('#ffd75e', 2.4);
  halo.material.opacity = 0;
  root.add(halo);
  const wave = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1.1, 64, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#7fe8ff',
      transparent: true,
      opacity: 0.5,
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
  );
  noOutline(wave);
  wave.position.set(-6, 0.55, -6);
  root.add(wave);
  let turned = false;
  let turnedAt = 0;
  const plan: { at: number; dir: 'N' | 'E' | 'S' | 'W' }[] = [
    { at: 6.3, dir: 'S' },
    { at: 7.0, dir: 'S' },
    { at: 8.1, dir: 'E' },
    { at: 8.8, dir: 'S' },
  ];
  let landed = 0;
  let hemiDim = 1;

  const stage: Stage & { hemiDim: () => number } = {
    root,
    duration: 12,
    look: {
      background: '#8cc8ee',
      fog: [18, 46],
      sun: { color: '#fff1d6', intensity: 2.4, pos: [8, 12, 6] },
      hemi: { sky: '#cfe8ff', ground: '#5a7a3a', intensity: 1.1 },
    },
    captions: [
      { at: 3.6, text: 'You were halfway through saying something important.' },
      { at: 7.2, text: 'You mean to finish the sentence. So you roll on purpose.' },
    ],
    hemiDim: () => hemiDim,
    update(t, dt, cam) {
      cameraAt(
        [
          { t: 0, p: [0.3, 1.7, 4.6], l: [0, 1.35, 0] },
          { t: 3, p: [0.4, 2, 5.4], l: [0, 1, 0] },
          { t: 5.5, p: [3.5, 4, 7.5], l: [0, 0.5, 0.5] },
          { t: 12, p: [1, 3.2, 7.5], l: [0.4, 0.5, 2.2] },
        ],
        t,
        cam,
      );
      if (!turned) {
        idle(knight, t);
        knight.armR.rotation.x = -1.4 - Math.sin(t * 6) * 0.3;
        knight.armR.rotation.z = 0.4;
        knight.head.rotation.x = Math.sin(t * 9) * 0.06;
        said.visible = t > 0.4;
        const r = Math.max(0, (t - 1) * 4.2);
        wave.scale.set(r, 1, r);
        if (r > Math.hypot(6, 6)) {
          turned = true;
          turnedAt = t;
          said.visible = false;
          fx.puff(new THREE.Vector3(0, 0.7, 0), 12, 0.25);
        }
      } else {
        const k = (t - turnedAt) / 0.18;
        knight.group.scale.setScalar(Math.max(0.001, 1 - k));
        knight.group.visible = k < 1;
        const p = (t - turnedAt - 0.05) / 0.7;
        me.scale.setScalar(p <= 0 ? 0.001 : p < 1 ? Math.max(0.001, elastic(p)) : 1);
        const r = Math.max(0, (t - 1) * 4.2);
        wave.scale.set(r, 1, r);
        (wave.material as THREE.MeshBasicMaterial).opacity =
          0.8 * (1 - smooth((t - turnedAt) / 1.2));
      }
      // the world dims; a light finds you
      const focus = smooth((t - 4.6) / 1.2);
      hemiDim = 1 - focus * 0.55;
      spot.intensity = focus * 60;
      halo.position.copy(me.position).setY(0.05);
      halo.material.opacity = focus * 0.35;
      for (const step of plan) {
        if (t >= step.at && landed === plan.indexOf(step) && !mine.rolling) {
          mine.roll(step.dir, 0.34);
          landed++;
        }
      }
      mine.update(dt, (r) => fx.puff(r.mesh.position.clone().setY(0.05), 6, 0.08));
      for (const o of others) o.update(dt);
      fx.update(dt);
    },
  };
  return stage;
}
