/**
 * Visual effects driven by game events: timed tweens that offset how things
 * are drawn, plus particles, floating numbers and screen shake. Nothing here
 * touches game state; the board is always drawn from the real state, with
 * these visuals layered on top.
 */
import type { EnemyState } from '../../engine';

export interface EntityVisual {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  flash: number;
}

export interface Visuals {
  player: EntityVisual & {
    /** Orientation to draw instead of the real one (mid-roll), or null. */
    orient: number | null;
  };
  enemies: Map<number, EntityVisual>;
  shakeX: number;
  shakeY: number;
  /** Full-screen tint flash (0..1) and its colour. */
  screenFlash: number;
  screenColor: string;
}

interface Anim {
  start: number;
  dur: number;
  /** Apply progress 0 before start (keeps an entity at its old spot until its turn). */
  hold: boolean;
  apply(p: number, v: Visuals): void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
}

/** An enemy that died this turn: drawn normally until `dieAt`, then shrinks away. */
export interface Ghost {
  enemy: EnemyState;
  x: number;
  y: number;
  dieAt: number;
  end: number;
}

/** A tile that changed this turn, still drawn as its old self until `until`. */
export interface TileGhost {
  x: number;
  y: number;
  tile: string;
  until: number;
}

export const ease = {
  out: (t: number) => 1 - (1 - t) * (1 - t),
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  bump: (t: number) => Math.sin(Math.PI * t),
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class Fx {
  time = 0;
  reducedMotion = false;
  private anims: Anim[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  ghosts: Ghost[] = [];
  tileGhosts: TileGhost[] = [];
  private shakeAmp = 0;
  private flashAmt = 0;
  private flashColor = '#fff';
  private seed = 1;
  private timers: Array<{ time: number; fn: () => void }> = [];

  /** Adds a tween starting `delay` seconds from now. */
  tween(delay: number, dur: number, apply: (p: number, v: Visuals) => void, hold = false): void {
    this.anims.push({ start: this.time + delay, dur: Math.max(dur, 1e-6), hold, apply });
  }

  /** Runs `fn` after `delay` seconds (dropped if the animation is skipped). */
  at(delay: number, fn: () => void): void {
    if (delay <= 0) fn();
    else this.timers.push({ time: this.time + delay, fn });
  }

  ghost(enemy: EnemyState, x: number, y: number, dieDelay: number, dur: number): void {
    this.ghosts.push({ enemy, x, y, dieAt: this.time + dieDelay, end: this.time + dieDelay + dur });
  }

  tileGhost(x: number, y: number, tile: string, delay: number): void {
    this.tileGhosts.push({ x, y, tile, until: this.time + delay });
  }

  burst(x: number, y: number, color: string, count: number, speed = 60): void {
    const n = this.reducedMotion ? Math.ceil(count / 3) : count;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const v = speed * (0.4 + this.rand() * 0.8);
      const life = 0.35 + this.rand() * 0.35;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 20,
        life,
        max: life,
        color,
        size: 1.5 + this.rand() * 2,
      });
    }
  }

  float(x: number, y: number, text: string, color: string): void {
    this.floaters.push({ x, y, text, color, life: 0.8, max: 0.8 });
  }

  shake(amount: number): void {
    if (!this.reducedMotion) this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  flash(color: string, amount = 0.35): void {
    this.flashColor = color;
    this.flashAmt = Math.max(this.flashAmt, amount);
  }

  /** True while any tween or ghost is still playing (input can still interrupt). */
  get busy(): boolean {
    return (
      this.timers.length > 0 ||
      this.anims.some((a) => this.time < a.start + a.dur) ||
      this.ghosts.some((g) => this.time < g.end)
    );
  }

  /** Jumps every running tween to its end (used when new input arrives). */
  finishAll(): void {
    const v = this.blank();
    for (const a of this.anims) a.apply(1, v);
    this.anims = [];
    this.timers = [];
    this.ghosts = [];
    this.tileGhosts = [];
  }

  update(dt: number): void {
    this.time += dt;
    const due = this.timers.filter((t) => t.time <= this.time);
    if (due.length) {
      this.timers = this.timers.filter((t) => t.time > this.time);
      for (const t of due) t.fn();
    }
    this.anims = this.anims.filter((a) => this.time < a.start + a.dur + 0.05);
    this.ghosts = this.ghosts.filter((g) => this.time < g.end);
    this.tileGhosts = this.tileGhosts.filter((g) => this.time < g.until);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      p.vx *= 0.96;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      if (!this.reducedMotion) f.y -= 22 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 30);
    this.flashAmt = Math.max(0, this.flashAmt - dt * 2.5);
  }

  /** Computes the current visual offsets from all active tweens. */
  compute(): Visuals {
    const v = this.blank();
    // Pending "hold" tweens first (they pin entities at their old spots), then
    // running tweens in start order so the most recent one wins.
    for (const a of this.anims) if (this.time < a.start && a.hold) a.apply(0, v);
    const running = this.anims
      .filter((a) => this.time >= a.start)
      .sort((a, b) => a.start - b.start);
    for (const a of running) a.apply(clamp01((this.time - a.start) / a.dur), v);
    if (this.shakeAmp > 0) {
      v.shakeX = (this.rand() * 2 - 1) * this.shakeAmp;
      v.shakeY = (this.rand() * 2 - 1) * this.shakeAmp;
    }
    v.screenFlash = this.flashAmt;
    v.screenColor = this.flashColor;
    return v;
  }

  enemyVisual(v: Visuals, id: number): EntityVisual {
    let e = v.enemies.get(id);
    if (!e) {
      e = { dx: 0, dy: 0, sx: 1, sy: 1, flash: 0 };
      v.enemies.set(id, e);
    }
    return e;
  }

  drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp01(p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawFloaters(ctx: CanvasRenderingContext2D): void {
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#120f18';
    for (const f of this.floaters) {
      ctx.globalAlpha = clamp01((f.life / f.max) * 2);
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  private blank(): Visuals {
    return {
      player: { dx: 0, dy: 0, sx: 1, sy: 1, flash: 0, orient: null },
      enemies: new Map(),
      shakeX: 0,
      shakeY: 0,
      screenFlash: 0,
      screenColor: '#fff',
    };
  }

  /** Cosmetic randomness only; never used by the simulation. */
  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
}
