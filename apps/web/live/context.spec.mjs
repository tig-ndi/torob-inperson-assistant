// Explicit opt-in only: up to THREE billable requests, no retries.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

test('real results continue with changed budget then a different product', async ({ page }) => {
  test.setTimeout(120000);
  const evidence = { evidence: 'real Chromium -> fresh Vite/API -> BoxAPI -> source dataset', turns: [], passed: false };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Expectations are fixed before observing model output; there is no automatic repair/retry.
  const cases = [
    { text: 'گوشی می‌خواهم برای کارهای معمولی؛ سقف بودجه من دوازده میلیون تومان است.', query: 'گوشی', budget: '12000000', context: null, category: 'گوشی موبایل' },
    { text: 'بودجه را هشت میلیون کن', query: 'گوشی', budget: '8000000', context: 'گوشی', category: 'گوشی موبایل' },
    { text: 'حالا کفش کتانی می‌خواهم', query: 'کفش', budget: '8000000', context: 'گوشی', category: null },
  ];
  try {
    await page.goto('/');
    for (const scenario of cases) {
      await page.getByLabel('نیاز و کاربرد موردنظر', { exact: true }).fill(scenario.text);
      await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeEnabled();
      const pending = page.waitForResponse(response => response.url().includes('/api/assistant/turn') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
      const response = await pending;
      const request = response.request().postDataJSON();
      const result = await response.json();
      evidence.turns.push({ request_id: request.request_id, status: result.status, query: result.query,
        category_name: result.category_name, max_price_toman: result.max_price_toman, model: result.model, source_products_checked: 0, passed: false });
      const turn = evidence.turns.at(-1);
      expect(response.status()).toBe(200);
      expect(request.context_query).toBe(scenario.context);
      expect(result.status).toBe('results');
      expect(result.query).toContain(scenario.query);
      expect(result.max_price_toman).toBe(scenario.budget);
      expect(result.category_name).toBe(scenario.category);
      expect(result.products.items.length).toBeGreaterThan(0);
      expect(result.model).toBe('gpt-5-mini');
      await expect(page.locator('.product-card')).toHaveCount(result.products.items.length);
      await expect(page.locator('.assistant-notice')).toContainText(`موضوع فعلی: «${result.query}»`);
      for (const item of result.products.items) {
        if (scenario.category) expect(item.category_name).toBe(scenario.category);
        else expect(item.category_name).not.toBe('گوشی موبایل');
        const sourceResponse = await page.request.get(`/api/products/${encodeURIComponent(item.product_id)}`);
        expect(sourceResponse.ok()).toBe(true);
        expect((await sourceResponse.json()).product.persian_title).toBe(item.persian_title);
        const offersResponse = await page.request.get(`/api/products/${encodeURIComponent(item.product_id)}/offers?max_price_toman=${scenario.budget}`);
        expect(offersResponse.ok()).toBe(true);
        const offers = (await offersResponse.json()).items;
        expect(offers.length).toBeGreaterThan(0);
        for (const offer of offers) {
          expect(offer.price_toman).not.toBeNull();
          expect(BigInt(offer.price_toman) <= BigInt(scenario.budget)).toBe(true);
        }
        turn.source_products_checked++;
      }
      turn.passed = true;
    }
    for (const width of [360, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.assistant-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve('../../.local/qa/assistant-context-live-mobile.png') });
    expect(errors).toEqual([]);
    evidence.passed = true;
  } finally {
    await writeFile(path.resolve('../../.local/qa/assistant-context-live-browser.json'), JSON.stringify(evidence, null, 2));
  }
});
