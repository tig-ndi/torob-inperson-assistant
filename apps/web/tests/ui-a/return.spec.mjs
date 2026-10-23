import { test, expect } from '@playwright/test';
import { product, cataloguePage } from './fixtures.mjs';
import { offers, offer } from '../../unit/ui-base/fixtures.mjs';

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`return restores the selected card, expanded source details and scroll at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let calls = 0;
    await page.route('**/api/products?**', r => {
      calls++;
      return r.fulfill({ json: cataloguePage(Array.from({ length: 12 }, (_, i) => ({ ...product(`p${i}`),
        persian_title: `کالای آزمون ${i}`, specs: [{ section: 'منبع', key: 'توضیح', value: 'متن بلند منبع '.repeat(20) }] }))) });
    });
    await page.route('**/api/products/p9/offers?**', r => r.fulfill({ json: offers([offer('o9', 's9', 'p9')]) }));
    await page.goto('/design.html');
    await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
    await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
    const card = page.getByRole('article', { name: 'کالای آزمون 9', exact: true });
    await card.getByText('مشخصات ثبت‌شده در منبع', { exact: true }).click();
    const seller = card.getByRole('button', { name: 'دیدن فروشندگان' });
    await seller.focus();
    await seller.scrollIntoViewIfNeeded();
    const before = await seller.boundingBox();
    await seller.click();
    await expect(page.locator('.ub-panel-top strong')).toHaveText('فروشندگان');
    await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
    await expect(seller).toBeFocused();
    await expect(seller).toBeInViewport();
    await expect(card.locator('details')).toHaveAttribute('open', '');
    const after = await seller.boundingBox();
    expect(Math.abs(after.y - before.y)).toBeLessThan(3);
    expect(calls).toBe(1);
    // Explicit new search, including the same query, must start a fresh result set.
    await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
    await expect.poll(() => calls).toBe(2);
    await expect(page.getByRole('heading', { name: 'انتخاب محصول', exact: true })).toBeFocused();
    await expect(card.locator('details')).not.toHaveAttribute('open', '');
  });
}

for (const sample of [
  { width: 320, height: 568, zoom: 1 }, { width: 768, height: 360, zoom: 1 },
  { width: 1440, height: 900, zoom: 2 }, { width: 1920, height: 1080, zoom: 1 },
]) {
  test(`long and missing source data remains reachable at ${sample.width}x${sample.height}, CSS zoom ${sample.zoom}`, async ({ page }) => {
    await page.setViewportSize(sample);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.route('**/api/products?**', r => r.fulfill({ json: cataloguePage([
      { ...product('long'), persian_title: 'گوشی با نام طولانی Mixed123 '.repeat(12), brand_name: null,
        specs: [{ section: null, key: null, value: 'LongUnbrokenSource123'.repeat(25) }] },
      { ...product('missing'), persian_title: null, brand_name: null, category_name: null, offer_summary: {
        offer_count: 0, min_price_toman: null, max_price_toman: null, missing_price_count: 0 } },
    ]) }));
    await page.goto('/design.html');
    if (sample.zoom !== 1) await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, sample.zoom);
    await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
    await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
    await expect(page.locator('.ua-product-card')).toHaveCount(2);
    await page.locator('.ua-product-card').first().getByText('مشخصات ثبت‌شده در منبع', { exact: true }).click();
    await expect(page.getByRole('article', { name: 'عنوان محصول ثبت نشده' })).toContainText('قیمت ثبت نشده');
    const action = page.locator('.ua-product-card').last().getByRole('button', { name: 'دیدن فروشندگان' });
    await action.focus();
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
