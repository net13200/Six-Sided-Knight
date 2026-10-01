/**
 * Which build this is: the web version (GitHub Pages, installable app) or a
 * CrazyGames version (`npm run build:crazygames` for Basic Launch, `...:full`
 * with their SDK). Settings for the portal builds live here.
 */
export type Portal = 'crazygames';

const MODE = import.meta.env.MODE;
export const PORTAL: Portal | null =
  MODE === 'crazygames' || MODE === 'crazygames-full' ? 'crazygames' : null;
/**
 * The CrazyGames Full Launch build (`npm run build:crazygames:full`): their SDK,
 * ads, and saves through their Data module. The Basic Launch build has none.
 */
export const CRAZY_SDK = MODE === 'crazygames-full';
/** A game portal hosts this build: no install bits, no outside links, no hidden tools. */
export const IS_PORTAL = PORTAL !== null;

export const PORTAL_OPTIONS = {
  /**
   * The SugiGames intro splash. Off: portals show their own loader and want
   * players in the game at once. Build with VITE_PORTAL_SPLASH=1 to keep it.
   */
  splash: import.meta.env.VITE_PORTAL_SPLASH === '1',
} as const;
