/** Browser tests for the CrazyGames build (dist-crazygames). */
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const localChromium = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(localChromium) ? { executablePath: localChromium } : {};

export default defineConfig({
  testDir: 'tests/e2e-crazygames',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4175', trace: 'retain-on-failure', launchOptions },
  projects: [
    { name: 'crazygames-phone', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'crazygames-desktop', use: { viewport: { width: 1280, height: 720 } } },
  ],
  webServer: {
    command:
      'npx vite build --mode crazygames && npx vite preview --outDir dist-crazygames --port 4175 --strictPort',
    url: 'http://localhost:4175',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
