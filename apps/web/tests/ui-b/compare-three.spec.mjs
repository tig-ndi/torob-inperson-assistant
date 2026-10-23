import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offer, offers, page as productPage, prepared, tileOk } from './fixtures.mjs';

const qa = fileURLToPath(new URL('../../../../.local/qa/p5-three/', import.meta.url));
mkdirSync(qa, { recursive: true });

// o1 and o2 are two independent offers of one shop; o3 and o4 are other shops.
const rows = [
  offer('o1', 's1', { price_toman: '0' }),
  offer('o2', 's1', { price_toman: null, seller_title: 'آفر بدون قیمت' }),
  offer('o3', 's2', { price_toman: '9007199254740993' }),
  offer('o4', 's4'),
];
const bigPrice = '۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳';

async function mockApi(page, bodies = { prepare: [] }) {
  await page.route('**/api/products?**', route => route.fulfill({ json: productPage() }));
  await page.route('**/api/products/p1/offers?**', route => route.fulfill({ json: offers(rows) }));
  await page.route('**/api/followups/prepare', route => {
    const body = route.request().postDataJSON();
    bodies.prepare.push(body);
    return route.fulfill({ json: prepared(rows.find(item => item.offer_id === body.offer_id) ?? rows[0]) });
  });
  await page.route('**/tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: tileOk }));
}

async function openStores(page) {
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان' }).click();
  await expect(page.locator('.uv-card')).toHaveCount(4);
}

async function addThree(page) {
  await page.locator('#uv-shop-s1 .uv-card').first().getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.locator('#uv-shop-s1 .uv-card').nth(1).getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.locator('#uv-shop-s2 .uv-card').getByRole('button', { name: 'مقایسه', exact: true }).click();
  await expect(page.getByRole('button', { name: 'مقایسهٔ ۳ آفر' })).toBeVisible();
}

async function openCompare(page) {
  await page.getByRole('button', { name: 'مقایسهٔ ۳ آفر' }).click();
  await expect(page.getByRole('region', { name: 'خلاصهٔ گزینه‌های مقایسه' })).toBeVisible();
}

test('three offers stay independent, the fourth is rejected, and the third offer follows up exactly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bodies = { prepare: [] };
  await mockApi(page, bodies);
  await openStores(page);
  await addThree(page);
  await openCompare(page);
  const summary = page.getByRole('region', { name: 'خلاصهٔ گزینه‌های مقایسه' });
  await expect(summary.getByRole('article')).toHaveCount(3);
  await expect(page.locator('.uv-table thead th')).toHaveCount(4);
  await expect(summary.getByRole('article').nth(0)).toContainText('۰ تومان');
  await expect(summary.getByRole('article').nth(1)).toContainText('قیمت ثبت نشده');
  expect((await summary.getByRole('article').nth(2).locator('.ub-price').textContent())?.replace(/[^۰-۹]/g, '')).toBe(bigPrice);
  const priceRow = page.locator('.uv-table tbody tr').nth(1);
  await expect(priceRow.locator('td').nth(0)).toContainText('۰ تومان');
  await expect(priceRow.locator('td').nth(1)).toContainText('قیمت ثبت نشده');
  expect((await priceRow.locator('td').nth(2).locator('.ub-price').textContent())?.replace(/[^۰-۹]/g, '')).toBe(bigPrice);

  // A fourth comparison offer is rejected without replacing the saved three.
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await page.locator('#uv-shop-s4 .uv-card').getByRole('button', { name: 'مقایسه', exact: true }).click();
  await expect(page.getByText('حداکثر ۳ آفر را می‌توانید مقایسه کنید.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'بستن پیام' }).click();
  await openCompare(page);
  await expect(summary.getByRole('article')).toHaveCount(3);
  await expect(summary.getByRole('heading', { name: 'نام نمایشی s4' })).toHaveCount(0);

  // The third offer is followed up with its exact identity and never creates a destination.
  await summary.getByRole('button', { name: 'انتخاب و پیگیری آفر ۳' }).click();
  await expect(page.getByRole('heading', { name: 'پیگیری همین آفر' })).toBeVisible();
  await expect(page.getByText('مقصد اصلی')).toHaveCount(0);
  await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' }).click();
  await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
  expect(bodies.prepare).toEqual([{ product_id: 'p1', offer_id: 'o3', shop_id: 's2' }]);
  await expect(page.getByText('مقصد اصلی')).toHaveCount(0);

  // Removing the middle offer keeps the other two and allows the fourth to replace it.
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await expect(page.getByText('برنامهٔ مراجعهٔ ثبت‌شده از انتخاب قبلی مستقل است')).toHaveCount(0);
  const middleAction = page.locator('.uv-table tbody tr').last().locator('td').nth(1);
  await middleAction.getByRole('button', { name: 'حذف از مقایسه' }).click();
  await expect(summary.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await page.locator('#uv-shop-s4 .uv-card').getByRole('button', { name: 'مقایسه', exact: true }).click();
  await openCompare(page);
  await expect(summary.getByRole('article')).toHaveCount(3);
  await expect(summary.getByRole('heading', { name: 'نام نمایشی s4' })).toBeVisible();
  await expect(page.getByText('برنامهٔ مراجعهٔ ثبت‌شده از انتخاب قبلی مستقل است')).toHaveCount(0);
  await expect(summary.getByRole('article').nth(0)).toContainText('۰ تومان');
  expect((await summary.getByRole('article').nth(1).locator('.ub-price').textContent())?.replace(/[^۰-۹]/g, '')).toBe(bigPrice);
  await summary.getByRole('button', { name: 'انتخاب و پیگیری آفر ۳' }).click();
  await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' }).click();
  await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
  expect(bodies.prepare).toEqual([{ product_id: 'p1', offer_id: 'o3', shop_id: 's2' },
    { product_id: 'p1', offer_id: 'o4', shop_id: 's4' }]);
  await expect(page.getByText('مقصد اصلی')).toHaveCount(0);
});

for (const [width, height] of [[320, 568], [390, 844], [1440, 900]]) {
  test(`three-offer comparison stays usable in both themes at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockApi(page);
    await openStores(page);
    await addThree(page);
    await openCompare(page);
    const summary = page.getByRole('region', { name: 'خلاصهٔ گزینه‌های مقایسه' });
    const scroll = page.getByRole('region', { name: 'جدول مقایسهٔ آفرها' });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await expect(page.locator('html')).toHaveAttribute('data-ui-theme', scheme);
      await expect(summary.getByRole('article')).toHaveCount(3);
      await expect(priceRow(page)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const metrics = await scroll.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
      expect(metrics.scrollWidth).toBeGreaterThanOrEqual(metrics.clientWidth);
      await summary.getByRole('article').nth(2).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(qa, `three-summary-${width}-${scheme}.png`) });
      await scroll.scrollIntoViewIfNeeded();
      await expect(page.locator('.uv-table').getByRole('button', { name: 'انتخاب این آفر', exact: true })).toHaveCount(3);
      await page.screenshot({ path: path.join(qa, `three-table-${width}-${scheme}.png`) });
    }
  });
}

function priceRow(page) {
  return page.locator('.uv-table tbody tr').nth(1);
}
