/**
 * The stage is a fixed 340x480 logical box, scaled to fit the window. The
 * canvas backing store matches the real pixel size so it stays crisp on
 * high-DPI screens. DOM UI lives in a layer on top and scales with the same
 * transform. Around it, a full-window backdrop canvas covers the rest of the
 * screen (a wide 16:9 desktop window, a phone on its side), so there are no
 * empty bars: scenery, and side panels the scene may fill.
 */
export const LOGICAL_W = 340;
export const LOGICAL_H = 480;

export class Stage {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly ui: HTMLElement;
  /** Full-window canvas behind the stage. */
  readonly backdrop: HTMLCanvasElement;
  readonly backdropCtx: CanvasRenderingContext2D;
  scale = 1;
  /** Window size, and the stage's box in it (CSS pixels). */
  view = { w: 0, h: 0 };
  box = { x: 0, y: 0, w: 0, h: 0 };
  private dpr = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'stage';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    this.canvas.setAttribute('aria-label', 'Game board');
    this.canvas.setAttribute('role', 'img');
    // Focusable so screen readers can land on the board and read its description.
    this.canvas.tabIndex = 0;
    this.ui = document.createElement('div');
    this.ui.className = 'stage-ui';
    this.root.append(this.canvas, this.ui);
    this.backdrop = document.createElement('canvas');
    this.backdrop.className = 'stage-backdrop';
    this.backdrop.setAttribute('aria-hidden', 'true');
    container.append(this.backdrop, this.root);
    const bctx = this.backdrop.getContext('2d');
    if (!bctx) throw new Error('Canvas 2D is not supported');
    this.backdropCtx = bctx;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
  }

  resize(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.scale = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    // Above 2x the extra sharpness is invisible on a phone but costs ~1.7x the pixels to paint.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.offsetX = Math.round((vw - LOGICAL_W * this.scale) / 2);
    this.offsetY = Math.round((vh - LOGICAL_H * this.scale) / 2);
    this.root.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    this.canvas.width = Math.round(LOGICAL_W * this.scale * this.dpr);
    this.canvas.height = Math.round(LOGICAL_H * this.scale * this.dpr);
    this.view = { w: vw, h: vh };
    this.box = {
      x: this.offsetX,
      y: this.offsetY,
      w: LOGICAL_W * this.scale,
      h: LOGICAL_H * this.scale,
    };
    this.backdrop.width = Math.round(vw * this.dpr);
    this.backdrop.height = Math.round(vh * this.dpr);
    this.backdropVersion++;
  }

  /** Bumped on every resize (so cached backdrop art is redrawn). */
  backdropVersion = 0;

  /** Whether there is room around the stage (anything wider than the stage's shape). */
  get hasSides(): boolean {
    return this.box.x >= 8;
  }

  /** The backdrop's context, in CSS pixels. */
  beginBackdrop(): CanvasRenderingContext2D {
    this.backdropCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return this.backdropCtx;
  }

  /** Device pixels per logical pixel (for extra canvases that must stay crisp). */
  get pixelRatio(): number {
    return this.scale * this.dpr;
  }

  /** Prepares the context so drawing uses logical coordinates. */
  beginFrame(): CanvasRenderingContext2D {
    const k = this.scale * this.dpr;
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    return this.ctx;
  }

  /** Converts a client (CSS pixel) position to logical coordinates. */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    return { x: (clientX - this.offsetX) / this.scale, y: (clientY - this.offsetY) / this.scale };
  }
}
