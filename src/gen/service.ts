/**
 * Generates levels asynchronously: in a Web Worker when available (so a slow
 * hard floor never blocks the frame loop), otherwise inline. Results are
 * cached by level id, and `prefetch` warms the cache for the next floor.
 */
import type { Rules } from '../engine';
import { generateLevel, type GenParams, type Generated } from './generate';

type Pending = {
  params: GenParams;
  resolve: (g: Generated) => void;
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
        e: MessageEvent<{ id: number; result?: Generated; error?: string }>,
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
    return `${p.id}|${p.seed}|${p.band.join('-')}|${p.hp ?? 5}`;
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
    if (!this.worker) return Promise.resolve().then(() => generateLevel(this.rules, params));
    const id = this.nextId++;
    return new Promise<Generated>((resolve, reject) => {
      this.pending.set(id, { params, resolve, reject });
      this.worker!.postMessage({ id, params });
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
        p.resolve(generateLevel(this.rules, p.params));
      } catch (e) {
        p.reject(e as Error);
      }
    }
  }
}
