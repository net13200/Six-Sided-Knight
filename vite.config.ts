import { execSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'local';
  }
}

/** The portal builds (`vite build --mode crazygames`), each in its own folder. */
const PORTALS: Record<string, { outDir: string; sdk: string | null }> = {
  // Basic Launch: no SDK needed (and no ads).
  crazygames: { outDir: 'dist-crazygames', sdk: null },
};

/**
 * A portal build: adds the portal's SDK (if any), and drops what a portal
 * doesn't want: the installable-app manifest and service worker, and (with
 * VITE_PORTAL_SPLASH=1) the SugiGames splash.
 */
function portal(outDir: string, sdk: string | null): Plugin {
  return {
    name: 'ssk-portal',
    transformIndexHtml(html) {
      let out = html
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
        .replace(
          /\s*<meta name="(mobile-web-app-capable|apple-mobile-web-app-[a-z-]+)"[^>]*>/g,
          '',
        );
      if (sdk) out = out.replace('</head>', `  <script src="${sdk}"></script>\n  </head>`);
      if (process.env.VITE_PORTAL_SPLASH !== '1')
        out = out.replace(
          /\s*<div id="splash"[\s\S]*?<\/svg>\s*<div id="splash-word">[\s\S]*?<\/div>\s*<\/div>/,
          '',
        );
      return out;
    },
    closeBundle() {
      for (const f of ['sw.js', 'manifest.webmanifest', 'icons'])
        rmSync(join(outDir, f), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: PORTALS[mode] ? [portal(PORTALS[mode].outDir, PORTALS[mode].sdk)] : [],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    ...(PORTALS[mode] ? { outDir: PORTALS[mode].outDir } : {}),
  },
}));
