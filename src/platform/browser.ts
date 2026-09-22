import type { Analytics, KeyValueStorage, Platform, ShareResult } from './platform';

/** localStorage with an in-memory fallback when storage is blocked or full. */
export class BrowserStorage implements KeyValueStorage {
  private memory = new Map<string, string>();

  get(key: string): string | null {
    try {
      const v = window.localStorage.getItem(key);
      if (v !== null) return v;
    } catch {
      // storage unavailable: fall through to memory
    }
    return this.memory.get(key) ?? null;
  }

  set(key: string, value: string): boolean {
    this.memory.set(key, value);
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

/** Placeholder until milestone 3 adds the real analytics pipeline. */
const noopAnalytics: Analytics = { track: () => undefined };

export function createBrowserPlatform(): Platform {
  return {
    storage: new BrowserStorage(),
    analytics: noopAnalytics,
    async share({ text, title }): Promise<ShareResult> {
      try {
        if (navigator.share) {
          await navigator.share({ text, ...(title ? { title } : {}) });
          return 'shared';
        }
      } catch {
        // user cancelled or share failed: try the clipboard
      }
      try {
        await navigator.clipboard.writeText(text);
        return 'copied';
      } catch {
        return 'failed';
      }
    },
    onVisibilityChange(cb) {
      const handler = () => cb(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
    locale: () => navigator.language || 'en',
    now: () => Date.now(),
    prefersReducedMotion: () =>
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
}
