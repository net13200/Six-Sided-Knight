/**
 * Everything the game needs from its host environment. Game code talks only
 * to this interface, so a new host (app store wrapper, portal, ...) is a new
 * implementation, not a rewrite.
 */
export interface KeyValueStorage {
  /** Returns null if missing or if storage is unavailable. Never throws. */
  get(key: string): string | null;
  /** Returns false if the write failed (quota, private mode). Never throws. */
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

export interface Analytics {
  track(name: string, props?: Readonly<Record<string, string | number | boolean>>): void;
}

import type { Ads } from './ads';

export type ShareResult = 'shared' | 'copied' | 'failed';

export interface Platform {
  readonly storage: KeyValueStorage;
  readonly analytics: Analytics;
  /** Ad breaks and portal events (none on the web build). */
  readonly ads: Ads;
  /** The link shared results point to, or null where outside links aren't allowed (portals). */
  readonly shareUrl: string | null;
  share(data: { text: string; title?: string }): Promise<ShareResult>;
  /** Calls back with false when the game is hidden, true when visible again. */
  onVisibilityChange(cb: (visible: boolean) => void): () => void;
  locale(): string;
  /** Wall-clock milliseconds (for timestamps, not simulation). */
  now(): number;
  prefersReducedMotion(): boolean;
  /** A portal's extras (CrazyGames' SDK); absent elsewhere. */
  readonly portal?: PortalHooks;
}

/** What a portal SDK offers beyond ads. Every call is optional to the game. */
export interface PortalHooks {
  /** A special moment worth celebrating on the site (sparingly: not every level). */
  happytime(): void;
  /** How much of the game the player has completed, 0-100. */
  progress(pct: number): void;
  /** What the player is doing, attached to their feedback; null clears it. */
  context(ctx: Readonly<Record<string, string | number>> | null): void;
  /** The portal's own mute setting: it wins over the game's Sound button. */
  forcedMute(): boolean;
  onForcedMuteChange(fn: (muted: boolean) => void): void;
}
