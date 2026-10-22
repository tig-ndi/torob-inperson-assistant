import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

if (process.env.TOROB_ALLOW_LIVE !== '1') throw new Error('Live tests require TOROB_ALLOW_LIVE=1; assistant.spec uses one call, context.spec up to three, category.spec/evidence.spec up to two each. Select files explicitly.');

export default defineConfig({
  ...base,
  testDir: './live',
  retries: 0,
  timeout: 45000,
  webServer: base.webServer.map((server, index) => index === 0
    ? { ...server, env: { ...server.env, TOROB_ASSISTANT_ENABLED: '1' } }
    : server),
});
