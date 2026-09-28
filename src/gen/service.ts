/**
 * Generates levels asynchronously: in a Web Worker when available (so a slow
 * hard floor never blocks the frame loop), otherwise inline. Results are
 * cached by level id, and `prefetch` warms the cache for the next floor.
 */
import type { GameState, Rules } from '../engine';
import { analyze, type LevelAnalysis } from '../solver/solve';
import { generateLevel, type GenParams, type Generated } from './generate';
import type { WorkerRequest } from './worker';

type Pending = {
  /** The same work done inline, if the worker breaks. */
  inline: () => unknown;
  resolve: (result: unknown) => void;
  reject: (e: Error) => void;
};

export class LevelService {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly cache = new Map<string, Promise<Generated>>();

  constructor(
    private readonly rules: Rules,
    useWorker = typeof Worker !== 'undefined',
  ) {
    if (!useWorker) return;
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (
        e: MessageEvent<{ id: number; result?: unknown; error?: string }>,
      ) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.result) p.resolve(e.data.result);
        else p.reject(new Error(e.data.error ?? 'generation failed'));
      };
      this.worker.onerror = () => this.disableWorker();
    } catch {
      this.worker = null;
    }
  }

  /** Cache key includes the params that change the result. */
  private key(p: GenParams): string {
    return `${p.id}|${p.seed}|${p.band.join('-')}|${p.hp ?? 5}|${p.features ?? 1}|${p.shared ? 's' : ''}|${p.loadout?.join(',') ?? ''}`;
  }

  generate(params: GenParams): Promise<Generated> {
    const k = this.key(params);
    let job = this.cache.get(k);
    if (!job) {
      job = this.run(params);
      this.cache.set(k, job);
      job.catch(() => this.cache.delete(k));
    }
    return job;
  }

  prefetch(params: GenParams): void {
    void this.generate(params).catch(() => undefined);
  }

  private run(params: GenParams): Promise<Generated> {
    return this.post({ id: 0, params }, () => generateLevel(this.rules, params));
  }

  /**
   * Solutions for all three stars from `state` (dev tools: watching the par
   * solution). Off the main thread, so hard levels never freeze the screen.
   */
  solve(state: GameState, healStar = false): Promise<LevelAnalysis> {
    return this.post({ id: 0, kind: 'solve', state, healStar }, () =>
      analyze(this.rules, state, 400_000, { healStar }),
    );
  }

  private post<T>(req: WorkerRequest, inline: () => T): Promise<T> {
    if (!this.worker) return Promise.resolve().then(inline);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { inline, resolve: resolve as (r: unknown) => void, reject });
      this.worker!.postMessage({ ...req, id });
    });
  }

  /** If the worker breaks, finish outstanding jobs inline. */
  private disableWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    const jobs = [...this.pending.values()];
    this.pending.clear();
    for (const p of jobs) {
      try {
        p.resolve(p.inline());
      } catch (e) {
        p.reject(e as Error);
      }
    }
  }
}
