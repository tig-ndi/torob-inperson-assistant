// Explicit opt-in only. ONE billable call, no retries, never part of test:e2e.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

test('real BoxAPI through browser, API and source-backed catalogue at ten million toman', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('نیاز و کاربرد موردنظر', { exact: true }).fill('یک گوشی برای استفاده روزمره می‌خواهم، حداکثر ده میلیون تومان.');
  await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeEnabled();
  const resultPromise = page.waitForResponse(response => response.url().includes('/api/assistant/turn') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  const response = await resultPromise;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.status).toBe('results');
  expect(result.query).toContain('گوشی');
  expect(result.max_price_toman).toBe('10000000');
  expect(result.products.items.length).toBeGreaterThan(0);
  await expect(page.locator('.product-card')).toHaveCount(result.products.items.length);
  await expect(page.locator('.active-filter-badge')).toContainText('۱۰٬۰۰۰٬۰۰۰');
  for (const item of result.products.items) {
    const sourceResponse = await page.request.get(`/api/products/${encodeURIComponent(item.product_id)}`);
    expect(sourceResponse.ok()).toBe(true);
    expect((await sourceResponse.json()).product.persian_title).toBe(item.persian_title);
  }
  await page.screenshot({ path: path.resolve('../../.local/qa/assistant-live-mobile.png') });
  expect(errors).toEqual([]);
  await writeFile(path.resolve('../../.local/qa/assistant-live-browser.json'), JSON.stringify({
    evidence: 'real Chromium -> fresh Vite -> fresh API -> BoxAPI gpt-5-mini -> local dataset',
    request_id: result.request_id, model: result.model, status: result.status,
    query: result.query, max_price_toman: result.max_price_toman,
    source_products_checked: result.products.items.length, passed: true,
  }, null, 2));
});
