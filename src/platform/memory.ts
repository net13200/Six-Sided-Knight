import type { KeyValueStorage } from './platform';

/** In-memory storage (tests, and hosts without persistent storage). */
export class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  /** When set, writes fail (simulates a full or blocked store). */
  failWrites = false;

  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string): boolean {
    if (this.failWrites) return false;
    this.map.set(key, value);
    return true;
  }
  remove(key: string): void {
    this.map.delete(key);
  }
}
