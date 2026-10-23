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
  await page.goto('/legacy.html');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('برای خرید تا ده میلیون تومان کمک می‌خواهم');
  await submit(page);
  await expect(page.getByText('چه نوع کالایی می‌خواهید؟', { exact: false })).toBeVisible();
  await expect(page.getByLabel('سقف بودجه (تومان)', { exact: true })).toHaveValue('10,000,000');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.active-filter-badge')).toContainText('۱۰٬۰۰۰٬۰۰۰');
  await expect(page.getByLabel('سقف بودجه (تومان)', { exact: true })).toHaveValue('10,000,000');
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
  await page.goto('/legacy.html');
  await page.getByLabel('سقف بودجه (تومان)', { exact: true }).fill('۷۳۳۵۱۸۹۴۰۷۴۷۲۹۸۹۴۴');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  await expect(page.locator('.product-card')).toHaveCount(1);
  expect(requests[0].max_price_toman).toBe('733518940747298944');
  await page.getByLabel('سقف بودجه (تومان)', { exact: true }).fill('-1');
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
  await page.goto('/legacy.html');
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
  await page.goto('/legacy.html');
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
  await expect(page.locator('.assistant-notice')).toContainText('موضوع فعلی: «کفش»');
});

test('disabled assistant does not prevent direct catalogue search', async ({ page }) => {
  await statusRoute(page, false);
  await page.route('**/api/products?**', route => route.fulfill({ json: products }));
  await page.goto('/legacy.html');
  await expect(page.getByText('دستیار فعلاً قابل استفاده نیست؛ جست‌وجوی مستقیم در دسترس است.')).toBeVisible();
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
});

test('synthetic assistant status retry re-checks without page refresh', async ({ page }) => {
  let mode = 'disabled';
  await page.route('**/api/assistant/status', route => route.fulfill({ json: mode === 'ready'
    ? { ready: true, reason: 'ready', remaining_calls: 3, attempt_limit: 3, model: 'synthetic-model' }
    : { ready: false, reason: 'disabled', remaining_calls: 0, attempt_limit: 3, model: 'synthetic-model' } }));
  await page.goto('/legacy.html');
  const retry = page.getByRole('button', { name: 'بررسی مجدد وضعیت دستیار', exact: true });
  await expect(page.getByText('دستیار فعلاً قابل استفاده نیست؛ جست‌وجوی مستقیم در دسترس است.')).toBeVisible();
  await expect(retry).toBeVisible();
  mode = 'ready';
  await retry.click();
  await expect(page.getByText(/درخواست باقی‌مانده در سقف تنظیم‌شده: ۳/)).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test('synthetic attempt limit shows its message without a retry button', async ({ page }) => {
  await page.route('**/api/assistant/status', route => route.fulfill({ json: {
    ready: false, reason: 'attempt_limit', remaining_calls: 0, attempt_limit: 3, model: 'synthetic-model' } }));
  await page.goto('/legacy.html');
  await expect(page.getByText(/سقف درخواست‌های تنظیم‌شدهٔ دستیار تمام شده است/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'بررسی مجدد وضعیت دستیار', exact: true })).toHaveCount(0);
});

test('synthetic assistant processing keeps previous successful results visible (R03)', async ({ page }) => {
  await statusRoute(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/products?**', route => route.fulfill({ json: products }));
  await page.route('**/api/assistant/turn', async route => {
    const request = route.request().postDataJSON();
    await gate;
    await route.fulfill({ json: searchResult(request) });
  });
  await page.goto('/legacy.html');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  // While the assistant processes, the previous results stay visible and processing is shown separately
  await expect(page.getByText('در حال بررسی درخواست…')).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText('گوشی آزمایشی');
  release();
  await expect(page.getByRole('button', { name: 'لغو درخواست', exact: true })).toHaveCount(0);
  await expect(page.locator('.product-card')).toHaveCount(1);
});

test('synthetic same-query budget clear keeps assistant topic and history (R03)', async ({ page }) => {
  await statusRoute(page);
  await page.route('**/api/products?**', route => route.fulfill({ json: products }));
  await page.route('**/api/assistant/turn', route => {
    const request = route.request().postDataJSON();
    return route.fulfill({ json: { ...searchResult(request), max_price_toman: '10000000' } });
  });
  await page.goto('/legacy.html');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  await expect(page.locator('.product-card')).toHaveCount(1);
  const clearBudget = page.getByRole('button', { name: 'حذف بودجه ✕', exact: true });
  await expect(clearBudget).toBeVisible();
  const topic = page.locator('.assistant-notice').filter({ hasText: 'موضوع فعلی:' });
  await expect(topic).toContainText('گوشی');
  await expect(page.locator('.assistant-history li')).toHaveCount(2);
  await clearBudget.click();
  await expect(clearBudget).toHaveCount(0);
  await expect(topic).toContainText('گوشی');
  await expect(page.locator('.assistant-history li')).toHaveCount(2);
  await expect(page.locator('.product-card')).toHaveCount(1);
});

test('result followups retain topic and budget, replace product, roll history and reset explicitly', async ({ page }) => {
  await statusRoute(page);
  const requests = [];
  await page.route('**/api/assistant/turn', route => {
    const request = route.request().postDataJSON();
    requests.push(request);
    const changedProduct = requests.length >= 3 && requests.length < 6;
    return route.fulfill({ json: { ...searchResult(request), query: changedProduct ? 'کفش کتانی' : 'گوشی',
      max_price_toman: requests.length === 1 ? '10000000' : '8000000' } });
  });
  await page.goto('/legacy.html');
  const need = page.getByLabel('نیاز و کاربرد موردنظر');
  const topic = page.locator('.assistant-notice').filter({ hasText: 'موضوع فعلی:' });
  for (const [index, text] of ['گوشی تا ده میلیون تومان', 'بودجه را هشت میلیون کن', 'حالا کفش کتانی می‌خواهم',
    'همان را می‌خواهم', 'بودجه همان هشت میلیون باشد'].entries()) {
    await need.fill(text);
    await submit(page);
    await expect(need).toHaveValue('');
    expect(requests).toHaveLength(index + 1);
    expect(requests[index].messages.length).toBeLessThanOrEqual(5);
    expect(requests[index].messages.map(m => m.role)).toEqual(index === 0 ? ['user']
      : index === 1 ? ['user', 'assistant', 'user'] : ['user', 'assistant', 'user', 'assistant', 'user']);
  }
  expect(requests[1].context_query).toBe('گوشی');
  expect(requests[1].max_price_toman).toBe('10000000');
  expect(requests[2].context_query).toBe('گوشی');
  expect(requests[2].max_price_toman).toBe('8000000');
  expect(requests[3].context_query).toBe('کفش کتانی');
  expect(requests[4].messages.some(m => m.content === 'گوشی تا ده میلیون تومان')).toBe(false);
  await expect(topic).toContainText('کفش کتانی');
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: path.resolve('../../.local/qa/assistant-context-mobile.png') });
  await page.getByRole('button', { name: 'گفت‌وگوی تازه', exact: true }).click();
  await expect(topic).toHaveCount(0);
  await expect(page.locator('.assistant-history')).toHaveCount(0);
  await expect(page.getByLabel('سقف بودجه (تومان)', { exact: true })).toHaveValue('8,000,000');
  await need.fill('گوشی');
  await submit(page);
  await expect(need).toHaveValue('');
  expect(requests[5].context_query).toBeNull();
  expect(requests[5].messages).toHaveLength(1);
  expect(requests[5].max_price_toman).toBe('8000000');
});

test('manual search provides context; an empty result and clarification retain it', async ({ page }) => {
  await statusRoute(page);
  await page.route('**/api/products?**', route => route.fulfill({ json: products }));
  const requests = [];
  await page.route('**/api/assistant/turn', route => {
    const request = route.request().postDataJSON();
    requests.push(request);
    return route.fulfill({ json: requests.length === 1
      ? { ...searchResult(request), status: 'needs_input', query: 'گوشی', products: null, question: 'سقف بودجه‌تان چند تومان است؟' }
      : { ...searchResult(request), status: 'no_evidence', max_price_toman: '0', products: { ...products, items: [] } } });
  });
  await page.goto('/legacy.html');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  const need = page.getByLabel('نیاز و کاربرد موردنظر');
  await need.fill('ارزان‌ترش را می‌خواهم');
  await submit(page);
  await expect(need).toHaveValue('');
  expect(requests[0].context_query).toBe('گوشی');
  await need.fill('بودجه را صفر کن');
  await submit(page);
  await expect(page.locator('.assistant-history')).toContainText('نتیجه‌ای ثبت نشده');
  await expect(page.locator('.assistant-notice')).toContainText('موضوع فعلی: «گوشی»');
  expect(requests[1].context_query).toBe('گوشی');
  await expect(page.getByLabel('سقف بودجه (تومان)', { exact: true })).toHaveValue('0');
});

test('long followups keep complete recent pairs within the API character bound', async ({ page }) => {
  await statusRoute(page);
  const requests = [];
  await page.route('**/api/assistant/turn', route => {
    const request = route.request().postDataJSON();
    requests.push(request);
    return route.fulfill({ json: searchResult(request) });
  });
  await page.goto('/legacy.html');
  const need = page.getByLabel('نیاز و کاربرد موردنظر');
  for (let i = 0; i < 3; i++) {
    await need.fill('گوشی ' + 'الف'.repeat(995));
    await submit(page);
    await expect(need).toHaveValue('');
  }
  expect(requests[2].context_query).toBe('گوشی');
  expect(requests[2].messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
  expect(requests[2].messages.reduce((size, m) => size + m.content.length, 0)).toBeLessThanOrEqual(3000);
});

test('new conversation resets removed category while keeping the visible budget', async ({ page }) => {
  await statusRoute(page);
  await page.route('**/api/products?**', route => {
    const cleared = new URL(route.request().url()).searchParams.get('category_cleared') === 'true';
    return route.fulfill({ json: { ...products, category_name: cleared ? null : 'گوشی موبایل' } });
  });
  let captured;
  await page.route('**/api/assistant/turn', route => {
    captured = route.request().postDataJSON();
    return route.fulfill({ json: { ...searchResult(captured), category_name: 'گوشی موبایل' } });
  });
  await page.goto('/legacy.html');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByLabel('سقف بودجه (تومان)', { exact: true }).fill('10000000');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'حذف فیلتر دسته', exact: true }).click();
  await expect(page.getByText('فیلتر دسته برداشته شد (جست‌وجو در تمام دسته‌ها)')).toBeVisible();
  await page.getByRole('button', { name: 'گفت‌وگوی تازه', exact: true }).click();
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await submit(page);
  await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toHaveValue('');
  expect(captured.context_query).toBeNull();
  expect(captured.context_category).toBeNull();
  expect(captured.category_cleared).toBe(false);
  expect(captured.max_price_toman).toBe('10000000');
});
