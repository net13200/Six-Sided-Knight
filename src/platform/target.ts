/**
 * Which build this is: the web version (GitHub Pages, installable app), the
 * Poki version (`npm run build:poki`) or the CrazyGames version
 * (`npm run build:crazygames`). Settings for the portal builds live here.
 */
export type Portal = 'poki' | 'crazygames';

const MODE = import.meta.env.MODE;
export const PORTAL: Portal | null = MODE === 'poki' || MODE === 'crazygames' ? MODE : null;
/** A game portal hosts this build: no install bits, no outside links, no hidden tools. */
export const IS_PORTAL = PORTAL !== null;

export const PORTAL_OPTIONS = {
  /** The SugiGames intro splash. On; build with VITE_POKI_SPLASH=0 to drop it. */
  splash: import.meta.env.VITE_POKI_SPLASH !== '0',
} as const;
