import { test, expect } from '@playwright/test';
import { offer, offers, page as productPage, prepared, tileOk } from './fixtures.mjs';

// o1 and o2 are two independent offers of one shop; o3 is another shop.
const rows = [
  offer('o1', 's1'),
  offer('o2', 's1', { price_toman: '1200000', seller_title: 'آفر دوم' }),
  offer('o3', 's2'),
];

async function mockApi(page, bodies) {
  await page.route('**/api/products?**', route => route.fulfill({ json: productPage() }));
  await page.route('**/api/products/p1/offers?**', route => {
    const budget = new URL(route.request().url()).searchParams.get('max_price_toman');
    const items = budget === null ? rows : rows.filter(item => BigInt(item.price_toman) <= BigInt(budget));
    return route.fulfill({ json: offers(items) });
  });
  await page.route('**/api/followups/prepare', route => {
    const body = route.request().postDataJSON();
    bodies.prepare.push(body);
    const selected = rows.find(item => item.offer_id === body.offer_id) ?? rows[0];
    return route.fulfill({ json: prepared(selected) });
  });
  await page.route('**/tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: tileOk }));
}

async function openStores(page) {
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان' }).click();
  await expect(page.locator('.uv-card')).toHaveCount(3);
}

async function setBudget(page, value) {
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'شرایط جست‌وجو' });
  await dialog.getByLabel('سقف بودجه به تومان').fill(value);
  await dialog.getByRole('button', { name: 'اعمال شرایط' }).click();
}

async function compareTwo(page) {
  // Comparison keeps insertion order: the first card is o1 and the second one is o2.
  await page.locator('#uv-shop-s1 .uv-card').first().getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.locator('#uv-shop-s1 .uv-card').nth(1).getByRole('button', { name: 'مقایسه', exact: true }).click();
  await page.getByRole('button', { name: 'مقایسهٔ ۲ آفر' }).click();
  await expect(page.getByRole('region', { name: 'خلاصهٔ گزینه‌های مقایسه' })).toBeVisible();
}

test('a compare offer outside the current page needs review before follow-up or planning', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bodies = { prepare: [] };
  await mockApi(page, bodies);
  await openStores(page);
  await page.locator('#uv-shop-s1 .uv-card').first().getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await compareTwo(page);
  await setBudget(page, '1100000');
  await expect(page.getByText('شرایط جست‌وجو، بودجه یا موقعیت تغییر کرده‌اند.')).toBeVisible();
  const summary = page.getByRole('region', { name: 'خلاصهٔ گزینه‌های مقایسه' });
  await expect(summary.getByRole('button', { name: 'انتخاب و پیگیری آفر ۲' })).toHaveCount(0);
  await expect(summary.getByRole('article').nth(1).getByRole('button', { name: 'بازبینی در فروشندگان' })).toBeVisible();
  await expect(page.locator('.uv-table').getByRole('button', { name: 'برنامهٔ مراجعه' })).toHaveCount(0);
  // The named review path loads current data and must not turn the saved offer into a selection or a plan.
  await summary.getByRole('article').nth(1).getByRole('button', { name: 'بازبینی در فروشندگان' }).click();
  await expect(page.locator('.uv-card')).toHaveCount(1);
  await expect(page.getByText('مقصد اصلی')).toHaveCount(0);
  // The previously selected offer is now loaded, but it still needs its own explicit review.
  await page.getByRole('navigation', { name: 'مسیر خرید' }).getByRole('button', { name: /مقایسه/ }).click();
  await expect(summary.getByRole('button', { name: 'انتخاب و پیگیری آفر ۱' })).toHaveCount(0);
  await expect(summary.getByRole('article').nth(0).getByRole('button', { name: 'بازبینی در فروشندگان' })).toBeVisible();
  await expect(page.locator('.uv-table').getByRole('button', { name: 'برنامهٔ مراجعه' })).toHaveCount(0);
  // An explicit review re-opens only the offer that the current page verifies.
  await page.getByRole('navigation', { name: 'مسیر خرید' }).getByRole('button', { name: /فروشندگان/ }).click();
  await expect(page.locator('.uv-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'تأیید همین انتخاب' }).click();
  await page.getByRole('navigation', { name: 'مسیر خرید' }).getByRole('button', { name: /مقایسه/ }).click();
  await expect(summary.getByRole('button', { name: 'انتخاب و پیگیری آفر ۱' })).toBeVisible();
  await expect(summary.getByRole('button', { name: 'انتخاب و پیگیری آفر ۲' })).toHaveCount(0);
  await expect(page.locator('.uv-table').getByRole('button', { name: 'برنامهٔ مراجعه' })).toHaveCount(1);
  await summary.getByRole('button', { name: 'انتخاب و پیگیری آفر ۱' }).click();
  await expect(page.getByRole('heading', { name: 'پیگیری همین آفر' })).toBeVisible();
  await expect(page.getByText('مقصد اصلی')).toHaveCount(0);
  await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' }).click();
  await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
  expect(bodies.prepare).toEqual([{ product_id: 'p1', offer_id: 'o1', shop_id: 's1' }]);
});

test('a pending selection cannot replace the saved destination without an explicit review', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { prepare: [] });
  await openStores(page);
  await page.locator('#uv-shop-s2 .uv-card').getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await page.locator('#uv-shop-s2 .uv-card').getByRole('button', { name: 'برنامهٔ مراجعه', exact: true }).click();
  await expect(page.getByText('مقصد اصلی')).toBeVisible();
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await page.locator('#uv-shop-s1 .uv-card').first().getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await setBudget(page, '900000');
  await expect(page.getByRole('heading', { name: 'آفری با این شرایط در صفحهٔ بارگذاری‌شده نیست' })).toBeVisible();
  await page.getByRole('navigation', { name: 'مسیر خرید' }).getByRole('button', { name: /پیگیری و مراجعه/ }).click();
  await expect(page.getByRole('heading', { name: 'برنامهٔ مراجعه' })).toBeVisible();
  await expect(page.getByText('انتخاب فعلی با مقصد ثبت‌شده متفاوت است. این برنامه خودکار عوض نمی‌شود.')).toBeVisible();
  await expect(page.getByText('شرایط جست‌وجو، بودجه یا موقعیت تغییر کرده‌اند.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ثبت انتخاب فعلی به‌عنوان مقصد' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'نام نمایشی s2' })).toBeVisible();
  await expect(page.getByText('مقصد اصلی')).toBeVisible();
  // A reviewed, still-loaded selection may replace the destination only after explicit confirmation.
  await setBudget(page, '');
  await page.getByRole('navigation', { name: 'مسیر خرید' }).getByRole('button', { name: /فروشندگان/ }).click();
  await expect(page.locator('.uv-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'تأیید همین انتخاب' }).click();
  await page.getByRole('navigation', { name: 'مسیر خرید' }).getByRole('button', { name: /پیگیری و مراجعه/ }).click();
  await expect(page.getByRole('button', { name: 'ثبت انتخاب فعلی به‌عنوان مقصد' })).toBeEnabled();
  await page.getByRole('button', { name: 'ثبت انتخاب فعلی به‌عنوان مقصد' }).click();
  await expect(page.getByRole('article', { name: 'مقصد اصلی: نام نمایشی s1' })).toBeVisible();
});

test('the follow-up page separates saved work from a current confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bodies = { prepare: [] };
  await mockApi(page, bodies);
  await openStores(page);
  await page.locator('#uv-shop-s1 .uv-card').first().getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await setBudget(page, '1100000');
  await expect(page.locator('.uv-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'پیگیری انتخاب' }).click();
  await expect(page.getByText('شرایط جست‌وجو، بودجه یا موقعیت تغییر کرده‌اند.')).toBeVisible();
  await expect(page.getByText(/تأیید شرایط فعلی برای این آفر نیست/)).toBeVisible();
  await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' }).click();
  await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
  expect(bodies.prepare).toEqual([{ product_id: 'p1', offer_id: 'o1', shop_id: 's1' }]);
});

test('a compare offer that is still in the loaded page stays selectable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bodies = { prepare: [] };
  await mockApi(page, bodies);
  await openStores(page);
  await compareTwo(page);
  const summary = page.getByRole('region', { name: 'خلاصهٔ گزینه‌های مقایسه' });
  await summary.getByRole('button', { name: 'انتخاب و پیگیری آفر ۲' }).click();
  await expect(page.getByRole('heading', { name: 'پیگیری همین آفر' })).toBeVisible();
  await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' }).click();
  await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
  expect(bodies.prepare).toEqual([{ product_id: 'p1', offer_id: 'o2', shop_id: 's1' }]);
  await expect(page.getByText('مقصد اصلی')).toHaveCount(0);
});
