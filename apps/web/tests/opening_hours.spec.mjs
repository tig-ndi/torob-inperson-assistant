import { test, expect } from '@playwright/test';
import path from 'node:path';
import { syntheticHours } from './fixtures/hours.mjs';

const product = {
  product_id: 'hours_synthetic_product', persian_title: 'کالای آزمایشی ساعات',
  brand_name: null, model: null, category_name: null, specs: [], image_urls: [],
  offer_summary: { offer_count: 4, min_price_toman: '1000', max_price_toman: '1000', missing_price_count: 0 },
};
const source = { currency: 'toman', inventory_status: 'unconfirmed' };
function offer(id, status, shopId = id) {
  return { offer_id: id, product_id: product.product_id, shop_id: shopId, price_toman: '1000',
    price_quality: 'not_assessed', last_price_changed_at: null, seller_title: null, description: null,
    warranty: null, inventory_status: 'unconfirmed', direct_distance_meters: 0,
    opening_hours: syntheticHours(status),
    shop: { name: 'فروشگاه آزمایشی', address: null, location_label: null, lat: 35.7, lon: 51.4 } };
}
const allOffers = [offer('open_1', 'declared_open', 'same_shop'),
  offer('open_2', 'declared_open', 'same_shop'), offer('closed', 'declared_closed'), offer('unknown', 'unknown')];

async function openSynthetic(page) {
  await page.route('**/api/products?**', route => route.fulfill({ json: { items: [product], has_more: false, provenance: source } }));
  await page.goto('/');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('آزمایشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.locator('.product-card .secondary-btn').click();
  return page.getByRole('dialog', { name: 'آفرهای فروشندگان' });
}

test('synthetic hours states, combined controls, refresh, unknown exclusion and mobile layout', async ({ page }) => {
  const requests = [];
  await page.route(`**/api/products/${product.product_id}/offers?**`, route => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    const filtered = params.get('open_now_only') === 'true';
    return route.fulfill({ json: { items: filtered ? allOffers.slice(0, 2) : allOffers,
      has_more: false, limit: 10, offset: 0, provenance: source,
      hours_evaluated_at: `2026-10-21T10:${String(requests.length).padStart(2, '0')}:00+03:30` } });
  });
  const modal = await openSynthetic(page);
  await expect(modal.locator('.offer-card')).toHaveCount(4);
  await expect(modal.getByText('طبق ساعات ثبت‌شده اکنون باز', { exact: true })).toHaveCount(2);
  await expect(modal.getByText('طبق ساعات ثبت‌شده اکنون بسته', { exact: true })).toBeVisible();
  await expect(modal.getByText('وضعیت ساعت کاری نامشخص', { exact: true })).toBeVisible();
  await expect(modal.locator('.hours-checked-at')).toContainText('به وقت تهران');
  await modal.getByLabel('فقط فروشگاه‌هایی که طبق ساعات ثبت‌شده اکنون بازند').check();
  await expect(modal.locator('.offer-card')).toHaveCount(2);
  expect(requests.at(-1).get('offset')).toBe('0');
  expect(requests.at(-1).get('open_now_only')).toBe('true');
  await expect(modal.getByText('وضعیت ساعت کاری نامشخص', { exact: true })).toHaveCount(0);

  await modal.getByLabel('عرض جغرافیایی (lat)', { exact: true }).fill('35.7');
  await modal.getByLabel('طول جغرافیایی (lon)', { exact: true }).fill('51.4');
  await modal.getByLabel('شعاع جست‌وجو', { exact: true }).selectOption('5');
  await modal.getByRole('button', { name: 'اعمال فیلتر محدوده', exact: true }).click();
  await expect(modal.locator('.offer-card')).toHaveCount(2);
  expect(requests.at(-1).get('max_distance_km')).toBe('5');
  expect(requests.at(-1).get('open_now_only')).toBe('true');
  const previousTime = await modal.locator('.hours-checked-at').textContent();
  await modal.getByRole('button', { name: 'به‌روزرسانی وضعیت ساعت', exact: true }).click();
  await expect(modal.locator('.hours-checked-at')).not.toHaveText(previousTime);
  await modal.getByLabel('فقط فروشگاه‌هایی که طبق ساعات ثبت‌شده اکنون بازند').uncheck();
  await expect(modal.locator('.offer-card')).toHaveCount(4);
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await modal.locator('.opening-hours').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('../../.local/qa/hours-synthetic-mobile.png') });
});

test('synthetic hours filter empty state, failed refresh and retry keep filter; malformed hours are an error', async ({ page }) => {
  let mode = 'valid';
  const queries = [];
  await page.route(`**/api/products/${product.product_id}/offers?**`, route => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    if (mode === 'failed') return route.fulfill({ status: 503, json: { detail: 'synthetic failure' } });
    const items = params.get('open_now_only') === 'true' ? [] : [allOffers[2]];
    return route.fulfill({ json: { items, has_more: false, limit: 10, offset: 0, provenance: source,
      hours_evaluated_at: mode === 'malformed' ? null : '2026-10-21T10:00:00+03:30' } });
  });
  const modal = await openSynthetic(page);
  await expect(modal.locator('.offer-card')).toHaveCount(1);
  await modal.getByLabel('فقط فروشگاه‌هایی که طبق ساعات ثبت‌شده اکنون بازند').check();
  await expect(modal.getByText('هیچ آفری با شرایط انتخابی یافت نشد')).toBeVisible();
  await expect(modal.getByText(/ساعت‌های نامشخص هم کنار گذاشته شده‌اند/)).toBeVisible();
  mode = 'failed';
  await modal.getByRole('button', { name: 'به‌روزرسانی وضعیت ساعت', exact: true }).click();
  await expect(modal.getByText('خطا در دریافت آفرها', { exact: true })).toBeVisible();
  mode = 'valid';
  await modal.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(modal.getByText('هیچ آفری با شرایط انتخابی یافت نشد')).toBeVisible();
  expect(queries.at(-1).get('open_now_only')).toBe('true');
  mode = 'malformed';
  await modal.getByRole('button', { name: 'به‌روزرسانی وضعیت ساعت', exact: true }).click();
  await expect(modal.getByText('خطا در دریافت آفرها', { exact: true })).toBeVisible();
});

test('real dataset hours display and open-only request through isolated API', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.locator('.product-card .secondary-btn').first().click();
  const modal = page.getByRole('dialog', { name: 'آفرهای فروشندگان' });
  await expect(modal.locator('.hours-checked-at')).toBeVisible();
  const originalCount = await modal.locator('.offer-card').count();
  expect(originalCount).toBeGreaterThan(0);
  await modal.getByLabel('فقط فروشگاه‌هایی که طبق ساعات ثبت‌شده اکنون بازند').check();
  await expect(modal.locator('.state-panel[role="status"]')).toHaveCount(0);
  await expect(modal.getByText('خطا در دریافت آفرها', { exact: true })).toHaveCount(0);
  const count = await modal.locator('.offer-card').count();
  if (count > 0) await expect(modal.locator('.hours-status')).toHaveText(Array(count).fill('طبق ساعات ثبت‌شده اکنون باز'));
  else await expect(modal.getByText('هیچ آفری با شرایط انتخابی یافت نشد')).toBeVisible();
  await modal.getByLabel('فقط فروشگاه‌هایی که طبق ساعات ثبت‌شده اکنون بازند').uncheck();
  await expect(modal.locator('.offer-card')).toHaveCount(originalCount);
});
