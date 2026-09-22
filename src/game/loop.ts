/**
 * Fixed-timestep game loop: simulation-side updates run at exactly 60 Hz,
 * frame time is capped (no spiral of death after a stall), and the loop
 * pauses while the tab is hidden.
 */
export const STEP = 1 / 60;
export const MAX_FRAME = 0.1;

/** Pure accumulator logic, exported for tests. Returns [steps to run, leftover]. */
export function accumulate(acc: number, frameDt: number): [number, number] {
  let total = acc + Math.min(Math.max(frameDt, 0), MAX_FRAME);
  let steps = 0;
  while (total >= STEP) {
    total -= STEP;
    steps++;
  }
  return [steps, total];
}

export class Loop {
  private acc = 0;
  private last = -1;
  private raf = 0;
  private paused = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    const frame = (ts: number) => {
      const dt = this.last < 0 ? 0 : (ts - this.last) / 1000;
      this.last = ts;
      if (!this.paused) {
        const [steps, rest] = accumulate(this.acc, dt);
        this.acc = rest;
        for (let i = 0; i < steps; i++) this.update(STEP);
        this.render();
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.last = -1; // don't count the hidden time
    this.acc = 0;
  }

  get isPaused(): boolean {
    return this.paused;
  }
}
