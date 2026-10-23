import { test, expect } from '@playwright/test';
import { offer, offers, page as productPage } from '../ui-b/fixtures.mjs';

for (const [width, height] of [[320, 568], [768, 360], [1440, 900]]) {
  test(`map failure keeps decisions and recovery reachable at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route('**/api/products?**', r => r.fulfill({ json: productPage() }));
    await page.route('**/api/products/p1/offers?**', r => r.fulfill({ json: offers([offer()]) }));
    await page.route('**/tile.openstreetmap.org/**', r => r.abort());
    await page.goto('/');
    await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
    await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
    await page.getByRole('button', { name: 'دیدن فروشندگان' }).click();
    await expect(page.getByRole('button', { name: 'نزدیک‌ترین', exact: true })).toBeVisible();
    const select = page.getByRole('button', { name: 'انتخاب این آفر', exact: true });
    await select.scrollIntoViewIfNeeded();
    await expect(select).toBeInViewport();
    await select.click();
    if (width < 960) {
      await page.getByRole('button', { name: 'نقشه و فهرست', exact: true }).click();
    }
    await expect(page.getByRole('region', { name: 'نقشهٔ خیابان با کاشی‌های OpenStreetMap' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'تلاش دوباره برای نقشه' })).toBeVisible();
    if (width < 960) {
      await page.getByRole('button', { name: 'نمایش فهرست فروشندگان', exact: true }).click();
      await expect(page.locator('#workspace-panel')).toBeFocused();
    }
    await expect(page.getByRole('button', { name: 'پیگیری', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}
