import { test, expect } from '@playwright/test';
import { cataloguePage, product, resultsTurn, noEvidenceTurn } from './fixtures.mjs';
import { offers, offer } from '../../unit/ui-base/fixtures.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const qa = fileURLToPath(new URL('../../../../.local/qa/ui-a/', import.meta.url));
mkdirSync(qa, { recursive: true });

async function directSearch(page, query) {
  await page.getByLabel('نام کالا در کاتالوگ').fill(query);
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'انتخاب محصول', exact: true })).toBeVisible();
}

async function setup(page, { emptyAssistant = false } = {}) {
  let posts = 0;
  await page.route('**/api/assistant/status', r => r.fulfill({ json: { ready: true, reason: 'ready', remaining_calls: 20 } }));
  await page.route('**/api/assistant/turn', r => {
    posts++;
    const response = emptyAssistant ? noEvidenceTurn() : resultsTurn();
    if (response.products.items.length) response.products.items[0].persian_title = 'محصول پاسخ دستیار';
    return r.fulfill({ json: { ...response, request_id: r.request().postDataJSON().request_id } });
  });
  await page.route('**/api/products?**', r => {
    const q = new URL(r.request().url()).searchParams.get('q');
    return r.fulfill({ json: cataloguePage([{ ...product(`manual-${q}`), persian_title: `نتیجه مستقیم ${q}` }]) });
  });
  await page.goto('/design.html');
  return () => posts;
}

test('assistant and direct results never replace each other by an implicit priority; returning preserves the chosen source', async ({ page }) => {
  const posts = await setup(page);
  await directSearch(page, 'کفش');
  await expect(page.getByRole('heading', { name: 'نتیجه مستقیم کفش' })).toBeVisible();
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن محصولات این پاسخ' }).click();
  await expect(page.getByText('نتیجهٔ دستیار', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'محصول پاسخ دستیار' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'نتیجه مستقیم کفش' })).toHaveCount(0);
  await page.getByText('توضیح و محدودیت‌های پاسخ', { exact: true }).click();
  await expect(page.getByText('تناسب کالا با نیاز تأیید نشده', { exact: true })).toBeVisible();
  await directSearch(page, 'لپ تاپ');
  await expect(page.getByText('نتیجهٔ جست‌وجوی مستقیم', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'محصول پاسخ دستیار' })).toHaveCount(0);
  await expect(page.getByText(/این جست‌وجو مستقل است/)).toBeVisible();
  await page.route('**/api/products/*/offers?**', r => r.fulfill({ json: offers([offer('o1', 's1', 'manual-لپ تاپ')]) }));
  await page.getByRole('button', { name: 'دیدن فروشندگان' }).click();
  await expect(page.locator('.ub-panel-top strong')).toHaveText('فروشندگان');
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await expect(page.getByRole('heading', { name: 'نتیجه مستقیم لپ تاپ' })).toBeVisible();
  expect(posts()).toBe(1);
});

test('stale conditions keep old cards labelled and disabled; explicit refresh failure can be retried without model calls', async ({ page }) => {
  const posts = await setup(page);
  await directSearch(page, 'گوشی');
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('سقف بودجه به تومان').fill('0');
  await dialog.getByRole('button', { name: 'اعمال شرایط' }).click();
  await expect(page.getByText(/کارت‌های زیر نتایج قبلی‌اند/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'دیدن فروشندگان' })).toBeDisabled();
  let calls = 0;
  await page.route('**/api/products?**', async r => {
    expect(new URL(r.request().url()).searchParams.get('max_price_toman')).toBe('0');
    calls++;
    if (calls === 1) return r.fulfill({ status: 503, json: { code: 'catalogue_unavailable' } });
    return r.fulfill({ json: cataloguePage([{ ...product(), persian_title: 'پاسخ بودجه صفر' }]) });
  });
  await page.getByRole('button', { name: 'جست‌وجو با شرایط فعلی' }).click();
  await expect(page.getByRole('alert')).toContainText('سرویس فعلاً در دسترس نیست');
  await expect(page.getByRole('heading', { name: 'نتیجه مستقیم گوشی' })).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'پاسخ بودجه صفر' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'دیدن فروشندگان' })).toBeEnabled();
  await expect(page.getByText(/کارت‌های زیر نتایج قبلی‌اند/)).toHaveCount(0);
  expect(posts()).toBe(0);
});

test('source prices, missing money, specs and nearest witness keep their distinct meanings', async ({ page }) => {
  await setup(page);
  await page.route('**/api/products?**', r => r.fulfill({ json: cataloguePage([
    { ...product(), persian_title: '<script>آزمون منبع</script>', image_urls: ['https://images.invalid/broken.png'],
      specs: [{ section: 'باتری', key: 'ظرفیت', value: '۵۰۰۰ میلی‌آمپرساعت' }],
      nearest_offer: { offer_id: 'near', product_id: 'p1', shop_id: 's1', price_toman: '9007199254740993',
        last_price_changed_at: '2026-10-22T10:00:00Z', inventory_status: 'unconfirmed', direct_distance_meters: 120 } },
    { ...product('p2'), persian_title: 'قیمت ثبت نشده', offer_summary: { offer_count: 1, min_price_toman: null, max_price_toman: null, missing_price_count: 1 } },
  ]) }));
  await page.route('https://images.invalid/**', r => r.abort());
  await directSearch(page, 'گوشی');
  const first = page.getByRole('article', { name: '<script>آزمون منبع</script>' });
  await expect(first.getByText('تصویر در دسترس نیست')).toBeVisible();
  await expect(first.locator('.ua-product-price')).toContainText('۰ تومان');
  await expect(first.locator('.ua-nearest-witness')).toContainText('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳');
  await expect(first.locator('.ua-nearest-witness')).toContainText('هوایی');
  await first.getByText('مشخصات ثبت‌شده در منبع', { exact: true }).click();
  await expect(first).toContainText('۵۰۰۰ میلی‌آمپرساعت');
  await expect(first.locator('script')).toHaveCount(0);
  const unknown = page.getByRole('article', { name: 'قیمت ثبت نشده', exact: true });
  await expect(unknown.locator('.ua-product-price')).not.toContainText('۰ تومان');
});

test('empty assistant results do not reveal a previous direct search', async ({ page }) => {
  await setup(page, { emptyAssistant: true });
  await directSearch(page, 'کفش');
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('کالا');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن محصولات این پاسخ' }).click();
  await expect(page.getByRole('heading', { name: 'با این عبارت و شرایط، نتیجه‌ای در کاتالوگ ثبت نشده' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('per-product evidence stays tied to its product and preserves negative source values', async ({ page }) => {
  await setup(page);
  await page.route('**/api/assistant/turn', r => {
    const response = resultsTurn();
    response.explanation.products = [{ product_id: 'p1', reasons: ['آفر ثبت‌شده در بودجه'], suitability: 'not_verified',
      budget_offer: { offer_id: 'budget1', product_id: 'p1', shop_id: 's1', price_toman: '10000000',
        last_price_changed_at: '2026-10-22T10:00:00Z', inventory_status: 'unconfirmed',
        selection_basis: 'lowest_recorded_qualifying_price_then_offer_id' },
      topics: [{ topic: 'camera', status: 'source_warning', summary: 'منبع، نبود دوربین را ثبت کرده است.', evidence_count: 1,
        evidence: [{ source_index: 0, section: 'دوربین', key: 'دوربین اصلی', value: 'بدون دوربین', state: 'negative' }] }] },
    { product_id: 'unrelated', reasons: ['شاهد کالای دیگر'], suitability: 'not_verified', budget_offer: null, topics: [] }];
    return r.fulfill({ json: { ...response, request_id: r.request().postDataJSON().request_id } });
  });
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی برای عکاسی');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن محصولات این پاسخ' }).click();
  await page.getByText('شواهد این پاسخ برای محصول', { exact: true }).click();
  const card = page.getByRole('article').first();
  await expect(card).toContainText('بدون دوربین');
  await expect(card.locator('.ua-budget-witness')).toContainText('۱۰٬۰۰۰٬۰۰۰ تومان');
  await expect(card).toContainText('تناسب کالا با کاربرد شما تأیید نشده است');
  await expect(page.getByText('شاهد کالای دیگر', { exact: true })).toHaveCount(0);
});

test('an earlier assistant answer cannot take over a newer direct search of the same text', async ({ page }) => {
  await setup(page);
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.route('**/api/assistant/turn', async r => {
    await new Promise(resolve => setTimeout(resolve, 250));
    try { await r.fulfill({ json: { ...resultsTurn(), request_id: r.request().postDataJSON().request_id } }); } catch { /* canceled browser request */ }
  });
  await page.route('**/api/products?**', async r => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await r.fulfill({ json: cataloguePage([{ ...product(), persian_title: 'نتیجه درخواست مستقیم تازه' }]) });
  });
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.getByText('در حال ارسال به دستیار…')).toBeVisible();
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'نتیجه درخواست مستقیم تازه' })).toBeVisible();
  await expect(page.getByText('نتیجهٔ جست‌وجوی مستقیم', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'محصول پاسخ دستیار' })).toHaveCount(0);
});

test('real snapshot results select the same product for the seller list without a model', async ({ page }) => {
  await page.route('**/api/assistant/turn', r => r.abort());
  await page.goto('/design.html');
  await directSearch(page, 'گوشی سامسونگ');
  const first = page.locator('.ua-product-card').first();
  await expect(first).toBeVisible();
  const title = await first.getByRole('heading').innerText();
  await page.screenshot({ path: `${qa}/results-real-390.png` });
  const responsePromise = page.waitForResponse(r => /\/api\/products\/[^/]+\/offers\?/.test(r.url()));
  await first.getByRole('button', { name: 'دیدن فروشندگان' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const data = await response.json();
  const productId = decodeURIComponent(new URL(response.url()).pathname.split('/')[3]);
  expect(data.items.length).toBeGreaterThan(0);
  expect(data.items.every(item => item.product_id === productId && item.inventory_status === 'unconfirmed')).toBe(true);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
});

for (const [width, height] of [[320, 568], [390, 844], [960, 844], [1440, 900]]) {
  test(`first product name, price and action are visible at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    await directSearch(page, 'گوشی');
    const card = page.getByRole('article').first();
    await expect(card.getByRole('heading')).toBeInViewport();
    await expect(card.locator('.ua-product-price')).toBeInViewport();
    await expect(card.getByRole('button', { name: 'دیدن فروشندگان' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: `${qa}/results-${width}-light.png`, animations: 'disabled' });
      await page.getByRole('combobox', { name: 'تم نمایش' }).selectOption('dark');
      await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
      await expect(card.getByRole('button', { name: 'دیدن فروشندگان' })).toBeEnabled();
      await page.screenshot({ path: `${qa}/results-${width}-dark.png`, animations: 'disabled' });
    }
  });
}
