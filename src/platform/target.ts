/**
 * Which build this is: the web version (GitHub Pages, installable app) or the
 * Poki version (`npm run build:poki`). Settings for the Poki build live here.
 */
export const IS_POKI = import.meta.env.MODE === 'poki';

export const POKI_OPTIONS = {
  /**
   * The SugiGames intro splash. Off by default (portals prefer landing
   * straight in the game); build with VITE_POKI_SPLASH=1 to keep it.
   */
  splash: import.meta.env.VITE_POKI_SPLASH === '1',
} as const;
