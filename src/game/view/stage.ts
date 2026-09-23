/**
 * The stage is a fixed 340x480 logical box, scaled to fit the window and
 * letterboxed. The canvas backing store matches the real pixel size so it
 * stays crisp on high-DPI screens. DOM UI lives in a layer on top and scales
 * with the same transform.
 */
export const LOGICAL_W = 340;
export const LOGICAL_H = 480;

export class Stage {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly ui: HTMLElement;
  scale = 1;
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
    container.append(this.root);
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
