/**
 * Die faces for the townsfolk and the goat: each turns into a die that shows
 * what they were (the baker's bread, the guard's snoring, the bard's thrown
 * tomato). Drawn as shapes, not emoji, so they look the same on every phone.
 */
import * as THREE from 'three';

type X = CanvasRenderingContext2D;
const INK = '#2a1f2e';

function line(x: X, w = 7): void {
  x.lineWidth = w;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = INK;
}

const ICONS: Record<string, (x: X) => void> = {
  bread(x) {
    x.fillStyle = '#d99a4e';
    x.beginPath();
    x.ellipse(0, 6, 70, 42, 0, 0, Math.PI * 2);
    x.fill();
    line(x);
    x.stroke();
    x.strokeStyle = '#8a5a26';
    for (const dx of [-30, 0, 30]) {
      x.beginPath();
      x.moveTo(dx - 12, 22);
      x.lineTo(dx + 12, -12);
      x.stroke();
    }
  },
  croissant(x) {
    x.fillStyle = '#e8b45a';
    x.beginPath();
    x.arc(0, 30, 70, Math.PI * 1.1, Math.PI * 1.9);
    x.arc(0, 52, 44, Math.PI * 1.85, Math.PI * 1.15, true);
    x.closePath();
    x.fill();
    line(x);
    x.stroke();
    for (const a of [1.3, 1.5, 1.7]) {
      x.beginPath();
      x.moveTo(Math.cos(Math.PI * a) * 46, 52 + Math.sin(Math.PI * a) * 46);
      x.lineTo(Math.cos(Math.PI * a) * 68, 30 + Math.sin(Math.PI * a) * 68);
      x.stroke();
    }
  },
  cake(x) {
    x.fillStyle = '#f7d6e0';
    x.fillRect(-60, -10, 120, 70);
    x.fillStyle = '#c0607a';
    x.fillRect(-60, 18, 120, 14);
    line(x);
    x.strokeRect(-60, -10, 120, 70);
    x.fillStyle = '#e5485f';
    x.beginPath();
    x.arc(0, -26, 16, 0, Math.PI * 2);
    x.fill();
    x.stroke();
  },
  carrot(x) {
    x.fillStyle = '#ff8c2a';
    x.beginPath();
    x.moveTo(-26, -40);
    x.lineTo(26, -40);
    x.lineTo(0, 74);
    x.closePath();
    x.fill();
    line(x);
    x.stroke();
    x.fillStyle = '#4caf50';
    for (const a of [-0.5, 0, 0.5]) {
      x.save();
      x.translate(0, -40);
      x.rotate(a);
      x.beginPath();
      x.ellipse(0, -28, 10, 28, 0, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.restore();
    }
  },
  egg(x) {
    x.fillStyle = '#fff8ea';
    x.beginPath();
    x.ellipse(0, 8, 46, 62, 0, 0, Math.PI * 2);
    x.fill();
    line(x);
    x.stroke();
    x.fillStyle = '#f0e2c8';
    x.beginPath();
    x.ellipse(-14, -14, 10, 16, -0.4, 0, Math.PI * 2);
    x.fill();
  },
  pitchfork(x) {
    line(x, 10);
    x.strokeStyle = '#8a5a33';
    x.beginPath();
    x.moveTo(0, 80);
    x.lineTo(0, -20);
    x.stroke();
    x.strokeStyle = '#8d93a3';
    x.beginPath();
    x.moveTo(-36, -76);
    x.lineTo(-36, -20);
    x.lineTo(36, -20);
    x.lineTo(36, -76);
    x.moveTo(0, -76);
    x.lineTo(0, -20);
    x.stroke();
  },
  spear(x) {
    line(x, 10);
    x.strokeStyle = '#8a5a33';
    x.beginPath();
    x.moveTo(-50, 70);
    x.lineTo(30, -40);
    x.stroke();
    x.fillStyle = '#c9d2de';
    x.beginPath();
    x.moveTo(62, -82);
    x.lineTo(16, -46);
    x.lineTo(42, -26);
    x.closePath();
    x.fill();
    line(x, 6);
    x.stroke();
  },
  zzz(x) {
    x.fillStyle = '#3c6bc0';
    x.font = '900 70px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('Z', -30, 30);
    x.font = '900 52px system-ui, sans-serif';
    x.fillText('z', 18, -6);
    x.font = '900 38px system-ui, sans-serif';
    x.fillText('z', 52, -40);
  },
  coffee(x) {
    x.fillStyle = '#f4ead2';
    x.beginPath();
    x.roundRect(-46, -20, 76, 80, 12);
    x.fill();
    line(x);
    x.stroke();
    x.beginPath();
    x.arc(38, 18, 20, -Math.PI / 2, Math.PI / 2);
    x.stroke();
    x.strokeStyle = '#a08a7a';
    for (const dx of [-24, 6]) {
      x.beginPath();
      x.moveTo(dx, -34);
      x.bezierCurveTo(dx - 14, -50, dx + 14, -60, dx, -78);
      x.stroke();
    }
  },
  lute(x) {
    x.fillStyle = '#c8873a';
    x.beginPath();
    x.ellipse(-10, 24, 44, 52, -0.6, 0, Math.PI * 2);
    x.fill();
    line(x);
    x.stroke();
    x.fillStyle = INK;
    x.beginPath();
    x.arc(-8, 22, 12, 0, Math.PI * 2);
    x.fill();
    line(x, 12);
    x.beginPath();
    x.moveTo(14, -10);
    x.lineTo(62, -72);
    x.stroke();
  },
  note(x) {
    x.fillStyle = INK;
    x.beginPath();
    x.ellipse(-24, 48, 26, 20, -0.4, 0, Math.PI * 2);
    x.fill();
    x.fillRect(-2, -70, 12, 118);
    x.beginPath();
    x.moveTo(10, -70);
    x.quadraticCurveTo(60, -50, 44, -6);
    x.quadraticCurveTo(40, -40, 10, -40);
    x.fill();
  },
  tomato(x) {
    x.fillStyle = '#e53935';
    x.beginPath();
    x.ellipse(0, 12, 60, 52, 0, 0, Math.PI * 2);
    x.fill();
    line(x);
    x.stroke();
    // splat
    x.fillStyle = '#e53935';
    for (const [dx, dy, r] of [
      [70, 50, 10],
      [-74, 40, 8],
      [60, -40, 7],
    ] as const) {
      x.beginPath();
      x.arc(dx, dy, r, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#43a047';
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = i % 2 ? 10 : 26;
      x.lineTo(Math.cos(a) * r, -38 + Math.sin(a) * r * 0.5);
    }
    x.fill();
  },
  fish(x) {
    x.fillStyle = '#6fb3d3';
    x.beginPath();
    x.ellipse(-8, 0, 58, 32, 0, 0, Math.PI * 2);
    x.fill();
    line(x);
    x.stroke();
    x.beginPath();
    x.moveTo(44, 0);
    x.lineTo(82, -30);
    x.lineTo(82, 30);
    x.closePath();
    x.fillStyle = '#6fb3d3';
    x.fill();
    x.stroke();
    x.fillStyle = INK;
    x.beginPath();
    x.arc(-40, -8, 7, 0, Math.PI * 2);
    x.fill();
  },
  boot(x) {
    x.fillStyle = '#6b4528';
    x.beginPath();
    x.moveTo(-30, -70);
    x.lineTo(20, -70);
    x.lineTo(20, 20);
    x.lineTo(70, 30);
    x.lineTo(70, 64);
    x.lineTo(-30, 64);
    x.closePath();
    x.fill();
    line(x);
    x.stroke();
    // it's dripping: it came out of the river
    x.fillStyle = '#6fb3d3';
    for (const dx of [-10, 40]) {
      x.beginPath();
      x.arc(dx, 84, 7, 0, Math.PI * 2);
      x.fill();
    }
  },
  stink(x) {
    line(x, 9);
    x.strokeStyle = '#7cb342';
    for (const dx of [-40, 0, 40]) {
      x.beginPath();
      x.moveTo(dx, 70);
      x.bezierCurveTo(dx - 30, 30, dx + 30, 0, dx, -30);
      x.bezierCurveTo(dx - 26, -50, dx + 20, -70, dx, -80);
      x.stroke();
    }
  },
  goatface(x) {
    x.fillStyle = '#f2efe6';
    x.beginPath();
    x.ellipse(0, 10, 46, 56, 0, 0, Math.PI * 2);
    x.fill();
    line(x);
    x.stroke();
    x.fillStyle = '#5b4a3a';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(s * 20, -36);
      x.quadraticCurveTo(s * 60, -80, s * 70, -50);
      x.quadraticCurveTo(s * 50, -60, s * 34, -28);
      x.fill();
    }
    x.fillStyle = INK;
    // rectangular goat pupils
    for (const s of [-1, 1]) x.fillRect(s * 20 - 8, -2, 16, 6);
    x.fillStyle = '#f2efe6';
    x.beginPath();
    x.moveTo(-12, 62);
    x.lineTo(12, 62);
    x.lineTo(0, 92);
    x.closePath();
    x.fill();
    x.stroke();
  },
  notes(x) {
    x.save();
    x.rotate(-0.15);
    x.fillStyle = '#f4ead2';
    x.fillRect(-46, -62, 92, 124);
    line(x, 6);
    x.strokeRect(-46, -62, 92, 124);
    x.fillStyle = '#7a2638';
    x.font = '900 70px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('§', 0, 4);
    // a bite out of the corner
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.arc(46, -62, 26, 0, Math.PI * 2);
    x.fill();
    x.restore();
  },
  can(x) {
    x.fillStyle = '#b8bec9';
    x.fillRect(-40, -50, 80, 100);
    x.fillStyle = '#e5485f';
    x.fillRect(-40, -18, 80, 36);
    line(x);
    x.strokeRect(-40, -50, 80, 100);
    x.beginPath();
    x.ellipse(0, -50, 40, 10, 0, 0, Math.PI * 2);
    x.fillStyle = '#d8dde6';
    x.fill();
    x.stroke();
  },
};

const cache = new Map<string, THREE.CanvasTexture>();

/** A die face: ivory, a panel in the owner's colour, and the icon. */
export function iconTexture(
  name: string,
  tint: string,
  renderer: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const key = `${name}|${tint}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f4ead2';
  x.fillRect(0, 0, 256, 256);
  x.globalAlpha = 0.4;
  x.fillStyle = tint;
  x.beginPath();
  x.roundRect(26, 26, 204, 204, 36);
  x.fill();
  x.globalAlpha = 1;
  x.strokeStyle = tint;
  x.lineWidth = 6;
  x.stroke();
  x.save();
  x.translate(128, 128);
  x.scale(1.15, 1.15);
  ICONS[name]?.(x);
  x.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  cache.set(key, tex);
  return tex;
}
