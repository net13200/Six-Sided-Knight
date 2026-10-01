/**
 * Which build this is: the web version (GitHub Pages, installable app) or the
 * CrazyGames version (`npm run build:crazygames`). Settings for the portal
 * build live here.
 */
export type Portal = 'crazygames';

const MODE = import.meta.env.MODE;
export const PORTAL: Portal | null = MODE === 'crazygames' ? MODE : null;
/** A game portal hosts this build: no install bits, no outside links, no hidden tools. */
export const IS_PORTAL = PORTAL !== null;

export const PORTAL_OPTIONS = {
  /** The SugiGames intro splash. On; build with VITE_PORTAL_SPLASH=0 to drop it. */
  splash: import.meta.env.VITE_PORTAL_SPLASH !== '0',
} as const;
