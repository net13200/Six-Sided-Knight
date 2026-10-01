/**
 * 2D effects for the lit-dungeon prototype. Positions are in tiles; z is
 * height above the floor (drawn as an upward offset), so sparks and bones
 * can arc and bounce.
 */
import type { Light } from './light';

type Kind =
  'spark' | 'smoke' | 'bone' | 'coin' | 'text' | 'dust' | 'glint' | 'fire' | 'ring' | 'slash';

interface P {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  age: number;
  life: number;
  delay: number;
  size: number;
  rot: number;
  spin: number;
  color: string;
  text?: string;
  dir?: number;
}

const mk = (kind: Kind, x: number, y: number, o: Partial<P> = {}): P => ({
  kind,
  x,
  y,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  g: 0,
  age: 0,
  life: 1,
  delay: 0,
  size: 1,
  rot: 0,
  spin: 0,
  color: '#fff',
  ...o,
});

const rnd = Math.random;

export class Fx2d {
  ps: P[] = [];
  flashes: (Light & { age: number; life: number; peak: number })[] = [];
  shake = 0;

  flash(x: number, y: number, color: string, radius: number, life: number, power = 0.95): void {
    this.flashes.push({ x, y, radius, color, power, poly: null, age: 0, life, peak: power });
  }

  explosion(x: number, y: number, big: boolean): void {
    const k = big ? 1 : 0.65;
    this.flash(x, y, 'rgba(255,120,40,0.35)', 3 * k, 0.45, 0.9);
    this.shake = Math.max(this.shake, big ? 0.22 : 0.12);
    this.ps.push(mk('fire', x, y, { life: 0.35, size: 0.9 * k, z: 0.25 }));
    this.ps.push(mk('ring', x, y, { life: 0.4, size: 1.1 * k }));
    for (let i = 0; i < 22 * k; i++) {
      const a = rnd() * Math.PI * 2;
      const sp = 2 + rnd() * 3;
      this.ps.push(
        mk('spark', x, y, {
          z: 0.3,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          vz: 2 + rnd() * 3,
          g: 12,
          life: 0.45 + rnd() * 0.35,
          color: i % 3 ? '#ffd75e' : '#ff7a3a',
        }),
      );
    }
    for (let i = 0; i < 7 * k; i++) {
      const a = (i / 7) * Math.PI * 2;
      this.ps.push(
        mk('smoke', x + Math.cos(a) * 0.2, y + Math.sin(a) * 0.2, {
          vx: Math.cos(a) * 0.7,
          vy: Math.sin(a) * 0.7,
          vz: 0.8,
          life: 0.7 + rnd() * 0.3,
          size: 0.22 + rnd() * 0.1,
          delay: 0.05,
        }),
      );
    }
  }

  slash(x: number, y: number, dirAngle: number): void {
    this.shake = Math.max(this.shake, 0.07);
    this.ps.push(mk('slash', x, y, { life: 0.22, dir: dirAngle, z: 0.3 }));
    this.flash(x, y, 'rgba(200,225,255,0.4)', 1.8, 0.2, 0.6);
  }

  bones(x: number, y: number, fromX: number, fromY: number): void {
    const ax = x - fromX;
    const ay = y - fromY;
    const d = Math.hypot(ax, ay) || 1;
    for (let i = 0; i < 9; i++) {
      const sp = 0.3 + rnd() * 0.7;
      this.ps.push(
        mk('bone', x, y, {
          z: 0.3 + rnd() * 0.3,
          vx: (ax / d) * sp + (rnd() - 0.5) * 0.8,
          vy: (ay / d) * sp + (rnd() - 0.5) * 0.8,
          vz: 2 + rnd() * 2.5,
          g: 11,
          life: 1.2,
          spin: (rnd() - 0.5) * 18,
          size: i === 0 ? 1.6 : 0.7 + rnd() * 0.5,
          color: '#efe8d6',
        }),
      );
    }
  }

  coin(x: number, y: number, delay = 0): void {
    this.ps.push(mk('coin', x, y, { z: 0.4, vz: 2.6, g: 4, life: 0.8, delay, spin: 14 }));
  }

  text(x: number, y: number, text: string, color: string, size = 1, delay = 0): void {
    this.ps.push(mk('text', x, y, { z: 0.7, vz: 1, life: 0.9, text, color, size, delay }));
  }

  dust(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      this.ps.push(
        mk('dust', x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3, {
          vx: Math.cos(a) * 0.8,
          vy: Math.sin(a) * 0.8,
          vz: 0.3,
          life: 0.45,
          size: 0.06,
        }),
      );
    }
  }

  glint(x: number, y: number, color: string, n: number, spread = 0.35): void {
    for (let i = 0; i < n; i++) {
      this.ps.push(
        mk('glint', x + (rnd() - 0.5) * spread * 2, y + (rnd() - 0.5) * spread * 2, {
          vz: 0.6 + rnd() * 1,
          life: 0.9 + rnd() * 0.6,
          color,
          delay: rnd() * 0.3,
          size: 0.5 + rnd() * 0.5,
        }),
      );
    }
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 1.2);
    for (const f of this.flashes) {
      f.age += dt;
      f.power = f.peak * Math.max(0, 1 - f.age / f.life) ** 1.5;
    }
    this.flashes = this.flashes.filter((f) => f.age < f.life);
    for (const p of this.ps) {
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.age += dt;
      p.vz -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (p.g && p.z < 0) {
        p.z = 0;
        p.vz = Math.abs(p.vz) * 0.35;
        p.vx *= 0.55;
        p.vy *= 0.55;
        p.spin *= 0.5;
      }
      if (p.kind === 'smoke' || p.kind === 'dust') {
        p.vx *= 1 - dt * 3;
        p.vy *= 1 - dt * 3;
      }
    }
    this.ps = this.ps.filter((p) => p.age < p.life);
  }

  /** Things that sit in the world (lit like the world). */
  drawUnder(c: CanvasRenderingContext2D, px: number, ox: number, oy: number): void {
    for (const p of this.ps) {
      if (p.delay > 0) continue;
      const k = p.age / p.life;
      const sx = ox + p.x * px;
      const sy = oy + (p.y - p.z * 0.8) * px;
      const fade = k < 0.6 ? 1 : (1 - k) / 0.4;
      if (p.kind === 'bone') {
        c.save();
        c.globalAlpha = fade;
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.beginPath();
        c.ellipse(
          ox + p.x * px,
          oy + p.y * px + 0.03 * px,
          0.07 * px * p.size,
          0.03 * px,
          0,
          0,
          Math.PI * 2,
        );
        c.fill();
        c.translate(sx, sy);
        c.rotate(p.rot);
        const L = 0.08 * px * p.size;
        c.strokeStyle = '#3a3030';
        c.lineWidth = 0.05 * px;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-L, 0);
        c.lineTo(L, 0);
        c.stroke();
        c.strokeStyle = p.color;
        c.lineWidth = 0.03 * px;
        c.stroke();
        c.fillStyle = p.color;
        for (const e of [-L, L]) {
          c.beginPath();
          c.arc(e, -0.015 * px, 0.022 * px, 0, Math.PI * 2);
          c.arc(e, 0.015 * px, 0.022 * px, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      } else if (p.kind === 'smoke' || p.kind === 'dust') {
        c.fillStyle =
          p.kind === 'smoke'
            ? `rgba(120,110,120,${0.45 * fade})`
            : `rgba(150,140,130,${0.5 * fade})`;
        c.beginPath();
        c.arc(sx, sy, (p.size + k * (p.kind === 'smoke' ? 0.35 : 0.08)) * px, 0, Math.PI * 2);
        c.fill();
      } else if (p.kind === 'coin') {
        c.save();
        c.globalAlpha = fade;
        c.translate(sx, sy);
        c.scale(Math.max(0.15, Math.abs(Math.cos(p.rot))), 1);
        c.fillStyle = '#c88a10';
        c.beginPath();
        c.arc(0, 0, 0.12 * px, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#f4d34d';
        c.beginPath();
        c.arc(0, -0.01 * px, 0.1 * px, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }
  }

  /** Things that glow, and text: drawn over the lighting. */
  drawOver(c: CanvasRenderingContext2D, px: number, ox: number, oy: number): void {
    for (const p of this.ps) {
      if (p.delay > 0) continue;
      const k = p.age / p.life;
      const sx = ox + p.x * px;
      const sy = oy + (p.y - p.z * 0.8) * px;
      const fade = k < 0.6 ? 1 : (1 - k) / 0.4;
      c.save();
      if (p.kind === 'spark') {
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = p.color;
        c.globalAlpha = fade;
        c.lineWidth = 0.05 * px;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx - p.vx * 0.03 * px, sy - (p.vy - p.vz * 0.8) * 0.03 * px);
        c.stroke();
      } else if (p.kind === 'fire') {
        c.globalCompositeOperation = 'lighter';
        const r = (0.3 + k * 1.1) * p.size * px;
        const g = c.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, `rgba(255,245,200,${1 - k})`);
        g.addColorStop(0.35, `rgba(255,150,50,${0.85 * (1 - k)})`);
        g.addColorStop(1, 'rgba(255,90,20,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(sx, sy, r, 0, Math.PI * 2);
        c.fill();
      } else if (p.kind === 'ring') {
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = `rgba(255,210,120,${(1 - k) * 0.9})`;
        c.lineWidth = 0.08 * px * (1 - k);
        c.beginPath();
        c.ellipse(
          sx,
          sy,
          (0.3 + k * 1.2) * p.size * px,
          (0.24 + k * 0.95) * p.size * px,
          0,
          0,
          Math.PI * 2,
        );
        c.stroke();
      } else if (p.kind === 'slash') {
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = `rgba(255,255,255,${1 - k})`;
        c.lineWidth = 0.09 * px * (1 - k);
        c.lineCap = 'round';
        c.beginPath();
        const a = p.dir! + (k - 0.5) * 1.5;
        c.arc(sx, sy, 0.38 * px, a - 1.1, a + 0.6);
        c.stroke();
      } else if (p.kind === 'glint') {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = p.color;
        c.globalAlpha = fade;
        const r = 0.05 * px * p.size;
        c.beginPath();
        c.moveTo(sx, sy - r * 2);
        c.lineTo(sx + r * 0.6, sy);
        c.lineTo(sx, sy + r * 2);
        c.lineTo(sx - r * 0.6, sy);
        c.fill();
      } else if (p.kind === 'text') {
        c.globalAlpha = fade;
        const s = 0.42 * px * p.size * (k < 0.12 ? 0.6 + k * 3.4 : 1);
        c.font = `900 ${s}px system-ui, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineJoin = 'round';
        c.lineWidth = s / 5;
        c.strokeStyle = '#231d2b';
        c.strokeText(p.text!, sx, sy);
        c.fillStyle = p.color;
        c.fillText(p.text!, sx, sy);
      }
      c.restore();
    }
  }
}
