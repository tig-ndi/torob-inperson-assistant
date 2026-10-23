import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offer, offers, page as productPage, product, prepared, alternatives, noAlternatives, tileOk } from './fixtures.mjs';

const qa = fileURLToPath(new URL('../../../../.local/qa/ui-b/', import.meta.url));
mkdirSync(qa, { recursive: true });

const fourOffers = offers([
  offer('o1', 's1'),
  offer('o2', 's1', { price_toman: '1200000', seller_title: 'فروشندهٔ دوم' }),
  offer('o3', 's2', { shop: { ...offer('o3', 's2').shop, lat: 35.78, lon: 51.5 } }),
  offer('o4', 's4', { shop: { ...offer('o4', 's4').shop, lat: 35.7, lon: 51.4 } }),
]);

async function mockApi(page, { offerPage = fourOffers, tiles = 'ok', onPrepare, onAlternatives, alternativesResponse } = {}) {
  await page.route('**/api/products?**', route => route.fulfill({ json: productPage() }));
  await page.route('**/api/products/p1/offers?**', route => route.fulfill({ json: offerPage }));
  await page.route('**/api/followups/prepare', async route => {
    const body = route.request().postDataJSON();
    onPrepare?.(body);
    const selected = offerPage.items.find(item => item.offer_id === body.offer_id) ?? offerPage.items[0] ?? offer();
    await route.fulfill({ json: prepared(selected) });
  });
  await page.route('**/api/followups/alternatives', async route => {
    const body = route.request().postDataJSON();
    onAlternatives?.(body);
    if (alternativesResponse) return route.fulfill({ json: alternativesResponse(body) });
    const reported = offerPage.items.find(item => item.offer_id === body.offer_id) ?? offerPage.items[0] ?? offer();
    const next = offerPage.items.find(item => item.shop_id !== body.shop_id) ?? offer('o3', 's2');
    await route.fulfill({ json: alternatives(reported, next, body.outcome, body.outcome_source) });
  });
  await page.route('**/tile.openstreetmap.org/**', route => tiles === 'fail'
    ? route.abort()
    : route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tileOk }));
}

async function openStores(page) {
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان' }).click();
  await expect(page.getByRole('heading', { name: 'گوشی نمونهٔ آزمون' })).toBeVisible();
}

async function showMap(page) {
  await page.getByRole('button', { name: 'نقشه و فهرست', exact: true }).click();
  await expect(page.getByRole('region', { name: 'نقشهٔ خیابان با کاشی‌های OpenStreetMap' })).toBeVisible();
}

for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932], [768, 1024], [768, 360],
  [959, 800], [960, 800], [1024, 768], [1440, 900], [1920, 1080]]) {
  test(`stores expose a first decidable offer at ${width}x${height}`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await mockApi(page);
    await openStores(page);
    await expect(page.getByRole('button', { name: 'انتخاب این آفر', exact: true })).toHaveCount(4);
    await expect(page.locator('.uv-shop')).toHaveCount(3);
    const first = page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).first();
    const box = await first.boundingBox();
    if (width === 320 || width === 390 || width === 1440) {
      await page.screenshot({ path: path.join(qa, `stores-${width}-view.png`) });
    }
    expect(box).not.toBeNull();
    expect(box.y).toBeLessThan(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('map pins stay in sync with the grouped list and never auto-select an offer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await openStores(page);
  await showMap(page);
  await expect(page.locator('.um-cluster')).toHaveCount(1);
  await expect(page.locator('.um-cluster')).toContainText('۲');
  const pin = page.locator('.um-pin[aria-label*="نام نمایشی s2"]');
  await expect(pin).toHaveCount(1);
  await pin.click();
  await expect(page.locator('#uv-shop-s2')).toHaveClass(/is-focused/);
  await expect(page.locator('.uv-card.is-selected')).toHaveCount(0);
  // Both offers of the clustered co-located shops remain reachable from the list.
  await expect(page.locator('#uv-shop-s1 .uv-card')).toHaveCount(2);
  await expect(page.locator('#uv-shop-s4 .uv-card')).toHaveCount(1);
  await page.locator('#uv-shop-s4').getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await expect(page.locator('#uv-shop-s4 .uv-card')).toHaveClass(/is-selected/);
  await page.screenshot({ path: path.join(qa, 'map-sync-390.png') });
});

test('a named map action reveals the mobile map without losing the selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mockApi(page);
  await openStores(page);
  await expect(page.locator('.um-map')).toBeHidden();
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).first().click();
  await page.getByRole('button', { name: 'نمایش روی نقشه' }).click();
  await expect(page.getByRole('region', { name: 'نقشهٔ خیابان با کاشی‌های OpenStreetMap' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'فهرست کامل', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.uv-card.is-selected')).toHaveCount(1);
  await expect(page.locator('.um-cluster.is-selected')).toHaveCount(1);
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: path.join(qa, 'map-reveal-390.png') });
});

test('co-located shops stay clustered and every member is reachable without fake coordinates', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await openStores(page);
  await showMap(page);
  await expect(page.locator('.um-cluster')).toHaveCount(1);
  for (let attempt = 0; attempt < 8 && await page.locator('.um-cluster').count() > 0; attempt++) {
    await page.locator('.um-cluster').first().click({ force: true });
    await page.waitForTimeout(250);
  }
  await expect(page.locator('.um-pin[aria-label*="نام نمایشی s1"]')).toHaveCount(1);
  await expect(page.locator('.um-pin[aria-label*="نام نمایشی s4"]')).toHaveCount(1);
  await page.screenshot({ path: path.join(qa, 'map-spiderfy-390.png') });
});

test('map controls switch theme, locate and reveal the seller list', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await openStores(page);
  await expect(page.locator('.um-map')).toBeHidden();
  await page.getByRole('button', { name: 'نمایش همهٔ فروشگاه‌ها روی نقشه' }).click();
  await expect(page.getByRole('region', { name: 'نقشهٔ خیابان با کاشی‌های OpenStreetMap' })).toBeVisible();
  await page.getByRole('button', { name: 'تغییر به تم روشن' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
  await expect(page.locator('.uv-visit')).toHaveAttribute('data-theme-mode', 'light');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(qa, 'stores-light-390.png') });
  await page.getByRole('button', { name: 'تغییر به تم تیره' }).click();
  await page.getByRole('button', { name: 'موقعیت من' }).click();
  await expect(page.locator('.ub-toast')).toBeVisible();
  await expect(page.locator('.ub-toast')).toContainText('موقعیت دریافت نشد');
  await page.getByRole('button', { name: 'نمایش فهرست فروشندگان' }).click();
  await expect(page.locator('.um-map')).toBeHidden();
  await expect(page.getByRole('button', { name: 'نقشه و فهرست', exact: true })).toHaveAttribute('aria-expanded', 'true');
});

test('map locate uses an allowed position and draws the user marker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 35.7, longitude: 51.4 });
  await mockApi(page);
  await openStores(page);
  await showMap(page);
  await page.getByRole('button', { name: 'موقعیت من' }).click();
  await expect(page.locator('.um-user')).toHaveCount(1);
  await expect(page.locator('.ub-toast')).toHaveCount(0);
});

test('tile failure is visible and the seller list still completes a selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { tiles: 'fail' });
  await openStores(page);
  await showMap(page);
  await expect(page.getByRole('alert')).toContainText('کاشی‌های نقشه در دسترس نیستند');
  await expect(page.getByRole('button', { name: 'تلاش دوباره برای نقشه' })).toBeVisible();
  const second = page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).nth(1);
  await second.click();
  await expect(page.locator('.uv-card.is-selected')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'پیگیری', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(qa, 'map-tile-failure-390.png') });
});

test('a second offer keeps its offer_id through prepare, back and return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const preparedBodies = [];
  await mockApi(page, { onPrepare: body => preparedBodies.push(body) });
  await openStores(page);
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).nth(1).click();
  await expect(page.locator('#uv-shop-s1 .uv-card').nth(1)).toHaveClass(/is-selected/);
  await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' }).click();
  await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
  expect(preparedBodies).toHaveLength(1);
  expect(preparedBodies[0]).toMatchObject({ product_id: 'p1', offer_id: 'o2', shop_id: 's1' });
  await expect(page.getByText('شبیه‌سازی — تماس واقعی انجام نشد')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(qa, 'contact-draft-390.png') });
  expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
  expect(await page.locator('a[href*="wa.me"], a[href*="whatsapp"]').count()).toBe(0);
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await expect(page.locator('#uv-shop-s1 .uv-card').nth(1)).toHaveClass(/is-selected/);
  await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
  expect(preparedBodies).toHaveLength(1);
});

test('comparison scrolls locally, does not create a trip, and one shop can be a destination', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockApi(page);
  await openStores(page);
  await page.locator('#uv-shop-s1 .uv-card').first().getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.locator('#uv-shop-s2 .uv-card').getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.screenshot({ path: path.join(qa, 'stores-tray-320.png') });
  await page.getByRole('button', { name: 'مقایسهٔ ۲ آفر' }).click();
  const region = page.getByRole('region', { name: 'جدول مقایسهٔ آفرها' });
  await expect(region).toBeVisible();
  await expect(page.locator('.uv-table thead th')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const metrics = await region.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(metrics.scrollWidth).toBeGreaterThanOrEqual(metrics.clientWidth);
  await page.screenshot({ path: path.join(qa, 'compare-320.png') });
  await region.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.uv-compare-scroll')))).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  const journey = page.getByRole('navigation', { name: 'مسیر خرید', exact: true });
  await expect(journey.getByRole('button', { name: /پیگیری و مراجعه/ })).toBeDisabled();
  await expect(page.getByText('مقصد اصلی', { exact: true })).toHaveCount(0);
  await journey.getByRole('button', { name: /فروشندگان/ }).click();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).first().click();
  await page.getByRole('button', { name: 'برنامهٔ مراجعه', exact: true }).click();
  await expect(page.getByText('مقصد اصلی')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'نام نمایشی s1' }).first()).toBeVisible();
  await page.screenshot({ path: path.join(qa, 'trip-one-shop-320.png') });
});

test('a non-first offer can become the destination from comparison', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await openStores(page);
  await page.locator('#uv-shop-s1 .uv-card').first().getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.locator('#uv-shop-s2 .uv-card').getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.getByRole('button', { name: 'مقایسهٔ ۲ آفر' }).click();
  const secondColumn = page.locator('.uv-table tbody tr').last().locator('td').nth(1);
  await secondColumn.getByRole('button', { name: 'برنامهٔ مراجعه' }).click();
  await expect(page.getByText('مقصد اصلی')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'نام نمایشی s2' })).toBeVisible();
});

test('simulated outcome uses alternatives, survives a return, and labels the new destination', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = [];
  await mockApi(page, { onAlternatives: body => requests.push(body) });
  await openStores(page);
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).first().click();
  await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await page.getByLabel('کالا موجود نبود').check();
  await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه' }).click();
  await expect(page.getByRole('heading', { name: 'جایگزین‌های همین محصول' })).toBeVisible();
  expect(requests[0]).toMatchObject({ product_id: 'p1', offer_id: 'o1', shop_id: 's1',
    outcome: 'out_of_stock', outcome_source: 'simulated' });
  await page.screenshot({ path: path.join(qa, 'contact-alternatives-390.png') });
  await expect(page.getByText('تأیید بیرونی: خیر')).toBeVisible();
  await expect(page.getByText('۲ آفر ثبت‌شده از فروشگاه گزارش‌شده')).toBeVisible();
  expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'جایگزین‌های همین محصول' })).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'ثبت این جایگزین به‌عنوان مقصد' }).click();
  await expect(page.getByText('مقصد اصلی')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'نام نمایشی s2' })).toBeVisible();
  await expect(page.getByText('منبع انتخاب: شبیه‌سازی')).toBeVisible();
  await expect(page.getByText('شبیه‌سازی — تماس واقعی انجام نشد')).toBeVisible();
  await page.screenshot({ path: path.join(qa, 'trip-alternative-390.png') });
});

test('no_alternatives is explicit and never raises budget or radius', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { alternativesResponse: body => noAlternatives(offer('o1'), body.outcome, body.outcome_source) });
  await openStores(page);
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).first().click();
  await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه' }).click();
  await expect(page.getByRole('heading', { name: 'جایگزینی با این شرایط نیست' })).toBeVisible();
  await expect(page.getByText('بودجه یا شعاع به‌طور خودکار افزایش داده نشد؛')).toBeVisible();
  await expect(page.getByRole('button', { name: /حذف سقف بودجه/ })).toHaveCount(0);
  await expect(page.locator('.uv-review')).toHaveCount(0);
});

test('changed filters flag the old selection and only a visible offer can be confirmed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  const openOffer = offer('o3', 's2', { shop: { ...offer('o3', 's2').shop, lat: 35.78, lon: 51.5 },
    opening_hours: { status: 'declared_open', reason: 'within_declared_shift', local_day: 'fri',
      today_shifts: [{ start_time: '09:00:00', end_time: '21:00:00', ends_next_day: false }],
      previous_day_overnight_shifts: [] } });
  await page.route('**/api/products/p1/offers?**', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('open_now_only') === 'true') return route.fulfill({ json: offers([openOffer]) });
    if (params.get('max_price_toman') === '2000000') return route.fulfill({ json: offers([
      offer('o1', 's1'), offer('o2', 's1', { price_toman: '1200000' }), offer('o4', 's4')]) });
    return route.fulfill({ json: fourOffers });
  });
  await openStores(page);
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).first().click();
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'شرایط جست‌وجو' });
  await dialog.getByLabel('سقف بودجه به تومان').fill('2000000');
  await dialog.getByRole('button', { name: 'اعمال شرایط' }).click();
  await expect(page.getByText('انتخاب قبلی به‌طور خودکار واجد شرایط معرفی نمی‌شود.')).toBeVisible();
  await page.getByRole('button', { name: 'تأیید همین انتخاب' }).click();
  await expect(page.locator('.uv-review')).toHaveCount(0);
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  await dialog.getByLabel('فقط باز طبق برنامهٔ اعلام‌شده').check();
  await dialog.getByRole('button', { name: 'اعمال شرایط' }).click();
  await expect(page.getByText('این آفر در صفحهٔ بارگذاری‌شدهٔ فعلی دیده نمی‌شود')).toBeVisible();
  await expect(page.getByRole('button', { name: 'تأیید همین انتخاب' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'پیگیری', exact: true })).toHaveCount(0);
  await page.screenshot({ path: path.join(qa, 'selection-review-390.png') });
});

test('a filter changed while offers are in flight wins over the stale response', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  let first = true;
  await page.route('**/api/products/p1/offers?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (first) { first = false; await new Promise(resolve => setTimeout(resolve, 2000)); }
    if (params.get('max_price_toman') === '2000000') return route.fulfill({ json: offers([offer('o1', 's1')]) });
    return route.fulfill({ json: fourOffers });
  });
  await openStores(page);
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'شرایط جست‌وجو' });
  await dialog.getByLabel('سقف بودجه به تومان').fill('2000000');
  await dialog.getByRole('button', { name: 'اعمال شرایط' }).click();
  await expect(page.locator('.uv-shop')).toHaveCount(1);
  await page.waitForTimeout(2400);
  await expect(page.locator('.uv-shop')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'انتخاب این آفر', exact: true })).toHaveCount(1);
});

test('an initial offers failure offers retry instead of an empty result', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  let fail = true;
  await page.route('**/api/products/p1/offers?**', route => {
    if (fail) { fail = false; return route.fulfill({ status: 503, json: { code: 'catalogue_unavailable' } }); }
    return route.fulfill({ json: fourOffers });
  });
  await openStores(page);
  await expect(page.getByRole('alert')).toContainText('سرویس فعلاً در دسترس نیست');
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.getByRole('button', { name: 'انتخاب این آفر', exact: true })).toHaveCount(4);
});

test('location denial falls back to a manual point and draws the user marker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await openStores(page);
  await page.getByRole('button', { name: /انتخاب موقعیت/ }).click();
  const dialog = page.getByRole('dialog', { name: 'موقعیت جست‌وجو' });
  await dialog.getByRole('button', { name: 'دریافت موقعیت با اجازهٔ من' }).click();
  await expect(dialog.getByRole('alert')).toContainText('موقعیت دریافت نشد');
  await dialog.getByLabel('عرض جغرافیایی').fill('35.7');
  await dialog.getByLabel('طول جغرافیایی').fill('51.4');
  await dialog.getByRole('button', { name: 'انتخاب این نقطه' }).click();
  await expect(page.getByRole('button', { name: /نقطهٔ انتخاب‌شدهٔ شما/ })).toBeVisible();
  await showMap(page);
  await expect(page.locator('.um-user')).toHaveCount(1);
});

test('reduced motion keeps the map and keyboard pin activation working', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mockApi(page);
  await openStores(page);
  await showMap(page);
  const pin = page.locator('.um-pin[aria-label*="نام نمایشی s2"]');
  await expect(pin).toHaveCount(1);
  await pin.focus();
  await expect(pin).toBeFocused();
  await pin.press('Enter');
  await expect(page.locator('#uv-shop-s2')).toHaveClass(/is-focused/);
  expect(errors).toEqual([]);
});

test('cancel stops a pending draft and leaves no unsent-success claim', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.route('**/api/followups/prepare', async route => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await route.fulfill({ json: prepared(offer('o1')) }).catch(() => {});
  });
  await openStores(page);
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).first().click();
  await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' }).click();
  await expect(page.getByText('در حال دریافت…')).toBeVisible();
  await page.getByRole('button', { name: 'لغو درخواست پیش‌نویس' }).click();
  await expect(page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' })).toBeVisible();
  await page.waitForTimeout(2300);
  await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toHaveCount(0);
});

test('empty offers are distinct from a failed catalogue', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { offerPage: offers([]) });
  await openStores(page);
  await expect(page.getByRole('heading', { name: 'آفری با این شرایط در صفحهٔ بارگذاری‌شده نیست' })).toBeVisible();
  await expect(page.locator('.uv-shop')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('unknown hours, missing price and an exact large price stay distinct', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const oddOffers = offers([
    offer('o1', 's1', { price_toman: null }),
    offer('o2', 's1', { price_toman: '9007199254740993', seller_title: 'آفر با مبلغ بزرگ' }),
  ]);
  await mockApi(page, { offerPage: oddOffers });
  await openStores(page);
  await expect(page.getByRole('button', { name: 'انتخاب این آفر', exact: true })).toHaveCount(2);
  await expect(page.getByText('ساعت نامشخص').first()).toBeVisible();
  const prices = await page.locator('.uv-card .ub-price').allTextContents();
  expect(prices[0]).toContain('قیمت ثبت نشده');
  expect(prices[1]?.replace(/[^۰-۹]/g, '')).toBe('۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳');
  const oddCards = page.locator('.uv-card');
  await oddCards.nth(0).getByRole('button', { name: 'مقایسه', exact: true }).click();
  await oddCards.nth(1).getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.getByRole('button', { name: 'مقایسهٔ ۲ آفر' }).click();
  await expect(page.locator('.uv-table')).toContainText('قیمت ثبت نشده');
  expect((await page.locator('.uv-table .ub-price').nth(1).textContent())?.replace(/[^۰-۹]/g, '')).toBe('۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳');
  await page.screenshot({ path: path.join(qa, 'null-large-price-compare-390.png') });
});

test('dark theme keeps seller cards and comparison readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('combobox', { name: 'تم نمایش' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان' }).click();
  await expect(page.getByRole('button', { name: 'انتخاب این آفر', exact: true })).toHaveCount(4);
  await page.screenshot({ path: path.join(qa, 'stores-dark-390.png') });
  await page.locator('#uv-shop-s1 .uv-card').first().getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.locator('#uv-shop-s2 .uv-card').getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.getByRole('button', { name: 'مقایسهٔ ۲ آفر' }).click();
  await expect(page.locator('.uv-compare-scroll')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: path.join(qa, 'compare-dark-390.png') });
});

test('real snapshot B path: offers, unsent follow-up and alternatives without model calls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tileOk }));
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.ua-product-card').first()).toBeVisible();
  let found = false;
  for (let index = 0; index < 5 && !found; index++) {
    const card = page.locator('.ua-product-card').nth(index);
    if (await card.count() === 0) break;
    const response = page.waitForResponse(r => /\/api\/products\/[^/]+\/offers\?/.test(r.url()));
    await card.getByRole('button', { name: 'دیدن فروشندگان' }).click();
    expect((await response).ok()).toBe(true);
    await expect(page.locator('.uv-stores')).toBeVisible();
    await expect(page.locator('.uv-stores')).toHaveAttribute('aria-busy', 'false');
    found = await page.locator('.uv-card').count() > 0;
    if (!found) await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  }
  expect(found).toBe(true);
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).first().click();
  await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' }).click();
  await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه' }).click();
  await expect(page.locator('.uv-alternatives')).toBeVisible();
  await expect(page.locator('.uv-alternatives')).toContainText('تأیید بیرونی: خیر');
  expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: path.join(qa, 'real-snapshot-followup-390.png') });
});
