/** Web Worker: generates levels (and solves them, for the dev tools) off the main thread. */
import { defaultRules } from '../content/register';
import type { GameState } from '../engine';
import { solve } from '../solver/solve';
import { generateLevel, type GenParams } from './generate';

const rules = defaultRules();

export type WorkerRequest =
  | { id: number; kind?: 'generate'; params: GenParams }
  | { id: number; kind: 'solve'; state: GameState };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    const result =
      req.kind === 'solve'
        ? solve(rules, req.state, { maxNodes: 400_000 })
        : generateLevel(rules, req.params);
    (self as unknown as Worker).postMessage({ id: req.id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, error: String(err) });
  }
};
