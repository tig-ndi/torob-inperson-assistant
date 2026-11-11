import {defineConfig} from '@playwright/test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
export default defineConfig({
 testDir:'./tests/live',testMatch:'agent-judging-regressions.spec.mjs',workers:1,retries:0,timeout:30000,
 outputDir:process.env.TOROB_TEST_OUTPUT??join(tmpdir(),'torob-ci-browser-results'),
 use:{baseURL:'http://127.0.0.1:18121',headless:true,reducedMotion:'reduce',
  launchOptions:process.env.DESIGN_CHROMIUM_PATH?{executablePath:process.env.DESIGN_CHROMIUM_PATH}:{}},
 webServer:{command:`"${process.env.TOROB_TEST_PYTHON??'python'}" apps/web/tests/live/serve_ci_fixture.py`,cwd:root,
  url:'http://127.0.0.1:18121/api/health/live',reuseExistingServer:false},
});
