/**
 * The hosts for the portal builds: the browser platform, with no outside
 * links in shared results. Poki's adds its SDK for ads and portal events.
 * CrazyGames' Basic Launch needs no SDK (and has no ads).
 */
import { createPokiAds, NO_ADS } from './ads';
import { createBrowserPlatform } from './browser';
import type { Platform } from './platform';
import type { Portal } from './target';

export function createPortalPlatform(portal: Portal): Platform {
  const ads = portal === 'poki' ? createPokiAds() : NO_ADS;
  return { ...createBrowserPlatform(), ads, shareUrl: null };
}
