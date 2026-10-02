import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Use the pre-installed Chromium when present (CI images may ship their own).
const localChromium = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(localChromium) ? { executablePath: localChromium } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'phone-portrait', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    {
      name: 'phone-small',
      use: { ...devices['iPhone SE'], browserName: 'chromium', defaultBrowserType: 'chromium' },
    },
    {
      name: 'phone-landscape',
      use: { ...devices['Pixel 7 landscape'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
