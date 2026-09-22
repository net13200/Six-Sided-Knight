/** Web Worker: generates levels off the main thread so play never stutters. */
import { defaultRules } from '../content/register';
import { generateLevel, type GenParams } from './generate';

const rules = defaultRules();

self.onmessage = (e: MessageEvent<{ id: number; params: GenParams }>) => {
  const { id, params } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, result: generateLevel(rules, params) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
