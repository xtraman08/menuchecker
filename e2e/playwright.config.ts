import { defineConfig, devices } from '@playwright/test';
import { env } from './support/env.ts';

// The stack (db + api + web) is started by scripts/e2e.mjs via docker compose;
// this config deliberately has no webServer block.
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: env.webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid',
  },
  projects: [
    {
      name: 'api',
      testDir: './specs/api',
      use: { baseURL: env.apiUrl },
    },
    {
      name: 'ui',
      testDir: './specs/ui',
      use: { ...devices['Pixel 7'], browserName: 'chromium', baseURL: env.webUrl },
    },
  ],
});
