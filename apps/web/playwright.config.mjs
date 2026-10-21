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
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, headless: true },
  webServer: [
    { command: `"${python}" -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --no-access-log`,
      cwd: root, url: 'http://127.0.0.1:8000/openapi.json', reuseExistingServer: false },
    { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
  ],
});
