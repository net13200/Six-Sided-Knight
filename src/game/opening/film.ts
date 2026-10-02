/**
 * The 3D opening as a film: four short scenes played in order, with
 * captions, tap-to-advance and a closing title. It owns a WebGL canvas inside
 * `host`; the opening scene drives it (advance/draw) from the game loop and
 * shows its captions. Loaded on demand, so Three.js is only downloaded by
 * players who watch it.
 */
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { morning, oldWell, throneRoom, you, type Stage } from './scenes';

export interface FilmEvents {
  /** The caption to show now (English key; '' for none). */
  caption(text: string): void;
  /** 0..1: how dark the fade to and from black is. */
  fade(amount: number): void;
  /** The last scene has played (or was tapped past). */
  ended(): void;
}

export class Film {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly effect: OutlineEffect;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private readonly hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
  private readonly sun = new THREE.DirectionalLight('#ffffff', 2);
  private readonly makers: (() => Stage)[];
  private index = -1;
  private stage: Stage | null = null;
  private t = 0;
  private fadeOut = -1; // >= 0 while fading to the next scene
  private done = false;
  private shownCaption = '';
  private readonly onResize = () => this.resize();

  /** Throws if this device can't draw 3D. */
  constructor(
    private readonly host: HTMLElement,
    private readonly events: FilmEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.effect = new OutlineEffect(this.renderer, {
      defaultThickness: 0.0045,
      defaultColor: [0.1, 0.07, 0.14],
    });
    this.scene.add(this.hemi);
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.001;
    this.scene.add(sun, sun.target);
    const ctx = { renderer: this.renderer };
    this.makers = [throneRoom, oldWell, () => morning(ctx), () => you(ctx)];
    addEventListener('resize', this.onResize);
    this.resize();
    this.load(0);
  }

  private resize(): void {
    const w = this.host.clientWidth || innerWidth;
    const h = this.host.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // keep the action in frame on a phone held upright
    this.camera.fov = this.camera.aspect < 1 ? 40 + (1 - this.camera.aspect) * 34 : 40;
    this.camera.updateProjectionMatrix();
  }

  private load(i: number): void {
    if (this.stage) {
      this.scene.remove(this.stage.root);
      this.stage.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.index = i;
    const stage = this.makers[i]!();
    this.stage = stage;
    this.scene.add(stage.root);
    const l = stage.look;
    this.scene.background = new THREE.Color(l.background);
    this.scene.fog = new THREE.Fog(l.background, l.fog[0], l.fog[1]);
    this.sun.color.set(l.sun.color);
    this.sun.position.set(...l.sun.pos);
    this.hemi.color.set(l.hemi.sky);
    this.hemi.groundColor.set(l.hemi.ground);
    this.t = 0;
    this.fadeOut = -1;
    this.caption('');
  }

  private caption(text: string): void {
    if (text === this.shownCaption) return;
    this.shownCaption = text;
    this.events.caption(text);
  }

  private end(): void {
    if (this.done) return;
    this.done = true;
    this.caption('');
    this.events.ended();
  }

  /** On to the next scene (a tap); after the last one, the end. */
  next(): void {
    if (this.fadeOut >= 0 || this.done) return;
    if (this.index >= this.makers.length - 1) this.end();
    else this.fadeOut = 0;
  }

  advance(dt: number): void {
    const s = this.stage!;
    this.t += dt;
    s.update(this.t, dt, this.camera);
    const dim = (s as Stage & { hemiDim?: () => number }).hemiDim?.() ?? 1;
    this.hemi.intensity = s.look.hemi.intensity * dim;
    this.sun.intensity = s.look.sun.intensity * dim;
    if (!this.done) {
      let text = '';
      for (const c of s.captions) if (this.t >= c.at) text = c.text;
      this.caption(this.t > s.duration - 0.6 || s.speaking?.() ? '' : text);
      const last = this.index === this.makers.length - 1;
      if (this.t >= s.duration - (last ? 1.6 : 0) && this.fadeOut < 0) {
        if (last) this.end();
        else this.next();
      }
    }
    let black = 1 - Math.min(1, this.t / 0.6);
    if (this.fadeOut >= 0) {
      this.fadeOut += dt;
      black = Math.max(black, Math.min(1, this.fadeOut / 0.45));
      if (this.fadeOut > 0.5) {
        if (this.index + 1 < this.makers.length) this.load(this.index + 1);
        else this.end();
      }
    }
    this.events.fade(black);
  }

  draw(): void {
    this.effect.render(this.scene, this.camera);
  }

  dispose(): void {
    removeEventListener('resize', this.onResize);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) mat.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
