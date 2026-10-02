/**
 * Low-poly toy models for the 3D story, built from primitives with a toon
 * look: people (the Queen, villagers, you), a goat, dice, the throne, the
 * Old Well, houses, trees, pillars, candles and flying scrolls.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { facesOf } from '../../src/game/view/cube';
import { faceTexture, BOX_SLOTS } from '../prototype-3d/world';
import { iconTexture } from './icons';

const tones = new Uint8Array([90, 170, 255]);
const gradient = new THREE.DataTexture(tones, 3, 1, THREE.RedFormat);
gradient.minFilter = THREE.NearestFilter;
gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;

const mats = new Map<string, THREE.MeshToonMaterial>();
/** A shared toon material per colour. */
export function toon(color: string, emissive?: string): THREE.MeshToonMaterial {
  const key = color + (emissive ?? '');
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradient });
    if (emissive) {
      m.emissive.set(emissive);
      m.emissiveIntensity = 1;
    }
    mats.set(key, m);
  }
  return m;
}

export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- people ----------

export interface Person {
  group: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** A smile, and an open "O" for gasping or talking. */
  smile: THREE.Mesh;
  gasp: THREE.Mesh;
  /** Where a die appears when this person turns into one. */
  height: number;
}

/** Mouth: 0 = smiling, 1 = wide open. */
export function mouth(p: Person, open: number): void {
  p.smile.visible = open < 0.35;
  p.gasp.visible = open >= 0.35;
  p.gasp.scale.set(0.8 + open * 0.3, 0.5 + open * 0.9, 0.5);
}

export interface PersonLook {
  robe: string;
  skin?: string;
  hair?: string;
  hat?: 'crown' | 'hood' | 'cap' | 'helmet' | 'none';
  hatColor?: string;
  trim?: string;
  scale?: number;
}

export function person(look: PersonLook): Person {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const skin = toon(look.skin ?? '#f1c9a5');
  const robe = toon(look.robe);
  body.add(mesh(new THREE.CylinderGeometry(0.26, 0.42, 0.95, 12), robe, 0, 0.48, 0));
  if (look.trim) {
    const hem = mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 20), toon(look.trim), 0, 0.06, 0);
    hem.rotation.x = Math.PI / 2;
    body.add(hem);
    const belt = mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20), toon(look.trim), 0, 0.62, 0);
    belt.rotation.x = Math.PI / 2;
    body.add(belt);
  }
  const head = new THREE.Group();
  head.position.y = 1.18;
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.27, 18, 14), skin, 0, 0, 0));
  const eye = toon('#231d2b');
  head.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), eye, -0.09, -0.01, 0.245));
  head.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), eye, 0.09, -0.01, 0.245));
  head.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), toon('#e8a888'), 0, -0.07, 0.27));
  const smile = mesh(
    new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI),
    toon('#5a2a2a'),
    0,
    -0.1,
    0.245,
  );
  smile.rotation.z = Math.PI;
  head.add(smile);
  const gasp = mesh(new THREE.SphereGeometry(0.05, 10, 8), toon('#3a1414'), 0, -0.14, 0.24);
  gasp.visible = false;
  head.add(gasp);
  const hair = toon(look.hair ?? '#5b3a22');
  const cap = mesh(
    new THREE.SphereGeometry(0.285, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    hair,
    0,
    0.03,
    -0.03,
  );
  cap.rotation.x = -0.55; // back and top of the head, leaving the face clear
  head.add(cap);
  const hatColor = toon(look.hatColor ?? '#ffd75e');
  switch (look.hat) {
    case 'crown': {
      const gold = toon('#ffd75e', '#6b4a00');
      head.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12, 1, true), gold, 0, 0.3, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        head.add(
          mesh(
            new THREE.ConeGeometry(0.045, 0.14, 6),
            gold,
            Math.cos(a) * 0.19,
            0.42,
            Math.sin(a) * 0.19,
          ),
        );
      }
      head.add(
        mesh(new THREE.SphereGeometry(0.035, 8, 6), toon('#e5485f', '#5a0010'), 0, 0.3, 0.2),
      );
      break;
    }
    case 'hood':
      head.add(mesh(new THREE.ConeGeometry(0.3, 0.42, 12), hatColor, 0, 0.3, -0.03));
      break;
    case 'cap':
      head.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), hatColor, 0, 0.18, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.14, 12), hatColor, 0, 0.26, 0));
      break;
    case 'helmet': {
      const steel = toon('#c9d2de');
      head.add(
        mesh(
          new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.4),
          steel,
          0,
          0.06,
          -0.02,
        ),
      );
      head.add(mesh(new THREE.ConeGeometry(0.05, 0.25, 6), toon('#e5485f'), 0, 0.38, -0.05));
      break;
    }
    default:
      break;
  }
  const arm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.3, 0.86, 0);
    g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.36, 4, 8), robe, 0, -0.2, 0));
    g.add(mesh(new THREE.SphereGeometry(0.075, 8, 6), skin, 0, -0.44, 0));
    g.rotation.z = side * 0.12;
    body.add(g);
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);
  group.scale.setScalar(look.scale ?? 1);
  return { group, body, head, armL, armR, smile, gasp, height: 1.5 * (look.scale ?? 1) };
}

/** A walk cycle at phase t (seconds). */
export function walk(p: Person, t: number, amount = 1): void {
  p.body.position.y = Math.abs(Math.sin(t * 8)) * 0.06 * amount;
  p.body.rotation.z = Math.sin(t * 8) * 0.05 * amount;
  p.armL.rotation.x = Math.sin(t * 8) * 0.6 * amount;
  p.armR.rotation.x = -Math.sin(t * 8) * 0.6 * amount;
}

/** Breathing and a little sway while standing. */
export function idle(p: Person, t: number, seed = 0): void {
  p.body.position.y = Math.sin(t * 2 + seed) * 0.012;
  p.head.rotation.z = Math.sin(t * 0.9 + seed) * 0.05;
}

export function goat(): { group: THREE.Group; head: THREE.Group; jaw: THREE.Group } {
  const group = new THREE.Group();
  const wool = toon('#f2efe6');
  const dark = toon('#5b4a3a');
  group.add(mesh(new RoundedBoxGeometry(0.75, 0.42, 0.42, 2, 0.12), wool, 0, 0.55, 0));
  for (const [x, z] of [
    [-0.25, -0.13],
    [0.25, -0.13],
    [-0.25, 0.13],
    [0.25, 0.13],
  ] as const)
    group.add(mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.38, 6), dark, x, 0.19, z));
  const head = new THREE.Group();
  head.position.set(0.45, 0.8, 0);
  group.add(head);
  head.add(mesh(new RoundedBoxGeometry(0.3, 0.26, 0.24, 2, 0.08), wool, 0.05, 0, 0));
  for (const z of [-0.07, 0.07]) {
    const horn = mesh(new THREE.ConeGeometry(0.04, 0.22, 6), dark, -0.04, 0.2, z);
    horn.rotation.z = 0.5;
    head.add(horn);
  }
  const beard = mesh(new THREE.ConeGeometry(0.035, 0.12, 6), wool, 0.12, -0.17, 0);
  beard.rotation.z = Math.PI;
  head.add(beard);
  // big googly eyes, pupils looking two different ways
  for (const [z, dy, dz] of [
    [0.1, 0.02, 0.015],
    [-0.1, -0.015, -0.02],
  ] as const) {
    head.add(mesh(new THREE.SphereGeometry(0.06, 12, 10), toon('#ffffff'), 0.14, 0.06, z));
    head.add(
      mesh(new THREE.SphereGeometry(0.028, 8, 6), toon('#231d2b'), 0.195, 0.06 + dy, z + dz),
    );
  }
  // a chewing mouth, with the corner of a page sticking out
  const jaw = new THREE.Group();
  jaw.position.set(0.16, -0.1, 0);
  head.add(jaw);
  jaw.add(mesh(new THREE.BoxGeometry(0.06, 0.03, 0.12), toon('#3a1414')));
  const page = mesh(new THREE.PlaneGeometry(0.1, 0.08), toon('#f4ead2'), 0.04, -0.01, 0.05);
  page.rotation.set(0.3, 0.8, 0.2);
  jaw.add(page);
  return { group, head, jaw };
}

// ---------- dice ----------

/** A die with the game's face art. `orient` picks which faces show. */
export function gameDie(
  renderer: THREE.WebGLRenderer,
  size = 0.8,
  loadout?: string[],
  tint?: string,
): THREE.Mesh {
  const die = {
    shape: 'd6',
    loadout: loadout ?? ['Shield', 'Heart', 'Bomb', 'Key', 'Sword', 'Coin'],
    orient: 0,
  } as const;
  const faces = facesOf(die);
  const ms = BOX_SLOTS.map(
    (slot) =>
      new THREE.MeshToonMaterial({
        map: faceTexture(faces[slot] ?? 'Pip1', renderer),
        color: tint ?? '#ffffff',
        gradientMap: gradient,
      }),
  );
  const m = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 4, size * 0.15), ms);
  m.castShadow = true;
  return m;
}

/**
 * A villager's die: three faces showing what they were (each twice, on
 * opposite sides), in their colour.
 */
export function roleDie(
  renderer: THREE.WebGLRenderer,
  icons: readonly string[],
  tint: string,
  size = 0.7,
): THREE.Mesh {
  // BOX_SLOTS order: east, west, top, bottom, south, north
  const order = [icons[1]!, icons[1]!, icons[0]!, icons[0]!, icons[2]!, icons[2]!];
  const ms = order.map(
    (name) =>
      new THREE.MeshToonMaterial({ map: iconTexture(name, tint, renderer), gradientMap: gradient }),
  );
  const m = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 4, size * 0.15), ms);
  m.castShadow = true;
  return m;
}

// ---------- sets ----------

export function throne(): THREE.Group {
  const g = new THREE.Group();
  const wood = toon('#7a2638');
  const gold = toon('#ffd75e', '#4a3000');
  g.add(mesh(new RoundedBoxGeometry(1.3, 0.5, 1.0, 2, 0.08), wood, 0, 0.25, 0));
  g.add(mesh(new RoundedBoxGeometry(1.3, 1.9, 0.22, 2, 0.08), wood, 0, 1.2, -0.45));
  g.add(mesh(new RoundedBoxGeometry(0.2, 0.75, 0.9, 2, 0.06), wood, -0.62, 0.65, 0));
  g.add(mesh(new RoundedBoxGeometry(0.2, 0.75, 0.9, 2, 0.06), wood, 0.62, 0.65, 0));
  g.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), gold, -0.6, 2.2, -0.45));
  g.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), gold, 0.6, 2.2, -0.45));
  g.add(mesh(new THREE.ConeGeometry(0.18, 0.4, 5), gold, 0, 2.35, -0.45));
  g.add(mesh(new RoundedBoxGeometry(1.0, 0.1, 0.75, 2, 0.04), toon('#c23a52'), 0, 0.52, 0.05));
  // steps
  g.add(mesh(new RoundedBoxGeometry(2.2, 0.16, 1.8, 2, 0.04), toon('#6b6182'), 0, -0.08, 0.2));
  return g;
}

export function pillar(h = 4): THREE.Group {
  const g = new THREE.Group();
  const stone = toon('#8a80a6');
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.36, h, 10), stone, 0, h / 2, 0));
  g.add(mesh(new RoundedBoxGeometry(0.9, 0.22, 0.9, 2, 0.05), stone, 0, 0.11, 0));
  g.add(mesh(new RoundedBoxGeometry(0.9, 0.22, 0.9, 2, 0.05), stone, 0, h - 0.11, 0));
  return g;
}

export function banner(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.PlaneGeometry(0.8, 1.8), toon(color), 0, 0, 0));
  const tip = mesh(new THREE.ConeGeometry(0.4, 0.4, 3), toon(color), 0, -1.0, 0);
  tip.rotation.z = Math.PI;
  tip.scale.z = 0.05;
  g.add(tip);
  g.add(mesh(new THREE.CircleGeometry(0.22, 16), toon('#ffd75e', '#3a2a00'), 0, 0.3, 0.01));
  return g;
}

export function candle(): { group: THREE.Group; flame: THREE.Mesh } {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), toon('#f2e8cf'), 0, 0.15, 0));
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.04, 0.12, 8),
    new THREE.MeshBasicMaterial({ color: '#ffcf6a' }),
  );
  flame.position.y = 0.37;
  group.add(flame);
  group.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 10), toon('#c8a24a'), 0, 0.02, 0));
  return { group, flame };
}

/** A sheet of paper with a mark on it (the Queen's endless decisions). */
export function scroll(mark: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 80;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f4ead2';
  x.fillRect(0, 0, 64, 80);
  x.strokeStyle = '#c9b48a';
  x.lineWidth = 4;
  x.strokeRect(2, 2, 60, 76);
  x.fillStyle = '#7a2638';
  x.font = '900 46px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(mark, 32, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.4),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  return m;
}

export function well(): { group: THREE.Group; water: THREE.Mesh } {
  const group = new THREE.Group();
  const stone = [toon('#8d8aa0'), toon('#7a768f'), toon('#a19db3')];
  const ring = 12;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + (row % 2) * (Math.PI / ring);
      const s = mesh(
        new RoundedBoxGeometry(0.42, 0.24, 0.26, 2, 0.06),
        stone[(i + row) % 3]!,
        Math.cos(a) * 0.85,
        0.12 + row * 0.25,
        Math.sin(a) * 0.85,
      );
      s.rotation.y = -a + Math.PI / 2;
      group.add(s);
    }
  }
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24),
    new THREE.MeshBasicMaterial({ color: '#1b3d52' }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.45;
  group.add(water);
  const wood = toon('#6b4528');
  group.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 6), wood, -0.95, 1.2, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 6), wood, 0.95, 1.2, 0));
  const axle = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6), wood, 0, 1.75, 0);
  axle.rotation.z = Math.PI / 2;
  group.add(axle);
  const roof = mesh(new THREE.ConeGeometry(1.5, 0.8, 4), toon('#a23b3b'), 0, 2.45, 0);
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  const bucket = mesh(
    new THREE.CylinderGeometry(0.14, 0.11, 0.2, 10),
    toon('#8a5a33'),
    0.3,
    1.25,
    0,
  );
  group.add(bucket);
  return { group, water };
}

export function house(wall: string, roofColor: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(1.6, 1.3, 1.4, 2, 0.06), toon(wall), 0, 0.65, 0));
  const roof = mesh(new THREE.ConeGeometry(1.35, 0.9, 4), toon(roofColor), 0, 1.75, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.05, 1, 0.95);
  g.add(roof);
  g.add(mesh(new RoundedBoxGeometry(0.36, 0.6, 0.05, 1, 0.02), toon('#6b4528'), 0, 0.3, 0.71));
  const win = toon('#ffd98a', '#a0701a');
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.28, 0.04), win, -0.5, 0.8, 0.71));
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.28, 0.04), win, 0.5, 0.8, 0.71));
  return g;
}

export function tree(s = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 6), toon('#6b4528'), 0, 0.3, 0));
  g.add(mesh(new THREE.ConeGeometry(0.6, 1.0, 7), toon('#3f8f4a'), 0, 1.0, 0));
  g.add(mesh(new THREE.ConeGeometry(0.45, 0.8, 7), toon('#52a85c'), 0, 1.5, 0));
  g.scale.setScalar(s);
  return g;
}

/** A speech or thought bubble, always facing the camera. */
export function bubble(text: string, width = 3.2): THREE.Sprite {
  const W = 512;
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  const font = '800 42px system-ui, sans-serif';
  x.font = font;
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const t = cur ? `${cur} ${w}` : w;
    if (x.measureText(t).width > W - 80 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  lines.push(cur);
  const box = 44 + lines.length * 48; // the bubble, without its tail
  const H = box + 52;
  c.width = W;
  c.height = H;
  x.fillStyle = '#fffaf0';
  x.strokeStyle = '#231d2b';
  x.lineWidth = 8;
  x.beginPath();
  x.roundRect(8, 8, W - 16, box, 36);
  x.moveTo(W / 2 - 24, box + 6);
  x.lineTo(W / 2, H - 8);
  x.lineTo(W / 2 + 24, box + 6);
  x.fill();
  x.stroke();
  x.fillRect(W / 2 - 22, box + 2, 44, 10);
  x.fillStyle = '#231d2b';
  x.font = font;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  lines.forEach((l, i) =>
    x.fillText(l, W / 2, 8 + box / 2 + (i - (lines.length - 1) / 2) * 48, W - 60),
  );
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  sp.scale.set(width, (width * H) / W, 1);
  sp.renderOrder = 20;
  return sp;
}

/** Soft round glow sprite (additive) for lights, magic and fireflies. */
let glowTex: THREE.CanvasTexture | null = null;
export function glowSprite(color: string, size: number): THREE.Sprite {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  sp.scale.setScalar(size);
  return sp;
}
