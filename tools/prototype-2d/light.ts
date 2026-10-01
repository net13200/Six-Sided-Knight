/**
 * 2D lighting for the lit-dungeon prototype: shadow-casting lights on the
 * tile grid. Each light sees a visibility polygon (rays cast to the wall
 * faces); the darkness is cut away inside it with a soft radial falloff, and
 * a warm colour is added on top.
 */

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export type Pt = [number, number];

/** The closest wall hit along a ray from (ox, oy) at angle a. */
function cast(ox: number, oy: number, a: number, segs: readonly Seg[], max: number): Pt {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let best = max;
  for (const s of segs) {
    const sx = s.bx - s.ax;
    const sy = s.by - s.ay;
    const den = dx * sy - dy * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((s.ax - ox) * sy - (s.ay - oy) * sx) / den;
    const u = ((s.ax - ox) * dy - (s.ay - oy) * dx) / den;
    if (t > 0 && t < best && u >= 0 && u <= 1) best = t;
  }
  return [ox + dx * best, oy + dy * best];
}

/** What a light at (ox, oy) can see, as a polygon (in the same units as the segments). */
export function visibility(ox: number, oy: number, segs: readonly Seg[], radius: number): Pt[] {
  const near = segs.filter(
    (s) =>
      Math.min(s.ax, s.bx) < ox + radius &&
      Math.max(s.ax, s.bx) > ox - radius &&
      Math.min(s.ay, s.by) < oy + radius &&
      Math.max(s.ay, s.by) > oy - radius,
  );
  const angles: number[] = [];
  for (const s of near) {
    for (const [px, py] of [
      [s.ax, s.ay],
      [s.bx, s.by],
    ] as const) {
      const a = Math.atan2(py - oy, px - ox);
      angles.push(a - 0.0005, a, a + 0.0005);
    }
  }
  // a ring of rays too, so open areas still make a round light
  for (let i = 0; i < 48; i++) angles.push((i / 48) * Math.PI * 2 - Math.PI);
  angles.sort((a, b) => a - b);
  return angles.map((a) => cast(ox, oy, a, near, radius));
}

export interface Light {
  x: number;
  y: number;
  radius: number;
  color: string;
  /** 0..1: how much darkness it removes at its centre. */
  power: number;
  poly: Pt[] | null;
}

/**
 * Draw the darkness over the scene, cut by the lights, then the lights' colour.
 * `px` = pixels per tile; (ox, oy) = where tile (0, 0) sits on screen.
 */
export function drawLighting(
  ctx: CanvasRenderingContext2D,
  dark: CanvasRenderingContext2D,
  lights: readonly Light[],
  segs: readonly Seg[],
  px: number,
  ox: number,
  oy: number,
  ambient: string,
): void {
  const w = dark.canvas.width;
  const h = dark.canvas.height;
  const k = w / ctx.canvas.width; // the darkness canvas may be smaller
  dark.globalCompositeOperation = 'source-over';
  dark.clearRect(0, 0, w, h);
  dark.fillStyle = ambient;
  dark.fillRect(0, 0, w, h);
  dark.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    l.poly ??= visibility(l.x, l.y, segs, l.radius);
    const cx = (ox + l.x * px) * k;
    const cy = (oy + l.y * px) * k;
    const g = dark.createRadialGradient(cx, cy, 0, cx, cy, l.radius * px * k);
    g.addColorStop(0, `rgba(0,0,0,${l.power})`);
    g.addColorStop(0.45, `rgba(0,0,0,${l.power * 0.75})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dark.fillStyle = g;
    dark.beginPath();
    for (const [x, y] of l.poly) dark.lineTo((ox + x * px) * k, (oy + y * px) * k);
    dark.closePath();
    dark.fill();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(dark.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
  // the warm colour of each light, only where it reaches
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    if (!l.poly) continue;
    const cx = ox + l.x * px;
    const cy = oy + l.y * px;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, l.radius * px);
    g.addColorStop(0, l.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (const [x, y] of l.poly) ctx.lineTo(ox + x * px, oy + y * px);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
