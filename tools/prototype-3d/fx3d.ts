/** 3D prototype effects: explosions, slashes, sparks, smoke, numbers, bones, dust. */
import * as THREE from 'three';

interface Particle {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  age: number;
  gravity: number;
  grow: number;
  fade: THREE.Material & { opacity: number };
  bounce: boolean;
  delay: number;
}

export class Effects {
  private items: Particle[] = [];
  private flashes: { light: THREE.PointLight; peak: number; age: number; life: number }[] = [];
  shake = 0;

  constructor(private readonly scene: THREE.Scene) {}

  private add(
    obj: THREE.Object3D,
    mat: THREE.Material & { opacity: number },
    o: Partial<Omit<Particle, 'obj' | 'fade'>> & { life: number },
  ): void {
    mat.transparent = true;
    this.scene.add(obj);
    this.items.push({
      obj,
      fade: mat,
      vel: o.vel ?? new THREE.Vector3(),
      spin: o.spin ?? new THREE.Vector3(),
      life: o.life,
      age: 0,
      gravity: o.gravity ?? 0,
      grow: o.grow ?? 0,
      bounce: o.bounce ?? false,
      delay: o.delay ?? 0,
    });
    if (o.delay) obj.visible = false;
  }

  flash(at: THREE.Vector3, color: string, peak: number, life: number, dist = 5): void {
    const light = new THREE.PointLight(color, peak, dist, 1.5);
    light.position.copy(at).add(new THREE.Vector3(0, 0.6, 0));
    this.scene.add(light);
    this.flashes.push({ light, peak, age: 0, life });
  }

  explosion(at: THREE.Vector3, big = true): void {
    const k = big ? 1 : 0.6;
    this.flash(at, '#ff9a3c', 18 * k, 0.45, 5);
    this.shake = Math.max(this.shake, 0.22 * k);
    // fireball
    const fireMat = new THREE.MeshBasicMaterial({
      color: '#ff8a2a',
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fire = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), fireMat);
    fireMat.opacity = 0.8;
    fireMat.userData.base = 0.8;
    fire.position.copy(at).setY(0.4);
    this.add(fire, fireMat, { life: 0.34, grow: 4.5 * k });
    const coreMat = new THREE.MeshBasicMaterial({
      color: '#fff6d0',
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), coreMat);
    core.position.copy(fire.position);
    this.add(core, coreMat, { life: 0.16, grow: 3.5 * k });
    // shockwave ring on the floor
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#ffd27a',
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(at).setY(0.04);
    this.add(ring, ringMat, { life: 0.45, grow: 6 * k });
    // sparks
    const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.16);
    for (let i = 0; i < 26 * k; i++) {
      const m = new THREE.MeshBasicMaterial({ color: i % 3 ? '#ffd75e' : '#ff7a3a' });
      const s = new THREE.Mesh(sparkGeo, m);
      s.position.copy(at).setY(0.45);
      const a = Math.random() * Math.PI * 2;
      const up = 1.5 + Math.random() * 3.5;
      const out = 2 + Math.random() * 3;
      s.lookAt(s.position.clone().add(new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a))));
      this.add(s, m, {
        life: 0.5 + Math.random() * 0.4,
        vel: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out),
        gravity: 9,
        bounce: true,
      });
    }
    // smoke
    for (let i = 0; i < 6 * k; i++) {
      const m = new THREE.MeshStandardMaterial({
        color: '#9a90a8',
        roughness: 1,
        opacity: 0.5,
        depthWrite: false,
      });
      m.userData.base = 0.5;
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), m);
      const a = (i / 9) * Math.PI * 2;
      s.position.copy(at).add(new THREE.Vector3(Math.cos(a) * 0.25, 0.3, Math.sin(a) * 0.25));
      this.add(s, m, {
        life: 0.6 + Math.random() * 0.3,
        vel: new THREE.Vector3(Math.cos(a) * 0.8, 0.9 + Math.random() * 0.5, Math.sin(a) * 0.8),
        grow: 1.4,
        delay: 0.06,
      });
    }
  }

  slash(at: THREE.Vector3, dir: THREE.Vector3): void {
    this.shake = Math.max(this.shake, 0.08);
    const m = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const arc = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 24, 1, 0, Math.PI * 0.9), m);
    arc.position.copy(at).setY(0.45);
    arc.lookAt(arc.position.clone().add(dir));
    this.add(arc, m, { life: 0.22, grow: 1.2, spin: new THREE.Vector3(0, 0, 9) });
    this.flash(at, '#cfe6ff', 8, 0.2, 3);
  }

  dust(at: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.MeshStandardMaterial({
        color: '#8d84a6',
        roughness: 1,
        opacity: 0.6,
        depthWrite: false,
      });
      m.userData.base = 0.6;
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), m);
      const a = (i / 6) * Math.PI * 2 + 0.3;
      s.position.copy(at).add(new THREE.Vector3(Math.cos(a) * 0.4, 0.04, Math.sin(a) * 0.4));
      this.add(s, m, {
        life: 0.45,
        vel: new THREE.Vector3(Math.cos(a) * 0.9, 0.35, Math.sin(a) * 0.9),
        grow: 2,
      });
    }
  }

  /** The figure breaks into its bones, which tumble and bounce. */
  shatter(parts: THREE.Mesh[], from: THREE.Vector3): void {
    for (const p of parts) {
      const world = new THREE.Vector3();
      p.getWorldPosition(world);
      const q = new THREE.Quaternion();
      p.getWorldQuaternion(q);
      p.removeFromParent();
      p.position.copy(world);
      p.quaternion.copy(q);
      const m = (p.material as THREE.MeshStandardMaterial).clone();
      p.material = m;
      const away = world.clone().sub(from).setY(0).normalize();
      this.add(p, m as THREE.Material & { opacity: number }, {
        life: 1.1,
        vel: new THREE.Vector3(
          away.x * (0.5 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.6,
          1.8 + Math.random() * 2,
          away.z * (0.5 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.6,
        ),
        spin: new THREE.Vector3(
          Math.random() * 12 - 6,
          Math.random() * 12 - 6,
          Math.random() * 12 - 6,
        ),
        gravity: 10,
        bounce: true,
      });
    }
  }

  coin(at: THREE.Vector3, delay = 0): void {
    const m = new THREE.MeshStandardMaterial({
      color: '#f4d34d',
      emissive: '#c88a10',
      emissiveIntensity: 0.6,
      metalness: 0.7,
      roughness: 0.3,
    });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.035, 20), m);
    c.rotation.x = Math.PI / 2;
    c.position.copy(at).setY(0.5);
    this.add(c, m, {
      life: 0.8,
      vel: new THREE.Vector3(0, 2.4, 0),
      gravity: 3,
      spin: new THREE.Vector3(0, 14, 0),
      delay,
    });
  }

  /** A floating number or word, always facing the camera. */
  text(at: THREE.Vector3, s: string, color: string, size = 0.5, delay = 0): void {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const x = c.getContext('2d')!;
    x.font = '900 84px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.lineWidth = 16;
    x.strokeStyle = '#231d2b';
    x.strokeText(s, 128, 66);
    x.fillStyle = color;
    x.fillText(s, 128, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sp = new THREE.Sprite(m);
    sp.scale.set(size * 2, size, 1);
    sp.position.copy(at).setY(1.0);
    sp.renderOrder = 10;
    this.add(sp, m, { life: 0.9, vel: new THREE.Vector3(0, 1.1, 0), delay });
  }

  sparkle(at: THREE.Vector3, color: string, n: number, spread = 0.4): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.MeshBasicMaterial({
        color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), m);
      s.position
        .copy(at)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * spread * 2,
            Math.random() * 0.3,
            (Math.random() - 0.5) * spread * 2,
          ),
        );
      this.add(s, m, {
        life: 0.8 + Math.random() * 0.6,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          1 + Math.random() * 1.5,
          (Math.random() - 0.5) * 0.6,
        ),
        spin: new THREE.Vector3(0, 6, 0),
        delay: Math.random() * 0.3,
      });
    }
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 1.1);
    for (const f of this.flashes) {
      f.age += dt;
      f.light.intensity = f.peak * Math.max(0, 1 - f.age / f.life) ** 2;
    }
    this.flashes = this.flashes.filter((f) => {
      if (f.age < f.life) return true;
      f.light.removeFromParent();
      return false;
    });
    for (const p of this.items) {
      if (p.delay > 0) {
        p.delay -= dt;
        if (p.delay > 0) continue;
        p.obj.visible = true;
      }
      p.age += dt;
      p.vel.y -= p.gravity * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.bounce && p.obj.position.y < 0.03) {
        p.obj.position.y = 0.03;
        p.vel.y = Math.abs(p.vel.y) * 0.35;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        p.spin.multiplyScalar(0.6);
      }
      p.obj.rotation.x += p.spin.x * dt;
      p.obj.rotation.y += p.spin.y * dt;
      p.obj.rotation.z += p.spin.z * dt;
      if (p.grow) p.obj.scale.multiplyScalar(1 + p.grow * dt);
      const k = p.age / p.life;
      const base = (p.fade.userData.base as number | undefined) ?? 1;
      p.fade.opacity = base * (k < 0.6 ? 1 : Math.max(0, (1 - k) / 0.4));
    }
    this.items = this.items.filter((p) => {
      if (p.age < p.life) return true;
      p.obj.removeFromParent();
      return false;
    });
  }
}
