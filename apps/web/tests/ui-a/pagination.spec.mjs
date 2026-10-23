import { test, expect } from '@playwright/test';
import { product, cataloguePage, resultsTurn } from './fixtures.mjs';
import { offers, offer } from '../../unit/ui-base/fixtures.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const qa = fileURLToPath(new URL('../../../../.local/qa/ui-a/', import.meta.url));
mkdirSync(qa, { recursive: true });

function firstPage() {
  return cataloguePage(Array.from({ length: 12 }, (_, i) => ({ ...product(`p${i + 1}`), persian_title: `محصول اولیه ${i + 1}` })), true);
}
function secondPage() {
  return { ...cataloguePage([{ ...product('p12'), persian_title: 'محصول اولیه 12' }, { ...product('p13'), persian_title: 'محصول صفحه بعد' }]), offset: 12 };
}
async function search(page) {
  await page.goto('/design.html');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.ua-product-card')).toHaveCount(12);
}

test('manual pagination retries the same failed offset, preserves cards, deduplicates IDs and retains the page on return', async ({ page }) => {
  const offsets = []; let fail = true; let posts = 0;
  await page.route('**/api/assistant/turn', r => { posts++; return r.abort(); });
  await page.route('**/api/products?**', r => {
    const params = new URL(r.request().url()).searchParams;
    const offset = Number(params.get('offset')); offsets.push(offset);
    if (offset === 0) return r.fulfill({ json: firstPage() });
    expect(params.get('q')).toBe('گوشی');
    expect(params.get('limit')).toBe('12');
    expect(params.get('category_name')).toBe('گوشی موبایل');
    if (fail) { fail = false; return r.fulfill({ status: 503, json: { code: 'catalogue_unavailable' } }); }
    return r.fulfill({ json: secondPage() });
  });
  await page.route('**/api/products/p13/offers?**', r => r.fulfill({ json: offers([offer('o13', 's13', 'p13')]) }));
  await search(page);
  await page.getByRole('button', { name: 'محصولات بیشتر', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('سرویس فعلاً در دسترس نیست');
  await expect(page.locator('.ua-product-card')).toHaveCount(12);
  expect(offsets).toEqual([0, 12]);
  await page.screenshot({ path: `${qa}/pagination-error-390.png`, animations: 'disabled' });
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.locator('.ua-product-card')).toHaveCount(13);
  expect(offsets).toEqual([0, 12, 12]);
  const added = page.getByRole('article', { name: 'محصول صفحه بعد' });
  await expect(added.getByRole('heading')).toBeFocused();
  await expect(added.getByRole('heading')).toBeInViewport();
  await page.screenshot({ path: `${qa}/pagination-loaded-390.png`, animations: 'disabled' });
  await expect(page.getByText('پایان نتایج ثبت‌شده با این شرایط.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'محصولات بیشتر', exact: true })).toHaveCount(0);
  await added.getByRole('button', { name: 'دیدن فروشندگان' }).click();
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await expect(page.locator('.ua-product-card')).toHaveCount(13);
  expect(posts).toBe(0);
});

test('assistant pages preserve cleared category, battery, exact budget, nearest and position without a second model call', async ({ page }) => {
  let posts = 0; let nextParams;
  await page.route('**/api/assistant/status', r => r.fulfill({ json: { ready: true, reason: 'ready', remaining_calls: 20 } }));
  await page.route('**/api/assistant/turn', r => {
    posts++;
    const turn = resultsTurn({ need: { max_price_toman: '9007199254740993', category_cleared: true, offer_sort: 'nearest',
      battery_requirement: { status: 'minimum', minimum_mah: 5000 } } });
    turn.category_name = null;
    turn.products = { ...firstPage(), category_name: null, min_battery_capacity_mah: 5000 };
    return r.fulfill({ json: { ...turn, request_id: r.request().postDataJSON().request_id } });
  });
  await page.route('**/api/products?**', r => {
    nextParams = new URL(r.request().url()).searchParams;
    return r.fulfill({ json: { ...secondPage(), category_name: null, min_battery_capacity_mah: 5000 } });
  });
  await page.goto('/design.html');
  await page.getByRole('button', { name: 'انتخاب موقعیت', exact: false }).click();
  const location = page.getByRole('dialog', { name: 'موقعیت جست‌وجو' });
  await location.getByLabel('عرض جغرافیایی').fill('35.7');
  await location.getByLabel('طول جغرافیایی').fill('51.4');
  await location.getByRole('button', { name: 'انتخاب این نقطه' }).click();
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی با حداقل باتری');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن محصولات این پاسخ' }).click();
  await page.getByRole('button', { name: 'محصولات بیشتر', exact: true }).click();
  await expect(page.locator('.ua-product-card')).toHaveCount(13);
  expect(Object.fromEntries(nextParams)).toMatchObject({ q: 'گوشی', offset: '12', limit: '12', max_price_toman: '9007199254740993',
    category_cleared: 'true', min_battery_capacity_mah: '5000', sort_by: 'nearest', user_lat: '35.7', user_lon: '51.4' });
  expect(nextParams.has('category_name')).toBe(false);
  await expect(page.getByText('نتیجهٔ دستیار', { exact: true })).toBeVisible();
  await page.getByText('توضیح و محدودیت‌های پاسخ', { exact: true }).click();
  await expect(page.getByText(/این توضیح مربوط به پاسخ نخست دستیار است/)).toBeVisible();
  expect(posts).toBe(1);
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await page.locator('.ua-history > summary').click();
  await expect(page.locator('.ua-history')).toContainText('گوشی با حداقل باتری');
});

test('a late next page after budget change is discarded and the old offset is not advanced', async ({ page }) => {
  const offsets = [];
  await page.route('**/api/products?**', async r => {
    const params = new URL(r.request().url()).searchParams, offset = Number(params.get('offset')); offsets.push(offset);
    if (offset === 0) return r.fulfill({ json: firstPage() });
    await new Promise(resolve => setTimeout(resolve, 700));
    try { await r.fulfill({ json: secondPage() }); } catch { /* user changed conditions and canceled this request */ }
  });
  await search(page);
  await page.getByRole('button', { name: 'محصولات بیشتر', exact: true }).click();
  await expect(page.getByRole('button', { name: 'در حال دریافت محصولات بیشتر…' })).toBeDisabled();
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('سقف بودجه به تومان').fill('0');
  await dialog.getByRole('button', { name: 'اعمال شرایط' }).click();
  await expect(page.getByText(/کارت‌های زیر نتایج قبلی‌اند/)).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.locator('.ua-product-card')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'محصولات بیشتر', exact: true })).toBeDisabled();
  expect(offsets).toEqual([0, 12]);
});

test('a different snapshot is an explicit recoverable failure and never contaminates current cards', async ({ page }) => {
  await page.route('**/api/products?**', r => {
    if (new URL(r.request().url()).searchParams.get('offset') === '0') return r.fulfill({ json: firstPage() });
    const next = secondPage(); next.provenance = { ...next.provenance, snapshot_id: 'different' };
    return r.fulfill({ json: next });
  });
  await search(page);
  await page.getByRole('button', { name: 'محصولات بیشتر', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('نسخهٔ کاتالوگ تغییر کرده است');
  await expect(page.locator('.ua-product-card')).toHaveCount(12);
  await expect(page.getByRole('heading', { name: 'محصول صفحه بعد' })).toHaveCount(0);
  await page.getByRole('button', { name: 'از نو جست‌وجو کن' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.ua-product-card')).toHaveCount(12);
});

test('an empty terminal page keeps previous cards and moves keyboard focus away from the removed more button', async ({ page }) => {
  await page.route('**/api/products?**', r => r.fulfill({ json:
    new URL(r.request().url()).searchParams.get('offset') === '0' ? firstPage() : { ...cataloguePage([]), offset: 12 } }));
  await search(page);
  await page.getByRole('button', { name: 'محصولات بیشتر', exact: true }).click();
  await expect(page.locator('.ua-product-card')).toHaveCount(12);
  await expect(page.getByText('پایان نتایج ثبت‌شده با این شرایط.', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'محصول بارگذاری‌شده' })).toBeFocused();
});

test('real snapshot continuation uses the same query and does not repeat product IDs', async ({ page }) => {
  await page.route('**/api/assistant/turn', r => r.abort());
  await page.goto('/design.html');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.ua-product-card')).toHaveCount(12);
  const firstIds = await page.locator('.ua-product-card h3').evaluateAll(nodes => nodes.map(n => n.id));
  const response = page.waitForResponse(r => {
    const url = new URL(r.url()); return url.pathname === '/api/products' && url.searchParams.get('offset') === '12';
  });
  await page.getByRole('button', { name: 'محصولات بیشتر', exact: true }).click();
  const next = await response;
  expect(next.ok()).toBe(true);
  const data = await next.json();
  expect(data.items.length).toBe(12);
  await expect(page.locator('.ua-product-card')).toHaveCount(24);
  const allIds = await page.locator('.ua-product-card h3').evaluateAll(nodes => nodes.map(n => n.id));
  expect(allIds.slice(0, 12)).toEqual(firstIds);
  expect(new Set(allIds).size).toBe(24);
});
