/**
 * The host for the portal build (CrazyGames): the browser platform, with no
 * outside links in shared results. Basic Launch needs no SDK (and has no ads).
 */
import { NO_ADS } from './ads';
import { createBrowserPlatform } from './browser';
import type { Platform } from './platform';
import type { Portal } from './target';

export function createPortalPlatform(_portal: Portal): Platform {
  return { ...createBrowserPlatform(), ads: NO_ADS, shareUrl: null };
}
