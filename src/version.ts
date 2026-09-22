/**
 * Build information, injected by Vite at build time (see vite.config.ts).
 * VERSION comes from package.json; bump it with each release and add a
 * CHANGELOG.md entry.
 */
declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;
declare const __BUILD_DATE__: string;

export const VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
export const BUILD_SHA: string = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'local';
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';

/** Short label for the UI, e.g. "v0.3.0 (5346c46)". */
export const VERSION_LABEL = `v${VERSION}${BUILD_SHA !== 'local' ? ` (${BUILD_SHA})` : ''}`;
