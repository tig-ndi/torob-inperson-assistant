import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

if (process.env.TOROB_ALLOW_LIVE !== '1') throw new Error('Live model tests require TOROB_ALLOW_LIVE=1; assistant.spec spends one request, context.spec up to three. Select one file explicitly.');

export default defineConfig({
  ...base,
  testDir: './live',
  retries: 0,
  timeout: 45000,
  webServer: base.webServer.map((server, index) => index === 0
    ? { ...server, env: { ...server.env, TOROB_ASSISTANT_ENABLED: '1' } }
    : server),
});
