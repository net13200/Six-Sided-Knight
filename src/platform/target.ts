/**
 * Which build this is: the web version (GitHub Pages, installable app) or the
 * Poki version (`npm run build:poki`). Settings for the Poki build live here.
 */
export const IS_POKI = import.meta.env.MODE === 'poki';

export const POKI_OPTIONS = {
  /** The SugiGames intro splash. On; build with VITE_POKI_SPLASH=0 to drop it. */
  splash: import.meta.env.VITE_POKI_SPLASH !== '0',
} as const;
