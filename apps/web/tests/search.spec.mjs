import { test, expect } from '@playwright/test';
import path from 'node:path';

// Explicit synthetic API fixtures for states not guaranteed in the real catalogue.
const fixture = (title = 'محصول آزمایشی') => ({
  items: [{ product_id: 'synthetic_product', persian_title: title, brand_name: null, category_name: null,
    offer_summary: { offer_count: 2, min_price_toman: '733518940747298944', max_price_toman: '733518940747298944', missing_price_count: 1 } }],
  has_more: false, provenance: { currency: 'toman', inventory_status: 'unconfirmed' },
});
async function search(page, query) {
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill(query);
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
}

test('real UI → Vite proxy → API → dataset; RTL, pages and responsive widths', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  await search(page, 'گوشی');
  await expect(page.getByRole('article')).toHaveCount(12);
  await expect(page.getByText('بازهٔ کل قیمت‌های ثبت‌شده', { exact: true }).first()).toBeVisible();
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: path.resolve(`../../.local/qa/search-${width}.png`), fullPage: true });
    if (width === 390) await page.screenshot({ path: path.resolve('../../.local/qa/search-mobile.png') });
  }
  await page.getByRole('button', { name: 'صفحهٔ بعد', exact: true }).click();
  await expect(page.getByText('صفحهٔ ۲', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'صفحهٔ قبل', exact: true }).click();
  await expect(page.getByText('صفحهٔ ۱', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('synthetic empty results differ from service failure and retry preserves query', async ({ page }) => {
  let attempt = 0;
  await page.route('**/api/products?**', route => {
    attempt += 1;
    return route.fulfill(attempt === 1 ? { status: 503, json: { detail: 'unavailable' } }
      : { json: { ...fixture(), items: [] } });
  });
  await page.goto('/');
  await search(page, 'نمونه');
  await expect(page.getByRole('alert')).toContainText('جست‌وجو انجام نشد');
  await expect(page.getByText('کالایی با این جست‌وجو پیدا نشد')).toHaveCount(0);
  await expect(page.getByLabel('نام کالا یا مدل', { exact: true })).toHaveValue('نمونه');
  await page.getByRole('button', { name: 'تلاش مجدد' }).click();
  await expect(page.getByText('کالایی با این جست‌وجو پیدا نشد')).toBeVisible();
});

test('synthetic missing values, exact large money and untrusted title render safely', async ({ page }) => {
  const payload = fixture('<img src=x onerror=alert(1)>');
  payload.items.push({ ...payload.items[0], product_id: 'no_price', persian_title: null,
    offer_summary: { offer_count: 1, missing_price_count: 1, min_price_toman: null, max_price_toman: null } });
  await page.route('**/api/products?**', route => route.fulfill({ json: payload }));
  await page.goto('/');
  await search(page, 'نمونه');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByText(new Intl.NumberFormat('fa-IR').format(733518940747298944n), { exact: true })).toBeVisible();
  await expect(page.getByText('قیمتی ثبت نشده', { exact: true })).toBeVisible();
  await expect(page.getByText('عنوان محصول ثبت نشده', { exact: true })).toBeVisible();
  await expect(page.getByText('<img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
  await expect(page.locator('article img')).toHaveCount(0);
  await expect(page.locator('a[href^="tel:"],a[href*="wa.me"]')).toHaveCount(0);
});

test('synthetic malformed response is an error, never empty success', async ({ page }) => {
  let attempt = 0;
  await page.route('**/api/products?**', route => {
    attempt += 1;
    return route.fulfill(attempt === 1 ? { json: { items: [] } }
      : { status: 200, contentType: 'text/html', body: '<html>not JSON</html>' });
  });
  await page.goto('/');
  await search(page, 'نمونه');
  await expect(page.getByRole('alert')).toContainText('جست‌وجو انجام نشد');
  await expect(page.getByText('کالایی با این جست‌وجو پیدا نشد')).toHaveCount(0);
  await page.getByRole('button', { name: 'تلاش مجدد' }).click();
  await expect(page.getByRole('alert')).toContainText('پاسخ کاتالوگ قابل خواندن نیست');
});

test('synthetic delayed response cannot replace a newer search; loading is visible', async ({ page }) => {
  await page.route('**/api/products?**', async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    if (query === 'قدیمی') await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ json: fixture(query === 'قدیمی' ? 'نتیجهٔ قدیمی' : 'نتیجهٔ جدید') });
  });
  await page.goto('/');
  await search(page, 'قدیمی');
  await expect(page.getByRole('region', { name: 'نتایج برای «قدیمی»' }).getByRole('status')).toContainText('در حال جست‌وجوی کاتالوگ');
  await search(page, 'جدید');
  await expect(page.getByRole('article')).toContainText('نتیجهٔ جدید');
  await page.waitForTimeout(600); // Deliberately wait past the obsolete response.
  await expect(page.getByRole('article')).toContainText('نتیجهٔ جدید');
  await expect(page.getByText('نتیجهٔ قدیمی', { exact: true })).toHaveCount(0);
});

test('category filter is auto-detected, preserved across pagination and budget, and can be manually cleared', async ({ page }) => {
  await page.route('**/api/assistant/status', route => route.fulfill({ json: {
    ready: true, reason: 'ready', remaining_calls: 3, attempt_limit: 3, model: 'synthetic' } }));
  await page.route('**/api/assistant/turn', route => route.fulfill({ status: 503, json: { code: 'provider_failed' } }));
  await page.goto('/');
  await search(page, 'گوشی');
  const catBadge = page.locator('.active-category-badge').getByText('دسته: گوشی موبایل');
  await expect(catBadge).toBeVisible();

  // Assistant context notice also reflects category
  await expect(page.locator('.assistant-notice')).toContainText('(دسته: گوشی موبایل)');

  // Pagination preserves category
  await page.getByRole('button', { name: 'صفحهٔ بعد', exact: true }).click();
  await expect(page.getByText('صفحهٔ ۲', { exact: true })).toBeVisible();
  await expect(catBadge).toBeVisible();

  // Budget change preserves category
  await page.getByLabel('سقف بودجه (تومان)', { exact: true }).fill('۵۰٬۰۰۰٬۰۰۰');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.getByText('سقف بودجهٔ فعال:')).toBeVisible();
  await expect(catBadge).toBeVisible();

  // Clear category filter
  await page.getByRole('button', { name: 'حذف فیلتر دسته', exact: true }).click();
  await expect(page.getByText('فیلتر دسته برداشته شد (جست‌وجو در تمام دسته‌ها)')).toBeVisible();
  await expect(catBadge).toHaveCount(0);

  // Editing only the budget must preserve explicit removal, not restart detection.
  await page.getByLabel('سقف بودجه (تومان)', { exact: true }).fill('۴۰٬۰۰۰٬۰۰۰');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.getByText('فیلتر دسته برداشته شد (جست‌وجو در تمام دسته‌ها)')).toBeVisible();
  await expect(catBadge).toHaveCount(0);

  // Pagination after clearing category stays unfiltered
  await page.getByRole('button', { name: 'صفحهٔ بعد', exact: true }).click();
  await expect(page.getByText('صفحهٔ ۲', { exact: true })).toBeVisible();
  await expect(page.getByText('فیلتر دسته برداشته شد (جست‌وجو در تمام دسته‌ها)')).toBeVisible();

  // A failed assistant turn must not erase the last catalogue query or make a
  // later direct budget edit silently reinstate the removed category.
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.locator('.assistant-panel [role="alert"]')).toBeVisible();
  await page.getByLabel('سقف بودجه (تومان)', { exact: true }).fill('۳۰٬۰۰۰٬۰۰۰');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.getByText('فیلتر دسته برداشته شد (جست‌وجو در تمام دسته‌ها)')).toBeVisible();

  // A genuinely new query should detect its own category normally.
  await search(page, 'لپ تاپ');
  await expect(page.locator('.active-category-badge')).toContainText('لپ تاپ و نوت بوک');
});
