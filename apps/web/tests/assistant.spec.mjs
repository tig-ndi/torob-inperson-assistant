// Model responses are mocked. Ordinary browser tests must NEVER spend API credit.
import { test, expect } from '@playwright/test';
import path from 'node:path';

const source = { currency: 'toman', inventory_status: 'unconfirmed' };
const product = { product_id: 'assistant_fixture', persian_title: 'گوشی آزمایشی', category_name: 'گوشی', brand_name: null,
  model: null, image_urls: [], specs: [], offer_summary: { offer_count: 1, min_price_toman: '8000000', max_price_toman: '8000000', missing_price_count: 0 } };
const products = { items: [product], has_more: false, provenance: source };
const searchResult = request => ({ request_id: request.request_id, status: 'results', query: 'گوشی',
  max_price_toman: request.max_price_toman, question: null, products, model: 'synthetic-model' });
async function statusRoute(page, ready = true) {
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { ready, reason: ready ? 'ready' : 'disabled',
    remaining_calls: ready ? 3 : 0, attempt_limit: 3, model: 'synthetic-model' } }));
}
const submit = page => page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();

test('synthetic assistant clarification, followup, exact budget, real cards and responsive history', async ({ page }) => {
  await statusRoute(page);
  const requests = [];
  await page.route('**/api/assistant/turn', route => {
    const request = route.request().postDataJSON();
    requests.push(request);
    return route.fulfill({ json: requests.length === 1
      ? { request_id: request.request_id, status: 'needs_input', query: null, max_price_toman: '10000000',
        question: 'چه نوع کالایی می‌خواهید؟', products: null, model: 'synthetic-model' }
      : { ...searchResult(request), max_price_toman: '10000000' } });
  });
  await page.goto('/');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('برای خرید تا ده میلیون تومان کمک می‌خواهم');
  await submit(page);
  await expect(page.getByText('چه نوع کالایی می‌خواهید؟', { exact: false })).toBeVisible();
  await expect(page.getByLabel('سقف بودجه (تومان - اختیاری)', { exact: true })).toHaveValue('10,000,000');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.active-filter-badge')).toContainText('۱۰٬۰۰۰٬۰۰۰');
  await expect(page.getByLabel('سقف بودجه (تومان - اختیاری)', { exact: true })).toHaveValue('10,000,000');
  expect(requests[1].messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
  expect(requests[1].max_price_toman).toBe('10000000');
  expect(requests[1].messages[1].content).toBe('چه نوع کالایی می‌خواهید؟');
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.assistant-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve('../../.local/qa/assistant-synthetic-mobile.png') });
});

test('synthetic assistant uses typed budget before manual search and rejects invalid input without a paid call', async ({ page }) => {
  await statusRoute(page);
  const requests = [];
  await page.route('**/api/assistant/turn', route => {
    const request = route.request().postDataJSON();
    requests.push(request);
    return route.fulfill({ json: searchResult(request) });
  });
  await page.goto('/');
  await page.getByLabel('سقف بودجه (تومان - اختیاری)', { exact: true }).fill('۷۳۳۵۱۸۹۴۰۷۴۷۲۹۸۹۴۴');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  await expect(page.locator('.product-card')).toHaveCount(1);
  expect(requests[0].max_price_toman).toBe('733518940747298944');
  await page.getByLabel('سقف بودجه (تومان - اختیاری)', { exact: true }).fill('-1');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی دوم');
  await submit(page);
  await expect(page.locator('#validation')).toBeVisible();
  expect(requests).toHaveLength(1);
});

test('synthetic assistant failure and malformed reply stay errors without automatic paid retry', async ({ page }) => {
  await statusRoute(page);
  let calls = 0;
  await page.route('**/api/assistant/turn', route => {
    calls++;
    const request = route.request().postDataJSON();
    return route.fulfill(calls === 1 ? { status: 503, json: { code: 'provider_timeout' } }
      : { json: { ...searchResult(request), request_id: 'wrong-request' } });
  });
  await page.goto('/');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  await expect(page.locator('.assistant-panel [role="alert"]')).toContainText('پاسخ دستیار به‌موقع نرسید');
  expect(calls).toBe(1);
  await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toHaveValue('گوشی');
  await submit(page);
  await expect(page.locator('.assistant-panel [role="alert"]')).toContainText('پاسخ دستیار به این درخواست معتبر نیست');
  expect(calls).toBe(2);
  await expect(page.locator('.product-card')).toHaveCount(0);
});

test('synthetic delayed assistant cannot replace newer manual search; cancellation remains explicit', async ({ page }) => {
  await statusRoute(page);
  let release;
  let received;
  const started = new Promise(resolve => { received = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/assistant/turn', async route => {
    const request = route.request().postDataJSON();
    received();
    await gate;
    await route.fulfill({ json: searchResult(request) });
  });
  await page.route('**/api/products?**', route => route.fulfill({ json: { ...products,
    items: [{ ...product, product_id: 'manual_product', persian_title: 'کفش دستی' }] } }));
  await page.goto('/');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  await started;
  await expect(page.getByRole('button', { name: 'لغو درخواست', exact: true })).toBeVisible();
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('کفش');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.product-card')).toContainText('کفش دستی');
  release();
  await expect(page.getByRole('button', { name: 'لغو درخواست', exact: true })).toHaveCount(0);
  await expect(page.locator('.product-card')).toContainText('کفش دستی');
});

test('disabled assistant does not prevent direct catalogue search', async ({ page }) => {
  await statusRoute(page, false);
  await page.route('**/api/products?**', route => route.fulfill({ json: products }));
  await page.goto('/');
  await expect(page.getByText('دستیار فعلاً قابل استفاده نیست؛ جست‌وجوی مستقیم در دسترس است.')).toBeVisible();
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
});
