/**
 * Skin materials for the die on the board (and the skins screen). Each skin
 * paints the big top face in its own material and adds effects around the
 * die: flames, sparks, frost, glints. The side panels keep their role colours
 * (they tell you what each face does); a skin only textures them lightly at
 * the edges, so every skin reads the same in play.
 *
 * All drawing is in die space: (0,0) is the die's centre, R the outer
 * half-size, r the top face's half-size. `t` is time in seconds (frozen at 0
 * with reduced motion).
 */
type Ctx = CanvasRenderingContext2D;

export interface SkinFx {
  /** Behind the die (auras, flames licking out from under it). */
  back?(ctx: Ctx, R: number, t: number): void;
  /** The top face's material (already clipped to the face). */
  top?(ctx: Ctx, r: number, t: number): void;
  /** Texture over one side panel (already clipped to it); `side` is 0-3 (N, E, S, W). */
  panel?(ctx: Ctx, R: number, r: number, side: number, t: number): void;
  /** In front of everything (sparks, glints). */
  front?(ctx: Ctx, R: number, t: number): void;
}

/** Deterministic 0..1 noise from an integer. */
function rand(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth flicker in 0..1 (sum of sines, different per seed). */
function flicker(t: number, seed: number): number {
  return (
    0.5 +
    0.25 * Math.sin(t * 7.3 + seed * 1.7) +
    0.15 * Math.sin(t * 13.1 + seed * 3.1) +
    0.1 * Math.sin(t * 23.7 + seed * 5.3)
  );
}

/** A point on the die's outline (a square of half-size R), u in 0..1 around it. */
function perimeter(u: number, R: number): { x: number; y: number; nx: number; ny: number } {
  const s = ((u % 1) + 1) % 1;
  const k = Math.floor(s * 4);
  const f = (s * 4 - k) * 2 - 1;
  if (k === 0) return { x: f * R, y: -R, nx: 0, ny: -1 };
  if (k === 1) return { x: R, y: f * R, nx: 1, ny: 0 };
  if (k === 2) return { x: -f * R, y: R, nx: 0, ny: 1 };
  return { x: -R, y: -f * R, nx: -1, ny: 0 };
}

/**
 * A ring of flame tongues around the die. Fire rises up the screen, so each
 * tongue leans upward whatever side it's on; tongues on the top edge are the
 * tallest.
 */
function flameRing(
  ctx: Ctx,
  R: number,
  t: number,
  count: number,
  height: number,
  colors: readonly [string, string, string],
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Three layers: a wide dim outer flame, then a brighter middle, then a hot core.
  for (const [layer, color] of colors.entries()) {
    const scale = 1 - layer * 0.28;
    for (let i = 0; i < count; i++) {
      const u = (i + 0.4 * rand(i)) / count;
      const p = perimeter(u, R - 4);
      // Fire rises: tongues on the top edge stand tallest, the bottom edge only glows.
      const lean = p.ny < 0 ? 1.2 : p.ny > 0 ? 0.35 : 0.75;
      const h = height * scale * lean * (0.6 + 0.55 * flicker(t, i));
      if (h < 2) continue;
      const w = ((R * 4.4) / count) * (0.75 + 0.35 * rand(i + 20)) * scale;
      // Direction: mostly up, a little outward, swaying.
      let dx = p.nx * 0.55 + Math.sin(t * 4.3 + i * 2.1) * 0.25;
      let dy = p.ny * 0.55 - 1;
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      tongue(ctx, p.x, p.y, dx, dy, h, w, color, t, i);
    }
  }
  ctx.restore();
}

/** One flame tongue from (x, y) along unit direction (dx, dy): a teardrop that curls at the tip. */
function tongue(
  ctx: Ctx,
  x: number,
  y: number,
  dx: number,
  dy: number,
  h: number,
  w: number,
  color: string,
  t: number,
  i: number,
): void {
  const tipX = x + dx * h;
  const tipY = y + dy * h;
  const cx = -dy;
  const cy = dx;
  const g = ctx.createLinearGradient(x, y, tipX, tipY);
  g.addColorStop(0, color);
  g.addColorStop(0.55, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  const bellyX = x + dx * h * 0.3;
  const bellyY = y + dy * h * 0.3;
  const curl = Math.sin(t * 6 + i) * w * 0.35;
  ctx.beginPath();
  ctx.moveTo(x - cx * w * 0.5, y - cy * w * 0.5);
  ctx.bezierCurveTo(
    bellyX - cx * w * 0.75,
    bellyY - cy * w * 0.75,
    tipX - cx * (w * 0.15 - curl),
    tipY - cy * (w * 0.15 - curl),
    tipX + cx * curl,
    tipY + cy * curl,
  );
  ctx.bezierCurveTo(
    tipX + cx * (w * 0.15 + curl),
    tipY + cy * (w * 0.15 + curl),
    bellyX + cx * w * 0.75,
    bellyY + cy * w * 0.75,
    x + cx * w * 0.5,
    y + cy * w * 0.5,
  );
  ctx.closePath();
  ctx.fill();
}

/**
 * Flames rising off the die's side facets, drawn over the die (translucent),
 * so the die itself looks alight. None start on the top face, so its icon stays clear.
 */
function facetFlames(
  ctx: Ctx,
  R: number,
  r: number,
  t: number,
  height: number,
  colors: readonly [string, string, string],
): void {
  const mid = (R + r) / 2;
  // Bases across the north facet and up the east and west facets.
  const bases: Array<[number, number]> = [];
  for (let k = 0; k < 5; k++) bases.push([-R * 0.8 + k * R * 0.4, -mid]);
  for (const sx of [-1, 1])
    for (let k = 0; k < 3; k++) bases.push([sx * mid, -R * 0.45 + k * R * 0.5]);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [layer, color] of colors.entries()) {
    const scale = 1 - layer * 0.3;
    bases.forEach(([x, y], i) => {
      const h = height * scale * (0.5 + 0.6 * flicker(t, i + 40));
      const sway = Math.sin(t * 4.1 + i * 1.7) * 0.3;
      const len = Math.hypot(sway, 1);
      tongue(ctx, x, y, sway / len, -1 / len, h, 7 * scale, color, t, i + 40);
    });
  }
  ctx.restore();
}

/** Jagged glowing cracks: seeded random walks from given starts. */
function cracks(
  ctx: Ctx,
  starts: ReadonlyArray<readonly [number, number, number]>,
  len: number,
  seed: number,
): void {
  ctx.beginPath();
  starts.forEach(([x0, y0, angle], k) => {
    let x = x0;
    let y = y0;
    let a = angle;
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      a += (rand(seed + k * 17 + s) - 0.5) * 1.4;
      const step = (len / 5) * (0.7 + 0.6 * rand(seed + k * 31 + s));
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      ctx.lineTo(x, y);
      if (s === 2) {
        // A short branch.
        const b = a + (rand(seed + k) > 0.5 ? 0.9 : -0.9);
        ctx.lineTo(x + Math.cos(b) * step * 0.8, y + Math.sin(b) * step * 0.8);
        ctx.moveTo(x, y);
      }
    }
  });
  ctx.stroke();
}

/** Glowing embers drifting inside a panel (clipped to it), hottest at the outer edge. */
function emberGlow(ctx: Ctx, R: number, r: number, side: number, t: number, color: string): void {
  const [nx, ny] = NORMALS[side]!;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const along = (rand(side * 9 + i) * 2 - 1) * R * 0.8 + Math.sin(t * 0.9 + i) * 3;
    const depth = r + (R - r) * (0.55 + 0.4 * rand(side * 9 + i + 4));
    const x = nx !== 0 ? nx * depth : along;
    const y = ny !== 0 ? ny * depth : along;
    const rad = 5 + 3 * flicker(t, side * 4 + i);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}

/** Sparks drifting up from the die and fading. */
function sparks(ctx: Ctx, R: number, t: number, count: number, color: string, speed: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const phase = (t * speed + rand(i + 50)) % 1;
    const x0 = (rand(i + 7) * 2 - 1) * R * 0.9;
    const x = x0 + Math.sin(t * 3 + i) * 3 * phase;
    const y = -R * 0.4 - phase * R * 1.5;
    const a = (1 - phase) * (phase < 0.1 ? phase * 10 : 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 1.1 + rand(i + 3) * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A four-pointed twinkle. */
function twinkle(ctx: Ctx, x: number, y: number, size: number, alpha: number, color: string): void {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x, y, x + size, y);
  ctx.quadraticCurveTo(x, y, x, y + size);
  ctx.quadraticCurveTo(x, y, x - size, y);
  ctx.quadraticCurveTo(x, y, x, y - size);
  ctx.fill();
  ctx.restore();
}

/** Glints that come and go at fixed spots. */
function glints(
  ctx: Ctx,
  spots: ReadonlyArray<readonly [number, number]>,
  t: number,
  size: number,
  color: string,
): void {
  spots.forEach(([x, y], i) => {
    const a = Math.max(0, Math.sin(t * 1.6 + i * 2.3)) ** 6;
    twinkle(ctx, x, y, size * (0.6 + 0.4 * a), a, color);
  });
}

function radial(
  ctx: Ctx,
  r: number,
  stops: ReadonlyArray<readonly [number, string]>,
  grow = 1,
): void {
  const g = ctx.createRadialGradient(-r * 0.15, -r * 0.2, 0, 0, 0, r * 1.45 * grow);
  for (const [at, c] of stops) g.addColorStop(at, c);
  ctx.fillStyle = g;
  ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
}

/** Darkens a panel towards its outer edge. */
function edgeShade(ctx: Ctx, R: number, r: number, side: number, color: string): void {
  const [nx, ny] = NORMALS[side]!;
  const g = ctx.createLinearGradient(nx * r, ny * r, nx * R, ny * R);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fillRect(-R, -R, R * 2, R * 2);
}

/** Branching crystal strokes from a point. */
function crystal(ctx: Ctx, x: number, y: number, angle: number, len: number): void {
  ctx.beginPath();
  const ex = x + Math.cos(angle) * len;
  const ey = y + Math.sin(angle) * len;
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  for (const f of [0.35, 0.6, 0.82]) {
    const px = x + Math.cos(angle) * len * f;
    const py = y + Math.sin(angle) * len * f;
    const b = len * (1 - f) * 0.55;
    for (const s of [-1, 1]) {
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(angle + s * 0.8) * b, py + Math.sin(angle + s * 0.8) * b);
    }
  }
  ctx.stroke();
}

/** A soft light behind the top icon, so it reads on dark materials. */
function iconHalo(ctx: Ctx, r: number, color: string): void {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.95);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
}

/** Outward normal of each side panel (N, E, S, W). */
const NORMALS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

export const SKIN_FX: Readonly<Record<string, SkinFx>> = {
  bone: {
    top(ctx, r) {
      radial(ctx, r, [
        [0, '#fbf6e8'],
        [0.6, '#eadfc4'],
        [1, '#b9a98a'],
      ]);
      ctx.strokeStyle = 'rgba(90,70,50,0.45)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.35);
      ctx.lineTo(-r * 0.7, -r * 0.4);
      ctx.lineTo(-r * 0.62, -r * 0.1);
      ctx.moveTo(r, r * 0.5);
      ctx.lineTo(r * 0.72, r * 0.42);
      ctx.lineTo(r * 0.78, r * 0.75);
      ctx.moveTo(r * 0.3, -r);
      ctx.lineTo(r * 0.36, -r * 0.78);
      ctx.stroke();
    },
    panel(ctx, R, r, side) {
      edgeShade(ctx, R, r, side, 'rgba(60,45,30,0.35)');
      ctx.strokeStyle = 'rgba(60,50,40,0.4)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-R, -8);
      ctx.lineTo(-R + 6, -5);
      ctx.lineTo(-R + 5, 2);
      ctx.moveTo(R, 10);
      ctx.lineTo(R - 6, 8);
      ctx.moveTo(4, -R);
      ctx.lineTo(6, -R + 7);
      ctx.moveTo(-6, R);
      ctx.lineTo(-4, R - 6);
      ctx.stroke();
    },
  },

  moss: {
    top(ctx, r) {
      radial(ctx, r, [
        [0, '#f4f6e4'],
        [0.65, '#dfe8c2'],
        [1, '#9fb872'],
      ]);
      // Moss creeping in from the corners.
      CORNERS.forEach(([cx, cy], k) => {
        for (let i = 0; i < 6; i++) {
          const a = rand(k * 10 + i) * Math.PI * 0.5;
          const d = rand(k * 10 + i + 5) * r * 0.45;
          const x = cx * r - cx * Math.cos(a) * d;
          const y = cy * r - cy * Math.sin(a) * d;
          ctx.fillStyle = i % 2 ? '#5d8a3e' : '#7aa84f';
          ctx.beginPath();
          ctx.arc(x, y, 1.8 + rand(k * 10 + i + 9) * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    panel(ctx, R, r, side) {
      edgeShade(ctx, R, r, side, 'rgba(30,70,20,0.4)');
      ctx.fillStyle = 'rgba(95,150,60,0.85)';
      for (let i = 0; i < 9; i++) {
        const p = perimeter((side + (i + 0.5) / 9) / 4, R);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 + rand(side * 20 + i) * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  frost: {
    back(ctx, R, t) {
      const pulse = 0.8 + 0.2 * Math.sin(t * 1.5);
      const g = ctx.createRadialGradient(0, 0, R * 0.7, 0, 0, R * 1.7);
      g.addColorStop(0, `rgba(170,230,255,${0.45 * pulse})`);
      g.addColorStop(1, 'rgba(170,230,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R * 1.8, -R * 1.8, R * 3.6, R * 3.6);
    },
    top(ctx, r) {
      radial(ctx, r, [
        [0, '#ffffff'],
        [0.55, '#e4f6ff'],
        [1, '#8fcdef'],
      ]);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 0.8;
      CORNERS.forEach(([cx, cy]) => crystal(ctx, cx * r, cy * r, Math.atan2(-cy, -cx), r * 0.62));
    },
    panel(ctx, R, r, side) {
      edgeShade(ctx, R, r, side, 'rgba(235,250,255,0.75)');
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 0.7;
      const p = perimeter((side + 0.3) / 4, R);
      crystal(ctx, p.x, p.y, Math.atan2(-p.ny, -p.nx) - 0.4, 8);
      const q = perimeter((side + 0.75) / 4, R);
      crystal(ctx, q.x, q.y, Math.atan2(-q.ny, -q.nx) + 0.3, 6);
    },
    front(ctx, R, t) {
      glints(
        ctx,
        [
          [-R + 4, -R + 5],
          [R - 5, -R + 9],
          [R - 3, R - 6],
          [-R + 8, R - 3],
          [-3, -R + 1],
        ],
        t,
        4.5,
        '#ffffff',
      );
    },
  },

  ember: {
    back(ctx, R, t) {
      const g = ctx.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 1.7);
      g.addColorStop(0, `rgba(255,120,30,${0.45 + 0.1 * flicker(t, 1)})`);
      g.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R * 1.8, -R * 1.8, R * 3.6, R * 3.6);
      flameRing(ctx, R, t, 16, 17, [
        'rgba(230,60,10,0.75)',
        'rgba(255,150,30,0.8)',
        'rgba(255,235,150,0.85)',
      ]);
    },
    top(ctx, r, t) {
      // Molten: white-hot in the middle, cooling to red at the edges.
      const heat = flicker(t, 2);
      radial(
        ctx,
        r,
        [
          [0, '#fff8d6'],
          [0.35, '#ffd66b'],
          [0.7, '#ff8a2a'],
          [1, '#b8300a'],
        ],
        0.92 + heat * 0.12,
      );
      // Charred crust in the corners, with glowing cracks through it.
      CORNERS.forEach(([cx, cy]) => {
        const g = ctx.createRadialGradient(cx * r, cy * r, 0, cx * r, cy * r, r * 0.7);
        g.addColorStop(0, 'rgba(50,10,0,0.75)');
        g.addColorStop(1, 'rgba(50,10,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-r, -r, r * 2, r * 2);
      });
      ctx.save();
      ctx.strokeStyle = `rgba(255,${190 + Math.round(50 * heat)},110,0.95)`;
      ctx.lineWidth = 0.9;
      ctx.lineJoin = 'round';
      cracks(
        ctx,
        CORNERS.map(([cx, cy]) => [cx * r, cy * r, Math.atan2(-cy, -cx)] as const),
        r * 0.55,
        11,
      );
      ctx.restore();
    },
    panel(ctx, R, r, side, t) {
      edgeShade(ctx, R, r, side, 'rgba(45,8,0,0.7)');
      emberGlow(ctx, R, r, side, t, 'rgba(255,120,30,0.55)');
      ctx.strokeStyle = `rgba(255,170,60,${0.5 + 0.4 * flicker(t, side + 5)})`;
      ctx.lineWidth = 0.8;
      const p = perimeter((side + 0.3 + 0.4 * rand(side)) / 4, R);
      cracks(ctx, [[p.x, p.y, Math.atan2(-p.ny, -p.nx)]], (R - r) * 0.9, 40 + side);
    },
    front(ctx, R, t) {
      facetFlames(ctx, R, 17, t, 12, [
        'rgba(230,70,10,0.35)',
        'rgba(255,150,40,0.4)',
        'rgba(255,230,150,0.45)',
      ]);
      sparks(ctx, R, t, 10, '#ffcf6a', 0.55);
    },
  },

  gilded: {
    back(ctx, R, t) {
      const g = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.6);
      g.addColorStop(0, `rgba(255,215,94,${0.35 + 0.1 * Math.sin(t * 2)})`);
      g.addColorStop(1, 'rgba(255,215,94,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R * 1.7, -R * 1.7, R * 3.4, R * 3.4);
    },
    top(ctx, r, t) {
      const g = ctx.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, '#fff6c8');
      g.addColorStop(0.5, '#ffd766');
      g.addColorStop(1, '#c48f22');
      ctx.fillStyle = g;
      ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
      iconHalo(ctx, r, 'rgba(255,250,225,0.7)');
      // A shine sweeping across every few seconds.
      const s = ((t * 0.4) % 1.6) - 0.3;
      const x = -r * 2 + s * r * 4;
      const band = ctx.createLinearGradient(x - 6, 0, x + 6, 0);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, 'rgba(255,255,255,0.75)');
      band.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.transform(1, 0, -0.6, 1, 0, 0);
      ctx.fillStyle = band;
      ctx.fillRect(x - 6, -r, 12, r * 2);
      ctx.restore();
    },
    panel(ctx, R, r, side) {
      edgeShade(ctx, R, r, side, 'rgba(255,205,80,0.6)');
    },
    front(ctx, R, t) {
      glints(
        ctx,
        [
          [R - 4, -R + 4],
          [-R + 5, R - 5],
        ],
        t,
        5,
        '#fffbe6',
      );
    },
  },

  flame: {
    back(ctx, R, t) {
      const g = ctx.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 1.8);
      g.addColorStop(0, `rgba(255,60,90,${0.4 + 0.15 * flicker(t, 3)})`);
      g.addColorStop(1, 'rgba(255,60,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R * 1.9, -R * 1.9, R * 3.8, R * 3.8);
      // Roaring: taller tongues than Ember.
      flameRing(ctx, R, t * 1.3, 20, 20, [
        'rgba(220,20,70,0.8)',
        'rgba(255,90,60,0.85)',
        'rgba(255,210,110,0.9)',
      ]);
    },
    top(ctx, r, t) {
      radial(
        ctx,
        r,
        [
          [0, '#fff4ec'],
          [0.45, '#ffc2a8'],
          [0.8, '#ff5a6a'],
          [1, '#a3122e'],
        ],
        0.95 + 0.1 * flicker(t, 4),
      );
    },
    panel(ctx, R, r, side, t) {
      edgeShade(ctx, R, r, side, 'rgba(90,0,20,0.6)');
      emberGlow(ctx, R, r, side, t * 1.4, 'rgba(255,70,90,0.5)');
    },
    front(ctx, R, t) {
      facetFlames(ctx, R, 17, t * 1.3, 16, [
        'rgba(220,20,70,0.4)',
        'rgba(255,90,60,0.45)',
        'rgba(255,215,130,0.5)',
      ]);
      sparks(ctx, R, t, 6, '#ffb3a0', 0.7);
    },
  },

  night: {
    back(ctx, R, t) {
      const g = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.7);
      g.addColorStop(0, `rgba(111,91,214,${0.45 + 0.1 * Math.sin(t)})`);
      g.addColorStop(1, 'rgba(111,91,214,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R * 1.8, -R * 1.8, R * 3.6, R * 3.6);
    },
    top(ctx, r, t) {
      radial(ctx, r, [
        [0, '#4a3c96'],
        [0.7, '#241a5c'],
        [1, '#120c33'],
      ]);
      for (let i = 0; i < 14; i++) {
        const x = (rand(i + 30) * 2 - 1) * r * 0.92;
        const y = (rand(i + 60) * 2 - 1) * r * 0.92;
        if (Math.abs(x) < r * 0.45 && Math.abs(y) < r * 0.45) continue; // keep the icon clear
        const a = 0.45 + 0.55 * Math.max(0, Math.sin(t * 2 + i * 1.9));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
      // A crescent moon in the corner.
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(r * 0.68, -r * 0.66, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#241a5c';
      ctx.beginPath();
      ctx.arc(r * 0.6, -r * 0.72, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      iconHalo(ctx, r, 'rgba(210,200,255,0.55)');
    },
    panel(ctx, R, r, side, t) {
      edgeShade(ctx, R, r, side, 'rgba(18,12,52,0.7)');
      for (let i = 0; i < 4; i++) {
        const p = perimeter((side + 0.15 + i * 0.22) / 4, R - 3);
        ctx.globalAlpha = 0.5 + 0.5 * Math.max(0, Math.sin(t * 2.5 + i + side * 2));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
    },
    front(ctx, R, t) {
      // Now and then, a shooting star.
      const cycle = t % 5;
      if (cycle > 1) return;
      const x = -R * 1.4 + cycle * R * 2.8;
      const y = -R * 1.25 + cycle * R * 0.7;
      const g = ctx.createLinearGradient(x - 16, y - 4, x, y);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, `rgba(255,255,255,${1 - cycle})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 4);
      ctx.lineTo(x, y);
      ctx.stroke();
    },
  },

  royal: {
    back(ctx, R, t) {
      const g = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.7);
      g.addColorStop(0, `rgba(255,215,94,${0.4 + 0.1 * Math.sin(t * 1.5)})`);
      g.addColorStop(0.6, 'rgba(176,91,214,0.25)');
      g.addColorStop(1, 'rgba(176,91,214,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R * 1.8, -R * 1.8, R * 3.6, R * 3.6);
    },
    top(ctx, r) {
      radial(ctx, r, [
        [0, '#d9a6f0'],
        [0.6, '#9a45c4'],
        [1, '#4d1470'],
      ]);
      iconHalo(ctx, r, 'rgba(255,240,255,0.6)');
      // Gold filigree: a double border with diamonds in the corners.
      ctx.strokeStyle = '#ffd75e';
      ctx.lineWidth = 1;
      ctx.strokeRect(-r + 2.5, -r + 2.5, r * 2 - 5, r * 2 - 5);
      ctx.lineWidth = 0.6;
      ctx.strokeRect(-r + 4.5, -r + 4.5, r * 2 - 9, r * 2 - 9);
      ctx.fillStyle = '#ffd75e';
      CORNERS.forEach(([cx, cy]) => {
        const x = cx * (r - 3.5);
        const y = cy * (r - 3.5);
        ctx.beginPath();
        ctx.moveTo(x, y - 2.5);
        ctx.lineTo(x + 2.5, y);
        ctx.lineTo(x, y + 2.5);
        ctx.lineTo(x - 2.5, y);
        ctx.closePath();
        ctx.fill();
      });
    },
    panel(ctx, R, r, side) {
      edgeShade(ctx, R, r, side, 'rgba(60,10,90,0.55)');
      const [nx, ny] = NORMALS[side]!;
      ctx.strokeStyle = 'rgba(255,215,94,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const d = R - 3;
      if (nx === 0) {
        ctx.moveTo(-d, ny * d);
        ctx.lineTo(d, ny * d);
      } else {
        ctx.moveTo(nx * d, -d);
        ctx.lineTo(nx * d, d);
      }
      ctx.stroke();
    },
    front(ctx, R, t) {
      glints(
        ctx,
        [
          [-R + 3, -R + 3],
          [R - 3, R - 3],
          [R - 2, -R + 6],
        ],
        t,
        4.5,
        '#fff2b0',
      );
    },
  },
};

/** Time for skin animations; frozen when motion is reduced. */
let motion = true;
export function setSkinMotion(on: boolean): void {
  motion = on;
}
export function skinTime(): number {
  return motion ? performance.now() / 1000 : 0;
}
