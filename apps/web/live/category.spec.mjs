// Explicit opt-in only: at most TWO billable calls; no automatic retry.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

test('real explicit accessory and medical context stay distinct', async ({ page }) => {
  test.setTimeout(90000);
  const evidence = { evidence: 'real Chromium -> isolated API -> gpt-5-mini -> source dataset', turns: [], passed: false };
  async function turn(text, status, category) {
    await page.getByLabel('نیاز و کاربرد موردنظر').fill(text);
    const pending = page.waitForResponse(r => r.url().includes('/api/assistant/turn') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
    const response = await pending;
    const request = response.request().postDataJSON();
    const result = await response.json();
    const record = { request_id: request.request_id, status: result.status, query: result.query,
      category_name: result.category_name, max_price_toman: result.max_price_toman, source_products_checked: 0, passed: false };
    evidence.turns.push(record);
    expect(response.status()).toBe(200);
    expect(result.model).toBe('gpt-5-mini');
    expect(result.status).toBe(status);
    expect(result.category_name).toBe(category);
    expect(result.max_price_toman).toBe('2000000');
    if (status === 'needs_input') {
      expect(result.products).toBeNull();
      expect(result.query).toBeNull();
    } else {
      expect(result.products.items.length).toBeGreaterThan(0);
      await expect(page.locator('.product-card')).toHaveCount(result.products.items.length);
      for (const item of result.products.items) {
        expect(item.category_name).toBe(category);
        const source = await page.request.get(`/api/products/${encodeURIComponent(item.product_id)}`);
        expect(source.ok()).toBe(true);
        expect((await source.json()).product.persian_title).toBe(item.persian_title);
        const offers = await page.request.get(`/api/products/${encodeURIComponent(item.product_id)}/offers?max_price_toman=2000000`);
        expect(offers.ok()).toBe(true);
        const items = (await offers.json()).items;
        expect(items.length).toBeGreaterThan(0);
        for (const offer of items) expect(offer.price_toman !== null && BigInt(offer.price_toman) <= 2000000n).toBe(true);
        record.source_products_checked++;
      }
    }
    record.passed = true;
  }
  // Fixed expectations, no repair calls: explicit target searches, unrelated medical topic asks.
  try {
    await page.goto('/');
    await turn('شارژر گوشی می‌خواهم؛ بودجه‌ام دو میلیون تومان است.', 'results', 'شارژر گوشی');
    await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی پزشکی');
    const pending = page.waitForResponse(r => r.url().includes('/api/products?'));
    await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
    expect((await pending).status()).toBe(200);
    await expect(page.locator('.assistant-notice')).toContainText('موضوع فعلی: «گوشی پزشکی»');
    await turn('شارژر می‌خواهم', 'needs_input', null);
    await page.screenshot({ path: path.resolve('../../.local/qa/assistant-category-live-mobile.png') });
    evidence.passed = true;
  } finally {
    await writeFile(path.resolve('../../.local/qa/assistant-category-live-browser.json'), JSON.stringify(evidence, null, 2));
  }
});
