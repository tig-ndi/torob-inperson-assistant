import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, '.local', 'pw-browsers');
const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20000,
  use: { baseURL: 'http://127.0.0.1:15173', viewport: { width: 390, height: 844 }, headless: true },
  webServer: [
    { command: `"${python}" -m uvicorn apps.api.main:app --host 127.0.0.1 --port 18000 --no-access-log`,
      cwd: root, env: { TOROB_ASSISTANT_ENABLED: '0' }, url: 'http://127.0.0.1:18000/openapi.json', reuseExistingServer: false },
    { command: 'npm run dev -- --port 15173', url: 'http://127.0.0.1:15173',
      env: { TOROB_API_PORT: '18000' }, reuseExistingServer: false },
  ],
});
