/** Browser tests for the CrazyGames Full Launch build (dist-crazygames-full), with a stand-in SDK. */
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const localChromium = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(localChromium) ? { executablePath: localChromium } : {};

export default defineConfig({
  testDir: 'tests/e2e-crazygames-full',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4177', trace: 'retain-on-failure', launchOptions },
  projects: [
    { name: 'crazygames-full-phone', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
  webServer: {
    command:
      'npx vite build --mode crazygames-full && npx vite preview --outDir dist-crazygames-full --port 4177 --strictPort',
    url: 'http://localhost:4177',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
