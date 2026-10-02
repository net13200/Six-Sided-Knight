/** The game's own die faces as textures for the 3D opening. */
import * as THREE from 'three';
import { drawFace } from '../view/art';
import { roleColor } from '../view/roles';

const faceTex = new Map<string, THREE.CanvasTexture>();

/** A face's art on ivory, with a panel in its role's colour. */
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
