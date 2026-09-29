/**
 * The host for the Poki build: the browser platform, with Poki's SDK for ads
 * and portal events, and no outside links in shared results.
 */
import { createPokiAds } from './ads';
import { createBrowserPlatform } from './browser';
import type { Platform } from './platform';

export function createPokiPlatform(): Platform {
  return { ...createBrowserPlatform(), ads: createPokiAds(), shareUrl: null };
}
