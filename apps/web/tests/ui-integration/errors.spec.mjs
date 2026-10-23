import { test, expect } from '@playwright/test';
import { resultsTurn, cataloguePage, product } from '../ui-a/fixtures.mjs';
import { page as productPage, offer, offers, alternatives as alternativeResponse, tileOk } from '../ui-b/fixtures.mjs';

async function setup(page, handler) {
  const calls = { status: 0, turns: 0 };
  await page.route('**/api/assistant/status', r => {
    calls.status++;
    return r.fulfill({ json: { ready: true, reason: 'ready', remaining_calls: 20 } });
  });
  await page.route('**/api/assistant/turn', r => { calls.turns++; return handler(r, calls.turns); });
  await page.goto('/');
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeDisabled();
  await expect(page.locator('.ua-status')).toContainText('آمادهٔ بررسی');
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  return calls;
}
function success(route) { return route.fulfill({ json: { ...resultsTurn(), request_id: route.request().postDataJSON().request_id } }); }

for (const [code, status] of [['attempt_limit', 429], ['disabled', 503], ['missing_key', 503], ['invalid_config', 503]]) {
  test(`turn ${code} remains blocked despite a ready background GET, until explicit recheck`, async ({ page }) => {
    const calls = await setup(page, (r, count) => count === 1
      ? r.fulfill({ status, json: { code, detail: 'PRIVATE_PAYLOAD_SENTINEL' } }) : success(r));
    await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
    await expect.poll(() => calls.status).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.ua-status')).toHaveClass(/blocked/);
    await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toHaveValue('گوشی');
    await expect(page.getByRole('alert')).not.toContainText('PRIVATE_PAYLOAD_SENTINEL');
    expect(calls.turns).toBe(1);
    await page.getByRole('button', { name: 'بررسی مجدد وضعیت', exact: true }).click();
    await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeEnabled();
    expect(calls.turns).toBe(1);
    await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
    await expect(page.locator('.ua-outcome')).toBeVisible();
    expect(calls.turns).toBe(2);
  });
}

test('network failure keeps the draft, makes no automatic retry, and explicit retry can succeed', async ({ page }) => {
  const calls = await setup(page, (r, count) => count === 1 ? r.abort() : success(r));
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('ارتباط برقرار نشد');
  await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toHaveValue('گوشی');
  await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeVisible();
  await page.waitForTimeout(150);
  expect(calls.turns).toBe(1);
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.locator('.ua-outcome')).toBeVisible();
  await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toHaveValue('');
  expect(calls.turns).toBe(2);
});

test('provider rate limiting is not described as an exhausted configured attempt cap', async ({ page }) => {
  const calls = await setup(page, r => r.fulfill({ status: 429, json: { code: 'provider_rate_limit' } }));
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('سرویس مدل موقتاً');
  await expect(page.getByRole('alert')).not.toContainText('سقف درخواست');
  await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toBeVisible();
  expect(calls.turns).toBe(1);
});

test('a blocked turn is not unlocked by editing conditions or starting a new conversation', async ({ page }) => {
  const calls = await setup(page, (r, count) => count === 1 ? success(r)
    : r.fulfill({ status: 429, json: { code: 'attempt_limit' } }));
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.locator('.ua-outcome')).toBeVisible();
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('بودجه را تغییر بده');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.locator('.ua-status')).toHaveClass(/blocked/);
  await page.getByRole('button', { name: 'بودجه و شرایط', exact: true }).click();
  await page.getByLabel('سقف بودجه به تومان').fill('5000000');
  await page.getByRole('button', { name: 'اعمال شرایط', exact: true }).click();
  await expect(page.locator('.ua-status')).toHaveClass(/blocked/);
  await page.getByRole('button', { name: 'گفت‌وگوی تازه', exact: true }).click();
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی تازه');
  await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeDisabled();
  expect(calls.turns).toBe(2);
});

test('contract failure keeps old catalogue results and is never rendered as a successful empty page', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/products?**', r => {
    requests++;
    return r.fulfill({ json: requests === 1 ? cataloguePage([product()]) : { items: 'malformed' } });
  });
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.ua-product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('قرارداد داده');
  await expect(page.locator('.ua-product-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toHaveCount(0);
  await expect(page.getByText('با این عبارت و شرایط، نتیجه‌ای در کاتالوگ ثبت نشده', { exact: true })).toHaveCount(0);
});

test('an incompatible alternative page offers a fresh collection instead of retrying that invalid continuation', async ({ page }) => {
  const offsets = [];
  await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/svg+xml', body: tileOk }));
  await page.route('**/api/products?**', r => r.fulfill({ json: productPage() }));
  await page.route('**/api/products/p1/offers?**', r => r.fulfill({ json: offers([offer()]) }));
  await page.route('**/api/followups/alternatives', r => {
    const body = r.request().postDataJSON(); offsets.push(body.offset);
    const value = alternativeResponse(offer(), offer(offsets.length === 3 ? 'new' : 'a1', 's2'));
    value.alternatives.offset = body.offset;
    value.alternatives.has_more = offsets.length === 1;
    if (offsets.length > 1) value.alternatives.provenance = { ...value.alternatives.provenance, snapshot_id: 'changed' };
    return r.fulfill({ json: value });
  });
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه', exact: true }).click();
  await page.getByRole('button', { name: 'جایگزین‌های بیشتر', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('نسخهٔ کاتالوگ تغییر');
  await expect(page.locator('#uv-alternative-a1')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'تلاش مجدد', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'جایگزین‌های بیشتر', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'دریافت دوبارهٔ جایگزین‌ها از ابتدا', exact: true }).click();
  await expect(page.locator('#uv-alternative-new')).toHaveCount(1);
  await expect(page.locator('#uv-alternative-a1')).toHaveCount(0);
  expect(offsets).toEqual([0, 20, 0]);
});
