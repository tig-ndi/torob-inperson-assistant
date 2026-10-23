import { test, expect } from '@playwright/test';
import { page as catalogue, offer, offers, tileOk } from '../ui-b/fixtures.mjs';

for (const width of [320, 390, 1440]) {
  test(`start has no map even with a manual position, and resumes saved results at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    let tiles = 0, turns = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/tile.openstreetmap.org/**', route => {
      tiles++;
      return route.fulfill({ body: tileOk, contentType: 'image/svg+xml' });
    });
    await page.route('**/api/assistant/**', route => {
      if (route.request().method() === 'POST') turns++;
      return route.fulfill({ json: { ready: false, reason: 'disabled', remaining_calls: 0 } });
    });
    await page.route('**/api/products?**', route => route.fulfill({ json: catalogue() }));
    await page.route('**/api/products/p1/offers?**', route => route.fulfill({ json: offers([offer()]) }));
    await page.goto('/');
    await expect(page.locator('.um-map')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'کمک برای انتخاب', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'ادامهٔ خرید', exact: true })).toHaveCount(0);
    await expect(page.getByText('دستیار انتخاب در تهران', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /انتخاب موقعیت/ }).click();
    await page.getByLabel('انتخاب تقریبی منطقه').selectOption({ label: 'منطقهٔ ۱۱ — جمهوری' });
    await expect(page.locator('.um-map')).toHaveCount(0);
    await page.getByRole('button', { name: 'جست‌وجوی کالا', exact: true }).click();
    await expect(page.getByLabel('نام کالا در کاتالوگ')).toBeFocused();
    await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
    await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'گوشی نمونهٔ آزمون', exact: true })).toBeVisible();
    await expect(page.locator('.um-map')).toHaveCount(0);
    expect(tiles).toBe(0);
    await page.getByRole('button', { name: 'رفتن به شروع', exact: true }).click();
    await page.getByRole('button', { name: 'ادامهٔ خرید', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'انتخاب محصول', exact: true })).toBeVisible();
    await expect(page.getByLabel('نام کالا در کاتالوگ')).toHaveValue('گوشی');
    await page.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
    await expect(page.locator('.uv-card')).toBeVisible();
    await expect(page.locator('.um-map')).toHaveCount(1);
    await page.getByRole('button', { name: 'رفتن به شروع', exact: true }).click();
    await page.getByRole('button', { name: 'ادامهٔ خرید', exact: true }).click();
    await expect(page.locator('.uv-card')).toBeVisible();
    expect(turns).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
