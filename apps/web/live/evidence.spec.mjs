// Explicit opt-in: at most TWO real calls. Source checks use local API only.
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

test('real shopping needs show camera and battery source evidence without quality claims', async ({ page }) => {
  test.setTimeout(90000);
  const evidence = { evidence: 'real Chromium -> isolated API -> gpt-5-mini -> source specs in UI', turns: [], passed: false };
  const cases = [
    { text: 'گوشی برای عکاسی می‌خواهم؛ بودجه بیست میلیون تومان.', focus: 'دوربین', budget: '20000000' },
    { text: 'گوشی با باتری قوی می‌خواهم؛ سقف بودجه پانزده میلیون تومان.', focus: 'باتری', budget: '15000000' },
  ];
  try {
    await page.goto('/');
    for (const scenario of cases) {
      await page.getByLabel('نیاز و کاربرد موردنظر').fill(scenario.text);
      const pending = page.waitForResponse(r => r.url().includes('/api/assistant/turn') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
      const response = await pending;
      const result = await response.json();
      const record = { request_id: response.request().postDataJSON().request_id, status: result.status,
        query: result.query, category_name: result.category_name, focus: scenario.focus, source_entries_checked: 0, passed: false };
      evidence.turns.push(record);
      expect(response.status()).toBe(200);
      expect(result.status).toBe('results');
      expect(result.model).toBe('gpt-5-mini');
      expect(result.category_name).toBe('گوشی موبایل');
      expect(result.max_price_toman).toBe(scenario.budget);
      expect(result.products.items.length).toBeGreaterThan(0);
      await expect(page.getByRole('button', { name: `بررسی ${scenario.focus}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
      for (const product of result.products.items) {
        const sourceResponse = await page.request.get(`/api/products/${encodeURIComponent(product.product_id)}`);
        expect(sourceResponse.ok()).toBe(true);
        const source = (await sourceResponse.json()).product;
        const entries = page.locator(`[data-product-id="${product.product_id}"] .spec-evidence-entry`);
        for (let i = 0; i < await entries.count(); i++) {
          const entry = entries.nth(i);
          const index = Number(await entry.getAttribute('data-spec-index'));
          expect(source.specs[index]).toBeDefined();
          await expect(entry.locator('.evidence-source-value')).toHaveText(source.specs[index].value ?? 'مقدار ثبت نشده');
          await expect(entry.locator('dt')).toHaveText(source.specs[index].key?.trim() || 'ویژگی بدون عنوان');
          record.source_entries_checked++;
        }
      }
      expect(record.source_entries_checked).toBeGreaterThan(0);
      await page.locator('.product-card').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.resolve(`../../.local/qa/spec-evidence-live-${scenario.focus === 'دوربین' ? 'camera' : 'battery'}.png`) });
      record.passed = true;
    }
    evidence.passed = true;
  } finally {
    await writeFile(path.resolve('../../.local/qa/spec-evidence-live.json'), JSON.stringify(evidence, null, 2));
  }
});
