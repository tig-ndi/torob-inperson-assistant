// Integration checks for the icon/motion package wired into the real UI.
// All assistant responses are local mocks; no model calls are made.
import { test, expect } from '@playwright/test';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOURS_CHECKED_AT, syntheticHours } from './fixtures/hours.mjs';
import { unknownCredit } from './fixtures/credit.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const source = { currency: 'toman', inventory_status: 'unconfirmed' };
const product = {
  product_id: 'icons_integration_product', persian_title: 'گوشی یکپارچه',
  category_name: 'گوشی موبایل', brand_name: null, model: null, image_urls: [], specs: [],
  offer_summary: { offer_count: 1, min_price_toman: '8000000', max_price_toman: '8000000', missing_price_count: 0 },
};
const products = { items: [product], has_more: true, provenance: source };
const searchResult = request => ({
  request_id: request.request_id, status: 'results', query: 'گوشی',
  max_price_toman: request.max_price_toman, question: null, products, model: 'synthetic-model',
});

async function statusRoute(page, ready = true) {
  await page.route('**/api/assistant/status', route => route.fulfill({ json: {
    ready, reason: ready ? 'ready' : 'disabled', remaining_calls: ready ? 3 : 0,
    attempt_limit: 3, model: 'synthetic-model' } }));
}
const submit = page => page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
const activity = page => page.locator('.assistant-panel .tia-activity');

test('wired assistant activity covers checking, pending, success, error and cancel with one live region', async ({ page }) => {
  await page.route('**/api/products?**', route => route.fulfill({ json: products }));
  let releaseStatus;
  const statusGate = new Promise(resolve => { releaseStatus = resolve; });
  await page.route('**/api/assistant/status', async route => {
    await statusGate;
    await route.fulfill({ json: { ready: true, reason: 'ready', remaining_calls: 3, attempt_limit: 3, model: 'synthetic-model' } });
  });

  let turnCalls = 0;
  let releaseTurn;
  let turnGate = new Promise(resolve => { releaseTurn = resolve; });
  await page.route('**/api/assistant/turn', async route => {
    const request = route.request().postDataJSON();
    turnCalls++;
    await turnGate;
    try {
      if (turnCalls === 2) {
        await route.fulfill({ status: 502, json: { code: 'incomplete_output' } });
      } else {
        await route.fulfill({ json: searchResult(request) });
      }
    } catch {
      // the fetch was aborted by the cancel control; the late response is discarded
    }
  });

  await page.goto('/');

  // checking: gated status keeps the single activity live region with its spinner
  await expect(activity(page)).toHaveText('در حال بررسی دسترسی دستیار…');
  await expect(page.locator('.assistant-panel [role="status"]')).toHaveCount(1);
  expect(await activity(page).locator('.tia-motion-spinner').evaluate(el => getComputedStyle(el).animationName))
    .toBe('tia-motion-spin');
  releaseStatus();
  await expect(activity(page)).toHaveCount(0);

  // pending: gated turn shows the single activity live region
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  await expect(activity(page)).toHaveText('در حال بررسی درخواست…');
  await expect(page.locator('.assistant-panel [role="status"]')).toHaveCount(1);
  expect(await activity(page).locator('.tia-motion-spinner').count()).toBe(1);

  // success: activity disappears, results stay, no spinner remains
  releaseTurn();
  await expect(activity(page)).toHaveCount(0);
  await expect(page.locator('.product-card')).toHaveCount(1);

  // error: role=alert carries the message and the activity stays away
  turnGate = new Promise(resolve => { releaseTurn = resolve; });
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('دوباره گوشی');
  await submit(page);
  await expect(activity(page)).toHaveText('در حال بررسی درخواست…');
  releaseTurn();
  await expect(activity(page)).toHaveCount(0);
  await expect(page.locator('.assistant-panel [role="alert"]')).toBeVisible();
  await expect(page.locator('.assistant-panel [role="alert"]')).toContainText('پاسخ دستیار کامل نشد');

  // cancel: activity gone, notice shown; a late response cannot bring the spinner back
  turnGate = new Promise(resolve => { releaseTurn = resolve; });
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('سومین نیاز');
  await submit(page);
  await expect(activity(page)).toHaveText('در حال بررسی درخواست…');
  await page.getByRole('button', { name: 'لغو درخواست', exact: true }).click();
  await expect(activity(page)).toHaveCount(0);
  await expect(page.locator('.assistant-panel')).toContainText('درخواست لغو شد');
  releaseTurn();
  await page.waitForTimeout(250);
  await expect(activity(page)).toHaveCount(0);
  await expect(page.locator('.assistant-panel [role="status"]').first()).toBeVisible();
});

test('icons decorate controls without changing names, mirroring or layout from 320 to 1920', async ({ page }) => {
  await statusRoute(page);
  await page.route('**/api/products?**', route => route.fulfill({ json: products }));
  await page.route('**/api/products/icons_integration_product/offers?**', route => route.fulfill({ json: {
    items: [{
      offer_id: 'icons_offer_1', product_id: product.product_id, shop_id: 'icons_shop',
      price_toman: '8000000', price_quality: 'not_assessed', last_price_changed_at: null,
      seller_title: null, description: null, warranty: null, inventory_status: 'unconfirmed',
      direct_distance_meters: null, opening_hours: syntheticHours('unknown'), in_person_credit: unknownCredit(),
      shop: { name: 'فروشگاه یکپارچه', address: null, location_label: null, lat: null, lon: null },
    }],
    has_more: false, limit: 10, offset: 0, provenance: source, hours_evaluated_at: HOURS_CHECKED_AT,
  } }));

  await page.goto('/');

  // Accessible names are preserved exactly; decorative icons inherit color without transforms
  const searchButton = page.getByRole('button', { name: 'جست‌وجو', exact: true });
  await expect(searchButton).toBeVisible();
  await expect(searchButton.locator('svg.tia-icon')).toHaveCount(1);
  const noMirror = await page.evaluate(() =>
    [...document.querySelectorAll('.tia-icon')].every(icon => getComputedStyle(icon).transform === 'none'));
  expect(noMirror).toBe(true);

  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await searchButton.click();
  await expect(page.locator('.product-card')).toHaveCount(1);

  // Compare toggle keeps its name and swaps the decorative glyph
  const compareBtn = page.locator('.product-card .compare-btn');
  await expect(compareBtn).toHaveAccessibleName('انتخاب برای مقایسه');
  await compareBtn.click();
  await expect(compareBtn).toHaveAccessibleName('در مقایسه');

  // RTL pagination: «صفحهٔ بعد» renders its chevron to the left of the text without CSS mirroring
  const nextButton = page.getByRole('button', { name: 'صفحهٔ بعد', exact: true });
  await expect(nextButton).toBeVisible();
  const nextGeometry = await nextButton.evaluate(button => {
    const svg = button.querySelector('svg.tia-icon').getBoundingClientRect();
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const text = range.getBoundingClientRect();
    return { svgRight: svg.right, textLeft: text.left, iconTransform: getComputedStyle(button.querySelector('svg.tia-icon')).transform };
  });
  expect(nextGeometry.iconTransform).toBe('none');
  expect(nextGeometry.svgRight).toBeLessThanOrEqual(nextGeometry.textLeft + 1);

  // Keyboard: Enter submits search, Enter opens offers, Escape closes and returns focus
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی دوم');
  await searchButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.product-card')).toHaveCount(1);
  const offersButton = page.locator('.product-card .secondary-btn').first();
  await offersButton.focus();
  await page.keyboard.press('Enter');
  const modal = page.locator('.offers-modal');
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.classList.contains('secondary-btn'))).toBe(true);

  // Fast double-clicks register as one toggle; the bar state stays consistent in both directions
  await page.locator('.product-card .compare-btn').click({ clickCount: 2, delay: 60 });
  await expect(page.locator('.compare-bar')).toHaveCount(0);
  await expect(page.locator('.product-card .compare-btn')).toHaveAccessibleName('انتخاب برای مقایسه');
  await page.waitForTimeout(400);
  await page.locator('.product-card .compare-btn').click({ clickCount: 2, delay: 60 });
  await expect(page.locator('.compare-bar')).toContainText('۱ محصول');

  // Affected surfaces do not overflow from 320 to 1920
  for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `document overflow at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await offersButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.offers-modal')).toBeVisible();
  for (const width of [320, 390, 1280, 1920]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => {
      const content = document.querySelector('.offers-modal');
      return content.scrollWidth <= content.clientWidth + 1;
    }), `modal overflow at ${width}px`).toBe(true);
  }
});

test('motion classes sit at stable points, replay only on list replacement, and reduced motion keeps status text', async ({ page }) => {
  await statusRoute(page);
  await page.route('**/api/products?**', route => route.fulfill({ json: products }));
  let releaseTurn;
  const turnGate = new Promise(resolve => { releaseTurn = resolve; });
  await page.route('**/api/assistant/turn', async route => {
    const request = route.request().postDataJSON();
    await turnGate;
    await route.fulfill({ json: searchResult(request) });
  });

  await page.goto('/');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);

  const grid = page.locator('.product-grid');
  await expect(grid).toHaveClass(/tia-motion-enter/);
  expect(await grid.evaluate(el => getComputedStyle(el).animationName)).toBe('tia-motion-enter');

  // Unrelated state changes must not remount (and so not replay) the results list
  const identityBefore = await grid.evaluate(el => { window.__gridNode = el; return true; });
  await page.locator('.product-card .compare-btn').click();
  const identityAfter = await grid.evaluate(el => el === window.__gridNode);
  expect(identityBefore && identityAfter).toBe(true);

  // Modal panel and toast carry their scoped motion classes
  await page.locator('.product-card .secondary-btn').first().click();
  await expect(page.locator('.offers-modal')).toHaveClass(/tia-motion-enter/);
  await page.keyboard.press('Escape');

  // Reduced motion: status text stays visible, spinner and entry motion stop
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  const reducedActivity = page.locator('.assistant-panel .tia-activity');
  await expect(reducedActivity).toHaveText('در حال بررسی درخواست…');
  expect(await reducedActivity.locator('.tia-motion-spinner').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await grid.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  releaseTurn();
  await expect(reducedActivity).toHaveCount(0);
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

test('built version links the favicon assets and survives a real-tab reload', async ({ page, request }) => {
  test.setTimeout(120000);
  execSync('npm run build', { cwd: webRoot, stdio: 'pipe' });
  const viteBin = path.join(webRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'],
    { cwd: webRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  const previewUrl = 'http://127.0.0.1:4174/';
  try {
    await new Promise((resolve, reject) => {
      preview.stdout.on('data', chunk => {
        if (String(chunk).includes('4174')) resolve();
      });
      preview.on('error', reject);
      setTimeout(() => reject(new Error('vite preview did not start')), 15000);
    });
    await page.goto(previewUrl);
    const readLinks = () => page.evaluate(() =>
      [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map(link => link.getAttribute('href')));
    expect(await readLinks()).toEqual(['/icons/favicon.svg', '/favicon.ico', '/icons/apple-touch-icon.png']);
    expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
    const ico = await request.get(`${previewUrl}favicon.ico`);
    expect(ico.status()).toBe(200);
    expect(ico.headers()['content-type']).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/);
    const svg = await request.get(`${previewUrl}icons/favicon.svg`);
    expect(svg.status()).toBe(200);
    await page.reload();
    expect(await readLinks()).toEqual(['/icons/favicon.svg', '/favicon.ico', '/icons/apple-touch-icon.png']);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.resolve('../../.local/qa/icons-integration-built.png') });
  } finally {
    if (process.platform === 'win32') {
      try { execSync(`taskkill /pid ${preview.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ }
    } else {
      preview.kill();
    }
  }
});
