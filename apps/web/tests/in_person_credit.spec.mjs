import { test, expect } from '@playwright/test';
import path from 'node:path';
import { HOURS_CHECKED_AT, syntheticHours } from './fixtures/hours.mjs';
import { syntheticCredit, unknownCredit } from './fixtures/credit.mjs';

const product = { product_id: 'credit_synthetic_product', persian_title: 'کالای آزمایشی اعتبار',
  brand_name: null, model: null, category_name: 'گوشی', specs: [], image_urls: [],
  offer_summary: { offer_count: 4, min_price_toman: '1000', max_price_toman: '1000', missing_price_count: 0 } };
const source = { currency: 'toman', inventory_status: 'unconfirmed' };
const filterName = 'فقط آفرهای منطبق با شرایط ثبت‌شدهٔ خرید اعتباری حضوری';
function offer(id, credit, price = '1000') {
  return { offer_id: id, product_id: product.product_id, shop_id: 'same_shop', price_toman: price,
    price_quality: price === null ? 'missing' : 'not_assessed', last_price_changed_at: null,
    seller_title: null, description: null, warranty: null, inventory_status: 'unconfirmed',
    direct_distance_meters: 0, opening_hours: syntheticHours('declared_open'), in_person_credit: credit,
    shop: { name: 'فروشگاه آزمایشی', address: null, location_label: null, lat: 35.7, lon: 51.4 } };
}
const unknownChannel = { ...syntheticCredit().options[0], option_index: 1, channel: 'unknown', status: 'unknown', reason: 'channel_unknown' };
const matching = syntheticCredit({ options: [syntheticCredit().options[0], unknownChannel] });
const mismatch = syntheticCredit({ status: 'does_not_match', reason: 'all_recorded_options_mismatch', options: [{
  ...syntheticCredit().options[0], min_price_toman: '733518940747298944', max_price_toman: '733518940747298945',
  category_names: ['گوشی'], status: 'does_not_match', reason: 'below_minimum' }] });
const offers = [offer('match_1', matching), offer('match_2', syntheticCredit()),
  offer('mismatch', mismatch), offer('unknown', unknownCredit(), null)];
const pageBody = (items, offset = 0, has_more = false) => ({ items, has_more, limit: 10, offset,
  provenance: source, hours_evaluated_at: HOURS_CHECKED_AT });

async function openSynthetic(page, budget = false) {
  await page.route('**/api/products?**', route => route.fulfill({ json: { items: [product], has_more: false, provenance: source } }));
  await page.goto('/legacy.html');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('آزمایشی');
  if (budget) await page.getByLabel('سقف بودجه (تومان)', { exact: true }).fill('۱۰۰۰۰');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.locator('.product-card .secondary-btn').click();
  return page.getByRole('dialog', { name: 'آفرهای فروشندگان' });
}

test('synthetic credit disclosures, exact amounts, combined filters, pagination and responsive layout', async ({ page }) => {
  const queries = [];
  await page.route(`**/api/products/${product.product_id}/offers?**`, route => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    const filtered = params.get('in_person_credit_only') === 'true';
    const offset = Number(params.get('offset'));
    const items = filtered ? (offset === 0 ? offers.slice(0, 2) : [offers[0]]) : offers;
    return route.fulfill({ json: pageBody(items, offset, filtered && offset === 0) });
  });
  const modal = await openSynthetic(page, true);
  await expect(modal.locator('.offer-card')).toHaveCount(4);
  await expect(modal.locator('.credit-status')).toHaveText([
    'منطبق با شرایط ثبت‌شدهٔ خرید اعتباری حضوری', 'منطبق با شرایط ثبت‌شدهٔ خرید اعتباری حضوری',
    'شرایط ثبت‌شده با این آفر تطابق ندارند', 'وضعیت خرید اعتباری حضوری نامشخص']);
  await modal.locator('.credit-conditions summary').first().click();
  await expect(modal.locator('.credit-options').first().locator('li')).toHaveCount(2);
  await expect(modal.getByText('حضوری بودن این روش در منبع مشخص نشده است')).toBeVisible();
  await expect(modal.getByText('محدودیت دسته در منبع ثبت نشده است').first()).toBeVisible();
  await expect(modal.getByText(/تأیید اعتبار شخص، پرداخت یا پذیرش فروشنده نیست/).first()).toBeVisible();
  await modal.locator('.credit-conditions summary').nth(2).click();
  await expect(modal.locator('.credit-options').nth(2)).toContainText('۷۳۳٬۵۱۸٬۹۴۰٬۷۴۷٬۲۹۸٬۹۴۴');
  await expect(modal.locator('.credit-options').nth(2)).toContainText('۷۳۳٬۵۱۸٬۹۴۰٬۷۴۷٬۲۹۸٬۹۴۵');
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await modal.locator('.credit-conditions').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('../../.local/qa/credit-synthetic-mobile.png') });
  await modal.locator('.offers-filters > summary').click();
  await modal.getByLabel(filterName).check();
  await expect(modal.locator('.offer-card')).toHaveCount(2);
  expect(queries.at(-1).get('max_price_toman')).toBe('10000');
  await modal.getByRole('button', { name: 'صفحهٔ بعد', exact: true }).click();
  await expect(modal.locator('.offer-card')).toHaveCount(1);
  expect(queries.at(-1).get('offset')).toBe('10');
  await modal.getByLabel('فقط فروشگاه‌هایی که طبق ساعات ثبت‌شده اکنون بازند').check();
  await expect(modal.locator('.offer-card')).toHaveCount(2);
  expect(queries.at(-1).get('offset')).toBe('0');
  expect(queries.at(-1).get('in_person_credit_only')).toBe('true');
  await modal.getByLabel('عرض جغرافیایی (lat)', { exact: true }).fill('35.7');
  await modal.getByLabel('طول جغرافیایی (lon)', { exact: true }).fill('51.4');
  await modal.getByLabel('شعاع جست‌وجو', { exact: true }).selectOption('5');
  await modal.getByRole('button', { name: 'اعمال فیلتر محدوده', exact: true }).click();
  await expect(modal.locator('.offer-card')).toHaveCount(2);
  expect(queries.at(-1).get('max_distance_km')).toBe('5');
  expect(queries.at(-1).get('open_now_only')).toBe('true');
  expect(queries.at(-1).get('in_person_credit_only')).toBe('true');
  await modal.getByLabel(filterName).uncheck();
  await expect(modal.locator('.offer-card')).toHaveCount(4);
  expect(queries.at(-1).has('in_person_credit_only')).toBe(false);
  expect(queries.at(-1).get('max_distance_km')).toBe('5');
});

test('synthetic credit empty, failure, retry, malformed response and unknown channel stay distinct', async ({ page }) => {
  let mode = 'valid';
  const queries = [];
  const channelOnly = syntheticCredit({ status: 'unknown', reason: 'incomplete_conditions', options: [{ ...unknownChannel, option_index: 0 }] });
  await page.route(`**/api/products/${product.product_id}/offers?**`, route => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    if (mode === 'failed') return route.fulfill({ status: 503, json: { detail: 'synthetic failure' } });
    const credit = mode === 'malformed' ? { ...channelOnly, options: null } : channelOnly;
    return route.fulfill({ json: pageBody(params.has('in_person_credit_only') && mode !== 'malformed' ? [] : [offer('unknown_channel', credit)]) });
  });
  const modal = await openSynthetic(page);
  await expect(modal.locator('.credit-status')).toHaveText('وضعیت خرید اعتباری حضوری نامشخص');
  await modal.locator('.credit-conditions summary').click();
  await expect(modal.getByText('حضوری بودن این روش در منبع مشخص نشده است')).toBeVisible();
  await modal.locator('.offers-filters > summary').click();
  await modal.getByLabel(filterName).check();
  await expect(modal.getByText('هیچ آفری با شرایط انتخابی یافت نشد')).toBeVisible();
  await expect(modal.getByText(/می‌توانید فیلتر اعتباری را بردارید/)).toBeVisible();
  mode = 'failed';
  await modal.getByRole('button', { name: 'به‌روزرسانی وضعیت ساعت', exact: true }).click();
  await expect(modal.getByText('خطا در دریافت آفرها', { exact: true })).toBeVisible();
  mode = 'valid';
  await modal.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(modal.getByText('هیچ آفری با شرایط انتخابی یافت نشد')).toBeVisible();
  expect(queries.at(-1).get('in_person_credit_only')).toBe('true');
  mode = 'malformed';
  await modal.getByRole('button', { name: 'به‌روزرسانی وضعیت ساعت', exact: true }).click();
  await expect(modal.getByText('خطا در دریافت آفرها', { exact: true })).toBeVisible();
  await expect(modal.getByText('هیچ آفری با شرایط انتخابی یافت نشد')).toHaveCount(0);
});

test('real dataset credit display and filter through isolated API', async ({ page }) => {
  await page.goto('/legacy.html');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.locator('.product-card .secondary-btn').first().click();
  const modal = page.getByRole('dialog', { name: 'آفرهای فروشندگان' });
  await expect(modal.locator('.offer-card').first()).toBeVisible();
  const original = await modal.locator('.offer-card').count();
  await expect(modal.locator('.credit-conditions')).toHaveCount(original);
  await modal.locator('.offers-filters > summary').click();
  await modal.getByLabel(filterName).check();
  await expect(modal.locator('.state-panel[role="status"]')).toHaveCount(0);
  await expect(modal.getByText('خطا در دریافت آفرها', { exact: true })).toHaveCount(0);
  const count = await modal.locator('.offer-card').count();
  if (count) await expect(modal.locator('.credit-status')).toHaveText(Array(count).fill('منطبق با شرایط ثبت‌شدهٔ خرید اعتباری حضوری'));
  else await expect(modal.getByText('هیچ آفری با شرایط انتخابی یافت نشد')).toBeVisible();
  await modal.getByLabel(filterName).uncheck();
  await expect(modal.locator('.offer-card')).toHaveCount(original);
});
