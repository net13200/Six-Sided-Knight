/**
 * Dev tool (debug mode only): watch a level's solution play out. The solver
 * runs in the worker; the moves then play through the normal board with the
 * usual animations. A watched run never counts: no stars, crowns or stats.
 */
import type { Dir } from '../../engine';
import type { SolveResult } from '../../solver/solve';
import { el, place } from '../ui';

/** Seconds between moves at ×1 (after the previous move's animation). */
const STEP_SECONDS = 0.35;
const SPEEDS = [1, 2, 4] as const;

export interface WatchHost {
  /** Restarts the level from its first state. */
  reset(): void;
  /** Plays one move (animated, not counted). */
  play(dir: Dir): void;
  /** True while a move is still animating. */
  readonly busy: boolean;
  /** Called when watching ends (Stop). */
  ended(): void;
}

export class SolutionWatch {
  private bar: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  private pauseBtn: HTMLButtonElement | null = null;
  private speedBtn: HTMLButtonElement | null = null;
  private chooser: HTMLElement | null = null;
  private path: readonly Dir[] = [];
  private i = 0;
  private wait = 0;
  private speed = 0;
  private paused = false;
  /** True once playback started (as opposed to choosing / solving). */
  private playing = false;

  constructor(
    private readonly ui: HTMLElement,
    private readonly host: WatchHost,
  ) {}

  get active(): boolean {
    return this.playing;
  }

  /** Solves, then offers the par solution. */
  open(solutions: Promise<SolveResult>): void {
    this.showChooser(null);
    solutions.then(
      (a) => this.showChooser(a),
      () => this.showChooser(undefined),
    );
  }

  private showChooser(r: SolveResult | null | undefined): void {
    this.chooser?.remove();
    const body: HTMLElement[] = [el('h2', { text: 'Watch a solution' })];
    if (r === null) body.push(el('p', { testId: 'watch-solving', text: 'Solving…' }));
    else if (r === undefined) body.push(el('p', { text: "The solver couldn't finish." }));
    else {
      const b = el('button', {
        className: 'btn',
        testId: 'watch-any',
        text: r.status === 'solved' ? `Par · ${r.moves} moves` : 'Par · no solution',
        onClick: () => this.start(r.path),
      });
      b.disabled = r.status !== 'solved';
      body.push(b);
    }
    body.push(
      el('button', {
        className: 'btn small',
        testId: 'watch-cancel',
        text: 'Cancel',
        onClick: () => this.stop(),
      }),
    );
    this.chooser = place(
      el('div', { className: 'sheet watch-chooser', testId: 'watch-chooser' }, body),
      40,
      110,
      260,
      0,
    );
    this.chooser.style.height = 'auto';
    this.ui.append(this.chooser);
  }

  private start(path: readonly Dir[]): void {
    this.chooser?.remove();
    this.chooser = null;
    this.path = path;
    this.i = 0;
    this.wait = STEP_SECONDS;
    this.paused = false;
    this.playing = true;
    this.host.reset();
    const btn = (id: string, text: string, onClick: () => void) =>
      el('button', { className: 'btn small', testId: id, text, onClick });
    this.label = el('span', { className: 'watch-label', testId: 'watch-label' });
    this.pauseBtn = btn('watch-pause', '❚❚', () => this.togglePause());
    this.speedBtn = btn('watch-speed', '×1', () => this.cycleSpeed());
    this.bar = place(
      el('div', { className: 'watch-bar', testId: 'watch-bar' }, [
        this.label,
        this.pauseBtn,
        btn('watch-step', 'Step', () => this.step()),
        this.speedBtn,
        btn('watch-stop', 'Stop', () => this.stop()),
      ]),
      0,
      0,
      340,
      48,
    );
    this.ui.append(this.bar);
    this.render();
  }

  /** Called every frame. */
  update(dt: number): void {
    if (!this.playing || this.paused || this.host.busy || this.i >= this.path.length) return;
    this.wait -= dt * SPEEDS[this.speed]!;
    if (this.wait <= 0) this.step();
  }

  private step(): void {
    if (!this.playing || this.i >= this.path.length || this.host.busy) return;
    this.host.play(this.path[this.i]!);
    this.i++;
    this.wait = STEP_SECONDS;
    this.render();
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.render();
  }

  private cycleSpeed(): void {
    this.speed = (this.speed + 1) % SPEEDS.length;
    this.render();
  }

  /** Stop: back to the level's start, ready to play for real. */
  stop(): void {
    const wasPlaying = this.playing;
    this.playing = false;
    this.chooser?.remove();
    this.bar?.remove();
    this.chooser = this.bar = null;
    if (wasPlaying) this.host.reset();
    this.host.ended();
  }

  private render(): void {
    if (!this.label) return;
    const done = this.i >= this.path.length;
    this.label.textContent = done
      ? `Par ✓ ${this.path.length}`
      : `Par ${this.i}/${this.path.length}`;
    this.pauseBtn!.textContent = this.paused ? '▶' : '❚❚';
    this.pauseBtn!.setAttribute('aria-label', this.paused ? 'Play' : 'Pause');
    this.pauseBtn!.disabled = done;
    this.speedBtn!.textContent = `×${SPEEDS[this.speed]}`;
  }
}
