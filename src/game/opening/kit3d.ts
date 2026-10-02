/** Shared pieces for the 3D story: particles, rolling dice, camera paths, easing. */
import * as THREE from 'three';
import { glowSprite } from './models';

export const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
export const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
export const elastic = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  if (x === 0 || x === 1) return x;
  return 2 ** (-9 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

export type V = [number, number, number];
export interface Key {
  t: number;
  p: V;
  l: V;
}

/** Camera along keyframes, eased between each pair. */
export function cameraAt(keys: readonly Key[], t: number, cam: THREE.PerspectiveCamera): void {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1]!.t) i++;
  const a = keys[i]!;
  const b = keys[Math.min(i + 1, keys.length - 1)]!;
  const k = b.t === a.t ? 1 : smooth((t - a.t) / (b.t - a.t));
  const mix = (u: V, v: V) =>
    new THREE.Vector3(u[0] + (v[0] - u[0]) * k, u[1] + (v[1] - u[1]) * k, u[2] + (v[2] - u[2]) * k);
  cam.position.copy(mix(a.p, b.p));
  cam.lookAt(mix(a.l, b.l));
}

// ---------- particles ----------

interface P {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  age: number;
  life: number;
  grow: number;
  gravity: number;
  mat: THREE.Material & { opacity: number };
  base: number;
}

export class Particles {
  private ps: P[] = [];
  constructor(private readonly root: THREE.Object3D) {}

  private add(
    obj: THREE.Object3D,
    mat: THREE.Material & { opacity: number },
    o: Partial<P> & { life: number },
  ) {
    mat.transparent = true;
    this.root.add(obj);
    this.ps.push({
      obj,
      mat,
      vel: o.vel ?? new THREE.Vector3(),
      age: 0,
      life: o.life,
      grow: o.grow ?? 0,
      gravity: o.gravity ?? 0,
      base: o.base ?? mat.opacity,
    });
  }

  /** A cartoon puff of smoke. */
  puff(at: THREE.Vector3, n = 9, size = 0.25): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.MeshBasicMaterial({ color: '#ffffff', opacity: 0.95, depthWrite: false });
      m.userData.outlineParameters = { visible: false };
      const s = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), m);
      const a = (i / n) * Math.PI * 2;
      s.position
        .copy(at)
        .add(new THREE.Vector3(Math.cos(a) * 0.2, Math.random() * 0.5, Math.sin(a) * 0.2));
      this.add(s, m, {
        life: 0.55 + Math.random() * 0.2,
        vel: new THREE.Vector3(Math.cos(a) * 1.4, 0.8 + Math.random(), Math.sin(a) * 1.4),
        grow: 1.8,
      });
    }
  }

  sparkle(at: THREE.Vector3, color: string, n: number, spread = 0.5, up = 1.5, size = 0.25): void {
    for (let i = 0; i < n; i++) {
      const s = glowSprite(color, size * (0.6 + Math.random() * 0.8));
      s.material.userData.outlineParameters = { visible: false };
      s.position
        .copy(at)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * spread * 2,
            Math.random() * spread,
            (Math.random() - 0.5) * spread * 2,
          ),
        );
      this.add(s, s.material, {
        life: 0.8 + Math.random() * 0.8,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          up * (0.5 + Math.random()),
          (Math.random() - 0.5) * 0.6,
        ),
      });
    }
  }

  update(dt: number): void {
    for (const p of this.ps) {
      p.age += dt;
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(1 - dt * 1.5);
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.grow) p.obj.scale.multiplyScalar(1 + p.grow * dt);
      const k = p.age / p.life;
      p.mat.opacity = p.base * (k < 0.5 ? 1 : Math.max(0, (1 - k) / 0.5));
    }
    this.ps = this.ps.filter((p) => {
      if (p.age < p.life) return true;
      p.obj.removeFromParent();
      return false;
    });
  }
}

// ---------- a die that rolls over its edges ----------

export type Dir = 'N' | 'E' | 'S' | 'W';
const DV: Record<Dir, THREE.Vector3> = {
  N: new THREE.Vector3(0, 0, -1),
  E: new THREE.Vector3(1, 0, 0),
  S: new THREE.Vector3(0, 0, 1),
  W: new THREE.Vector3(-1, 0, 0),
};
const AXIS: Record<Dir, THREE.Vector3> = {
  N: new THREE.Vector3(-1, 0, 0),
  S: new THREE.Vector3(1, 0, 0),
  E: new THREE.Vector3(0, 0, -1),
  W: new THREE.Vector3(0, 0, 1),
};

/** Rounds a rotation to the nearest quarter turns, so a die always sits flat. */
function snapRight(q: THREE.Quaternion): void {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const e = m.elements;
  const axis = (x: number, y: number, z: number) => {
    const a = [Math.abs(x), Math.abs(y), Math.abs(z)];
    const i = a.indexOf(Math.max(...a));
    const v = [0, 0, 0];
    v[i] = Math.sign([x, y, z][i]!);
    return new THREE.Vector3(v[0], v[1], v[2]);
  };
  const xa = axis(e[0]!, e[1]!, e[2]!);
  const ya = axis(e[4]!, e[5]!, e[6]!);
  const za = new THREE.Vector3().crossVectors(xa, ya);
  q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xa, ya, za));
}

export class Roller {
  private anim: {
    dir: Dir;
    t: number;
    dur: number;
    pivot: THREE.Vector3;
    offset: THREE.Vector3;
    q0: THREE.Quaternion;
  } | null = null;
  private wait = 0;
  wander = false;
  constructor(
    readonly mesh: THREE.Mesh,
    readonly size: number,
    private readonly bounds = 4,
    private readonly center = new THREE.Vector3(),
  ) {}

  get rolling(): boolean {
    return this.anim !== null;
  }

  roll(dir: Dir, dur = 0.32): void {
    if (this.anim) return;
    const pivot = this.mesh.position
      .clone()
      .addScaledVector(DV[dir], this.size / 2)
      .setY(0);
    this.anim = {
      dir,
      t: 0,
      dur,
      pivot,
      offset: this.mesh.position.clone().sub(pivot),
      q0: this.mesh.quaternion.clone(),
    };
  }

  update(dt: number, onLand?: (r: Roller) => void): void {
    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const q = new THREE.Quaternion().setFromAxisAngle(AXIS[a.dir], e * (Math.PI / 2));
      this.mesh.position.copy(a.pivot).add(a.offset.clone().applyQuaternion(q));
      this.mesh.quaternion.copy(q).multiply(a.q0);
      if (k >= 1) {
        this.mesh.position.y = this.size / 2;
        snapRight(this.mesh.quaternion);
        this.anim = null;
        onLand?.(this);
      }
      return;
    }
    if (!this.wander) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 0.25 + Math.random() * 0.6;
    const options = (['N', 'E', 'S', 'W'] as Dir[]).filter((d) => {
      const next = this.mesh.position.clone().addScaledVector(DV[d], this.size).sub(this.center);
      return Math.abs(next.x) < this.bounds && Math.abs(next.z) < this.bounds;
    });
    this.roll(
      options[Math.floor(Math.random() * options.length)] ?? 'N',
      0.28 + Math.random() * 0.1,
    );
  }
}
