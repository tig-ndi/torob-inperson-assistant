import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/prototype',
  outputDir: '../../.local/design-qa/test-results',
  timeout: 45000,
  workers: 2,
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    reducedMotion: 'reduce',
    launchOptions: process.env.DESIGN_CHROMIUM_PATH ? { executablePath: process.env.DESIGN_CHROMIUM_PATH } : {},
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});
