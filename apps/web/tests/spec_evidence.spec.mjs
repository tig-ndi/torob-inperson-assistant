// Fake assistant routes below never contact a provider. The last test reads the real local dataset.
import { test, expect } from '@playwright/test';
import path from 'node:path';

const spec = (key, value, section = 'مشخصات کلی') => ({ key, value, section });
const product = (id, specs, category = 'گوشی موبایل') => ({ product_id: id, persian_title: id,
  category_name: category, brand_name: null, model: null, image_urls: [], specs,
  offer_summary: { offer_count: 1, min_price_toman: '8000000', max_price_toman: '8000000', missing_price_count: 0 } });
const fixtures = [
  product('شواهد کامل', [spec('رزولوشن', '1179×2556 پیکسل'), spec('دوربین اصلی', '۵۰ مگاپیکسل'),
    spec('ظرفیت باتری', '۵٬۰۰۰ میلی‌آمپر ساعت'), spec('دوربین سلفی', '۱۲ مگاپیکسل'),
    spec('نوع باتری', '<img src=x onerror=alert(1)>'), spec('مشخصات دوربین اصلی', 'شرح منبع '.repeat(40))]),
  product('بدون دوربین', [spec('دوربین', 'بدون دوربین'), spec('دوربین اصلی', 'title')]),
  product('اطلاعات نامشخص', []),
  product('گوشی پزشکی', [spec('دوربین', 'دارد')], 'گوشی پزشکی'),
];
const pageBody = items => ({ items, has_more: false, category_name: null,
  provenance: { currency: 'toman', inventory_status: 'unconfirmed' } });
const search = async page => {
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
};

test('source evidence distinguishes negative, missing and irrelevant fields without claiming quality', async ({ page }) => {
  await page.route('**/api/products?**', route => route.fulfill({ json: pageBody(fixtures) }));
  await page.goto('/');
  await search(page);
  await page.getByRole('button', { name: 'بررسی دوربین', exact: true }).click();
  const complete = page.locator('[data-product-id="شواهد کامل"] .spec-evidence');
  await expect(complete).toContainText('۵۰ مگاپیکسل');
  await expect(complete).not.toContainText('1179×2556');
  await expect(complete).toContainText('بخش منبع: مشخصات کلی');
  await expect(page.locator('[data-product-id="بدون دوربین"] .spec-evidence')).toContainText('نبود این ویژگی در منبع ذکر شده:');
  await expect(page.locator('[data-product-id="بدون دوربین"] .spec-evidence')).toContainText('مقدار قابل اتکا ثبت نشده');
  await expect(page.locator('[data-product-id="اطلاعات نامشخص"] .spec-evidence')).toContainText('این به معنی نبود قابلیت نیست');
  await expect(page.locator('[data-product-id="گوشی پزشکی"] .spec-evidence')).toHaveCount(0);
  await page.getByRole('button', { name: 'بررسی هر دو', exact: true }).click();
  expect(await complete.locator(':scope > dl > .spec-evidence-entry').count()).toBeLessThanOrEqual(3);
  await expect(complete).toContainText('۵٬۰۰۰ میلی‌آمپر ساعت');
  await complete.locator('.more-evidence > summary').click();
  await expect(complete).toContainText('<img src=x onerror=alert(1)>');
  await expect(complete.locator('img')).toHaveCount(0);
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await complete.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('../../.local/qa/spec-evidence-mobile.png') });
});

test('need focus survives clarification and budget, is user editable without calls, and resets for a new topic', async ({ page }) => {
  await page.route('**/api/assistant/status', route => route.fulfill({ json: {
    ready: true, reason: 'ready', model: 'synthetic', remaining_calls: 3, attempt_limit: 3 } }));
  const data = pageBody([fixtures[0]]);
  await page.route('**/api/products?**', route => route.fulfill({ json: data }));
  let calls = 0;
  await page.route('**/api/assistant/turn', route => {
    const request = route.request().postDataJSON();
    calls++;
    return route.fulfill({ json: { request_id: request.request_id, model: 'synthetic',
      status: calls === 1 ? 'needs_input' : 'results', query: calls === 3 ? 'کفش' : 'گوشی',
      category_name: calls === 3 ? null : 'گوشی موبایل', max_price_toman: '10000000',
      question: calls === 1 ? 'سقف بودجه‌تان چند تومان است؟' : null,
      products: calls === 1 ? null : calls === 3 ? pageBody([product('کفش', [], 'کفش ورزشی')]) : data } });
  });
  await page.goto('/');
  const need = page.getByLabel('نیاز و کاربرد موردنظر');
  await need.fill('گوشی برای عکاسی می‌خواهم');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(need).toHaveValue('');
  await need.fill('بودجه ده میلیون تومان');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.getByRole('button', { name: 'بررسی دوربین', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('سقف بودجه (تومان)', { exact: true }).fill('12000000');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.getByRole('button', { name: 'بررسی دوربین', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'بررسی باتری', exact: true }).click();
  await expect(page.locator('.spec-evidence')).toContainText('۵٬۰۰۰ میلی‌آمپر ساعت');
  expect(calls).toBe(2);
  await need.fill('حالا کفش می‌خواهم');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.locator('.product-card')).toContainText('کفش');
  await expect(page.locator('.spec-evidence')).toHaveCount(0);
  await search(page);
  await page.getByRole('button', { name: 'بررسی باتری', exact: true }).click();
  await page.getByRole('button', { name: 'گفت‌وگوی تازه', exact: true }).click();
  await expect(page.getByRole('button', { name: 'بررسی باتری', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('real dataset evidence points to exact original product specs', async ({ page }) => {
  await page.goto('/');
  const pending = page.waitForResponse(r => r.url().includes('/api/products?'));
  await search(page);
  const data = await (await pending).json();
  await page.getByRole('button', { name: 'بررسی هر دو', exact: true }).click();
  let checked = 0;
  for (const product of data.items) {
    const card = page.locator(`[data-product-id="${product.product_id}"]`);
    const entries = card.locator('.spec-evidence-entry');
    for (let i = 0; i < await entries.count(); i++) {
      const entry = entries.nth(i);
      const index = Number(await entry.getAttribute('data-spec-index'));
      const source = product.specs[index];
      expect(source).toBeDefined();
      await expect(entry.locator('.evidence-source-value')).toHaveText(source.value ?? 'مقدار ثبت نشده');
      await expect(entry.locator('dt')).toHaveText(source.key?.trim() || 'ویژگی بدون عنوان');
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
  await page.locator('.product-card').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('../../.local/qa/spec-evidence-real-mobile.png') });
});
