import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offer, offers, page as productPage, alternatives, noAlternatives, tileOk } from './fixtures.mjs';

const qa = fileURLToPath(new URL('../../../../.local/qa/p5-trip/', import.meta.url));
mkdirSync(qa, { recursive: true });

const primary = offer('o1', 's1');
const alternative = offer('o3', 's2');
const rows = [primary, alternative];

async function mockApi(page, bodies, options = {}) {
  bodies.alternatives ??= [];
  bodies.model ??= 0;
  let failNext = options.failFirst === true;
  await page.route('**/api/products?**', route => route.fulfill({ json: productPage() }));
  await page.route('**/api/products/p1/offers?**', route => route.fulfill({ json: offers(rows) }));
  await page.route('**/api/followups/alternatives', route => {
    const body = route.request().postDataJSON();
    bodies.alternatives.push(body);
    if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { code: 'catalogue_unavailable' } }); }
    if (options.empty) return route.fulfill({ json: noAlternatives(primary, body.outcome, body.outcome_source) });
    return route.fulfill({ json: alternatives(primary, alternative, body.outcome, body.outcome_source) });
  });
  await page.route('**/api/assistant/turn', route => {
    bodies.model += 1;
    return route.fulfill({ status: 503, json: { code: 'assistant_disabled' } });
  });
  await page.route('**/tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: tileOk }));
}

async function openStores(page) {
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان' }).click();
  await expect(page.locator('.uv-card')).toHaveCount(2);
}

async function planPrimary(page) {
  await page.locator('#uv-shop-s1 .uv-card').getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await page.locator('#uv-shop-s1 .uv-card').getByRole('button', { name: 'برنامهٔ مراجعه', exact: true }).click();
  await expect(page.getByText('مقصد اصلی')).toBeVisible();
}

async function report(page, source = 'user_report') {
  await page.getByRole('button', { name: 'پیگیری انتخاب' }).click();
  if (source === 'user_report') await page.getByLabel(/گزارش خودم از مراجعه/).check();
  await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه' }).click();
  await expect(page.getByRole('heading', { name: 'جایگزین‌های همین محصول' })).toBeVisible();
}

async function openTrip(page) {
  await page.getByRole('navigation', { name: 'مسیر خرید' }).getByRole('button', { name: /پیگیری و مراجعه/ }).click();
  await expect(page.getByRole('heading', { name: 'برنامهٔ مراجعه' })).toBeVisible();
}

test('a recorded report keeps its source and the explicit trip alternative stays independent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bodies = {};
  await mockApi(page, bodies);
  await openStores(page);
  await planPrimary(page);
  await report(page, 'user_report');
  await expect(page.getByText('منبع: گزارش خودم از مراجعه', { exact: true })).toBeVisible();
  expect(bodies.alternatives[0]).toMatchObject({ product_id: 'p1', offer_id: 'o1', shop_id: 's1',
    outcome_source: 'user_report' });
  // Changing the form source does not change the recorded result.
  await page.locator('input[name=uv-source]').first().check();
  await expect(page.getByText('منبع: گزارش خودم از مراجعه', { exact: true })).toBeVisible();
  await page.locator('input[name=uv-source]').nth(1).check();
  await expect(page.getByText('منبع: گزارش خودم از مراجعه', { exact: true })).toBeVisible();
  expect(await page.locator('a[href^="tel:"], a[href*="wa.me"], a[href*="whatsapp"]').count()).toBe(0);

  await openTrip(page);
  await expect(page.getByRole('heading', { name: 'افزودن جایگزین از نتیجهٔ پیگیری' })).toBeVisible();
  await expect(page.getByRole('article', { name: /^جایگزین:/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'افزودن به‌عنوان جایگزین' }).click();
  const primaryCard = page.getByRole('article', { name: 'مقصد اصلی: نام نمایشی s1' });
  const alternativeCard = page.getByRole('article', { name: 'جایگزین: نام نمایشی s2' });
  await expect(primaryCard).toBeVisible();
  await expect(alternativeCard).toBeVisible();
  await expect(alternativeCard.getByText('منبع انتخاب: گزارش خودم', { exact: true })).toBeVisible();
  // Each card keeps the price and shop of its own offer; the alternative is not folded into the primary.
  expect((await primaryCard.locator('.ub-price').textContent())?.replace(/[^۰-۹]/g, '')).toBe('۱۰۰۰۰۰۰');
  expect((await alternativeCard.locator('.ub-price').textContent())?.replace(/[^۰-۹]/g, '')).toBe('۲۵۰۰۰۰۰');
  await expect(primaryCard.getByText('نام نمایشی s1', { exact: false })).toBeVisible();
  await expect(alternativeCard.getByText('نام نمایشی s2', { exact: false })).toBeVisible();
  const hoursMetric = primaryCard.locator('.uv-metric').filter({ hasText: 'ساعت اعلامی' });
  await expect(hoursMetric.locator('strong')).toHaveText('نامشخص');
  await expect(primaryCard.getByText('؛ ساعت نامعلوم به معنی بسته‌بودن نیست.')).toBeVisible();
  await expect(page.getByText('بسته', { exact: true })).toHaveCount(0);
  const evidence = alternativeCard.locator('.uv-evidence');
  await expect(evidence.locator('dt')).toHaveText(['پاساژ', 'طبقه', 'واحد']);
  await expect(evidence).toContainText('نمونه');
  await expect(evidence).toContainText('دوم');
  await expect(evidence).toContainText('۱۲');
  await expect(evidence.locator('small')).toHaveCount(3);
  await expect(alternativeCard.getByText(/شاهد در متن آدرس/)).toHaveCount(3);
  expect(await page.locator('a[href^="tel:"], a[href*="wa.me"], a[href*="whatsapp"]').count()).toBe(0);
  expect(bodies.model).toBe(0);

  // Removing the alternative keeps the primary destination.
  await alternativeCard.getByRole('button', { name: 'حذف جایگزین' }).click();
  await expect(page.getByRole('article', { name: /^جایگزین:/ })).toHaveCount(0);
  await expect(primaryCard).toBeVisible();
  await expect(page.getByRole('heading', { name: 'افزودن جایگزین از نتیجهٔ پیگیری' })).toBeVisible();
  await page.getByRole('button', { name: 'افزودن به‌عنوان جایگزین' }).click();
  await expect(alternativeCard).toBeVisible();

  // In-app screen navigation also keeps the plan and the recorded source.
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await expect(page.getByRole('heading', { name: 'پیگیری همین آفر' })).toBeVisible();
  await expect(page.getByText('منبع: گزارش خودم از مراجعه', { exact: true })).toBeVisible();
  await openTrip(page);
  await expect(page.getByRole('article', { name: 'جایگزین: نام نمایشی s2' })).toBeVisible();

  // Browser navigation keeps the plan, the alternative and the recorded source.
  await page.goBack();
  await expect(page.getByText('منبع: گزارش خودم از مراجعه', { exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('article', { name: 'مقصد اصلی: نام نمایشی s1' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'جایگزین: نام نمایشی s2' })).toBeVisible();
  await expect(page.getByText('منبع انتخاب: گزارش خودم', { exact: true })).toBeVisible();
  expect(await page.locator('a[href^="tel:"], a[href*="wa.me"]').count()).toBe(0);
});

test('no_alternatives never turns into an add-on offer in the trip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bodies = {};
  await mockApi(page, bodies, { empty: true });
  await openStores(page);
  await planPrimary(page);
  await page.getByRole('button', { name: 'پیگیری انتخاب' }).click();
  await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه' }).click();
  await expect(page.getByRole('heading', { name: 'جایگزینی با این شرایط نیست' })).toBeVisible();
  await expect(page.getByText('بودجه یا شعاع به‌طور خودکار افزایش داده نشد؛')).toBeVisible();
  await expect(page.locator('.uv-alternatives')).toHaveCount(1);
  await openTrip(page);
  await expect(page.getByRole('heading', { name: 'افزودن جایگزین از نتیجهٔ پیگیری' })).toHaveCount(0);
  await expect(page.getByRole('article', { name: /^جایگزین:/ })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'مقصد اصلی: نام نمایشی s1' })).toBeVisible();
});

test('an initial alternatives failure is an error with retry, not an empty success', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bodies = {};
  await mockApi(page, bodies, { failFirst: true });
  await openStores(page);
  await planPrimary(page);
  await page.getByRole('button', { name: 'پیگیری انتخاب' }).click();
  await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'جایگزین‌های همین محصول' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'جایگزینی با این شرایط نیست' })).toHaveCount(0);
  await page.getByRole('button', { name: 'تلاش مجدد' }).click();
  await expect(page.getByRole('heading', { name: 'جایگزین‌های همین محصول' })).toBeVisible();
  expect(bodies.alternatives).toHaveLength(2);
  expect(bodies.alternatives[1]).toMatchObject({ product_id: 'p1', offer_id: 'o1', shop_id: 's1' });
  await openTrip(page);
  await expect(page.getByRole('heading', { name: 'افزودن جایگزین از نتیجهٔ پیگیری' })).toBeVisible();
});

for (const [width, height] of [[320, 568], [390, 844], [1440, 900]]) {
  test(`trip keeps a primary and an alternative usable in both themes at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockApi(page, {});
    await openStores(page);
    await planPrimary(page);
    await report(page, 'simulated');
    // Long follow-up forms remain reachable through the panel sheet.
    const more = page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه' });
    await more.scrollIntoViewIfNeeded();
    await expect(more).toBeInViewport();
    await openTrip(page);
    await page.getByRole('button', { name: 'افزودن به‌عنوان جایگزین' }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'افزودن به‌عنوان جایگزین' }).click();
    const alternativeCard = page.getByRole('article', { name: 'جایگزین: نام نمایشی s2' });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await expect(page.locator('html')).toHaveAttribute('data-ui-theme', scheme);
      await alternativeCard.scrollIntoViewIfNeeded();
      await expect(alternativeCard).toBeVisible();
      const remove = alternativeCard.getByRole('button', { name: 'حذف جایگزین' });
      await remove.scrollIntoViewIfNeeded();
      await expect(remove).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: path.join(qa, `trip-alternative-${width}-${scheme}.png`) });
    }
  });
}
