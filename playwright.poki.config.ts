/** Browser tests for the Poki build (dist-poki), with a stand-in Poki SDK. */
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const localChromium = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(localChromium) ? { executablePath: localChromium } : {};

export default defineConfig({
  testDir: 'tests/e2e-poki',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure', launchOptions },
  projects: [{ name: 'poki-phone', use: { ...devices['Pixel 7'], browserName: 'chromium' } }],
  webServer: {
    command:
      'npx vite build --mode poki && npx vite preview --outDir dist-poki --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
