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

/** Poki's SDK: their page serves it, and it must load before the game. */
const POKI_SDK = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

/**
 * The Poki build (`vite build --mode poki`): adds the SDK, and drops what a
 * portal doesn't want: the installable-app manifest and service worker, and
 * (unless VITE_POKI_SPLASH=1) the SugiGames splash.
 */
function poki(outDir: string): Plugin {
  return {
    name: 'ssk-poki',
    transformIndexHtml(html) {
      let out = html
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
        .replace(/\s*<meta name="(mobile-web-app-capable|apple-mobile-web-app-[a-z-]+)"[^>]*>/g, '')
        .replace('</head>', `  <script src="${POKI_SDK}"></script>\n  </head>`);
      if (process.env.VITE_POKI_SPLASH !== '1')
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
  plugins: mode === 'poki' ? [poki('dist-poki')] : [],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    ...(mode === 'poki' ? { outDir: 'dist-poki' } : {}),
  },
}));
