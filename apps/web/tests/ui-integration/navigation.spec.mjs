import { test, expect } from '@playwright/test';
import { product, cataloguePage } from '../ui-a/fixtures.mjs';
import { offer, offers, prepared, tileOk } from '../ui-b/fixtures.mjs';

async function setup(page) {
  const counts = { products: 0, prepare: 0, turns: 0 };
  const selected = offer('o2', 's1', { product_id: 'p9', seller_title: 'آفر مستقل دوم' });
  await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/svg+xml', body: tileOk }));
  await page.route('**/api/assistant/status', r => r.fulfill({ json: { ready: false, reason: 'disabled', remaining_calls: 0 } }));
  await page.route('**/api/assistant/turn', r => { counts.turns++; return r.abort(); });
  await page.route('**/api/products?**', r => {
    counts.products++;
    return r.fulfill({ json: cataloguePage(Array.from({ length: 12 }, (_, i) => ({ ...product(`p${i}`), persian_title: `گوشی شماره ${i}` }))) });
  });
  await page.route('**/api/products/p9/offers?**', r => r.fulfill({ json: offers([
    offer('o1', 's1', { product_id: 'p9' }), selected,
  ]) }));
  await page.route('**/api/followups/prepare', r => {
    counts.prepare++;
    expect(r.request().postDataJSON()).toMatchObject({ product_id: 'p9', offer_id: 'o2', shop_id: 's1' });
    const response = prepared(selected);
    response.product.product_id = 'p9';
    return r.fulfill({ json: response });
  });
  await page.goto('/');
  return counts;
}

for (const width of [390, 1440]) {
  test(`browser and in-app back share history, preserve domain state and support a new forward branch at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const counts = await setup(page);
    await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
    await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
    const card = page.getByRole('article', { name: 'گوشی شماره 9', exact: true });
    const seller = card.getByRole('button', { name: 'دیدن فروشندگان' });
    await seller.focus();
    await seller.scrollIntoViewIfNeeded();
    const before = await seller.boundingBox();
    await seller.click();
    await page.locator('.uv-card').nth(1).getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
    await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
    await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' }).click();
    await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.locator('.uv-card').nth(1)).toHaveClass(/is-selected/);
    await page.goBack();
    await expect(seller).toBeFocused();
    await expect(seller).toBeInViewport();
    expect(Math.abs((await seller.boundingBox()).y - before.y)).toBeLessThan(3);
    expect(counts.products).toBe(1);
    const marker = await page.evaluate(() => history.state);
    expect(marker).toEqual({ torobWorkspace: { session: expect.any(String), entry: expect.any(Number) } });
    expect(new URL(page.url()).search).toBe('');
    await page.goForward();
    await expect(page.locator('.uv-card').nth(1)).toHaveClass(/is-selected/);
    await page.goForward();
    await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
    expect(counts.prepare).toBe(1);
    // The in-app action traverses the same browser entries, it must not push a duplicate.
    await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
    await expect(page.locator('.uv-card').nth(1)).toHaveClass(/is-selected/);
    await page.goForward();
    await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.locator('.uv-card').nth(1)).toHaveClass(/is-selected/);
    await page.getByRole('button', { name: 'برنامهٔ مراجعه', exact: true }).click();
    await expect(page.getByText('مقصد اصلی', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.locator('.uv-stores')).toBeVisible();
    await page.goForward();
    await expect(page.getByText('مقصد اصلی', { exact: true })).toBeVisible();
    expect(counts.prepare).toBe(1);
    expect(counts.turns).toBe(0);
    await page.reload();
    await expect(page.locator('.ub-panel-top strong')).toHaveText('شروع');
    await expect(page.locator('.ua-product-card, .uv-trip-card')).toHaveCount(0);
  });
}

test('back cancels a shell search so a late response cannot pull the user forward again', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await expect(page.locator('.ub-panel-top strong')).toHaveText('بررسی نیاز');
  let release; let started = false; let finished = false;
  await page.route('**/api/products?**', async r => {
    started = true;
    await new Promise(resolve => { release = resolve; });
    await r.fulfill({ json: cataloguePage([product()]) }).catch(() => {});
    finished = true;
  });
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await page.goBack();
  await expect(page.locator('.ub-panel-top strong')).toHaveText('شروع');
  release();
  await expect.poll(() => finished).toBe(true);
  await expect(page.locator('.ub-panel-top strong')).toHaveText('شروع');
  await page.goForward();
  await expect(page.locator('.ub-panel-top strong')).toHaveText('بررسی نیاز');
  await expect(page.locator('.ua-product-card')).toHaveCount(0);
});

test('unknown history payload cannot create a route or restore discarded domain data', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => dispatchEvent(new PopStateEvent('popstate', {
    state: { torobWorkspace: { session: 'foreign', entry: 42, screen: 'trip' }, product: { product_id: 'forged' } },
  })));
  await expect(page.locator('.ub-panel-top strong')).toHaveText('شروع');
  await expect(page.getByRole('navigation', { name: 'صفحه‌های پایه', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await page.getByRole('button', { name: 'رفتن به شروع', exact: true }).click();
  await expect(page.locator('.ub-panel-top strong')).toHaveText('شروع');
  await page.goBack();
  await expect(page.locator('.ub-panel-top strong')).toHaveText('بررسی نیاز');
});
