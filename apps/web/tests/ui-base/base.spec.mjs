import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { page as fixturePage, product, offers, offer } from '../../unit/ui-base/fixtures.mjs';

const qa = fileURLToPath(new URL('../../../../.local/qa/ui-base/', import.meta.url));
mkdirSync(qa, { recursive: true });

for (const [width, height] of [[320,568],[375,667],[390,844],[430,932],[431,932],[768,1024],[768,360],
  [959,800],[960,800],[999,900],[1000,900],[1024,768],[1440,900],[1920,1080]]) {
  test(`base shell is usable at ${width}x${height}`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.goto('/design.html');
    await expect(page.getByRole('button', { name: 'جست‌وجو', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('combobox', { name: 'تم نمایش' }).selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
    await page.getByRole('combobox', { name: 'تم نمایش' }).selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
    expect(errors).toEqual([]);
    if (width === 390 || width === 1440) await page.screenshot({ path: path.join(qa, `shell-${width}.png`), fullPage: true });
  });
}
test('base dialogs have usable focus, budget validation and no hidden location permission', async ({ page }) => {
  await page.goto('/design.html');
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'شرایط جست‌وجو' }); await expect(dialog).toBeVisible();
  await dialog.getByLabel('سقف بودجه به تومان').fill('10000000');
  await expect(dialog).toContainText('ده میلیون تومان');
  await dialog.getByRole('button', { name: 'اعمال شرایط' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'حذف سقف بودجه' })).toBeVisible();
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  await dialog.getByLabel('مرتب‌سازی').selectOption('nearest');
  await dialog.getByRole('button', { name: 'اعمال شرایط' }).click();
  await expect(dialog.getByRole('alert')).toContainText('موقعیت');
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'انتخاب موقعیت', exact: false }).click();
  await expect(page.getByRole('dialog', { name: 'موقعیت جست‌وجو' })).toContainText('به مدل ارسال نمی‌شود');
  await page.keyboard.press('Escape');
});
test('shared hook keeps independent offers and ignores a stale search response', async ({ page }) => {
  await page.route('**/api/products?**', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'قدیمی') { await new Promise(resolve => setTimeout(resolve, 250)); }
    await route.fulfill({ json: fixturePage([{ ...product(), persian_title: q === 'قدیمی' ? 'پاسخ قدیمی' : 'پاسخ جدید' }]) }).catch(() => {});
  });
  await page.route('**/api/products/p1/offers?**', route => route.fulfill({ json: offers([offer(), offer('o2')]) }));
  await page.goto('/design.html');
  const input = page.getByLabel('نام کالا در کاتالوگ');
  await input.fill('قدیمی'); await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await input.fill('جدید');
  await expect(page.getByRole('button', { name: 'جست‌وجو', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'پاسخ جدید' })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByRole('heading', { name: 'پاسخ قدیمی' })).toHaveCount(0);
  await page.getByRole('button', { name: 'دیدن فروشندگان' }).click();
  await expect(page.getByRole('button', { name: 'انتخاب این آفر', exact: true })).toHaveCount(2);
  await expect(page.locator('.ub-offer').first()).toContainText('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳');
  await page.locator('.ub-offer').nth(1).getByRole('button', { name: 'انتخاب این آفر' }).click();
  await expect(page.locator('.ub-offer').nth(1).getByRole('button', { name: 'انتخاب شده' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: path.join(qa, 'offers-390.png'), fullPage: true });
});
test('real API client handles snapshot search, offers and unsent followups with no model', async ({ page }) => {
  await page.goto('/design.html');
  const summary = await page.evaluate(async () => {
    const c = await import('/src/app/base/domain/client.ts');
    const signal = new AbortController().signal;
    const products = await c.searchCatalogue({ query: 'گوشی', maxPrice: null }, signal);
    const product = products.items.find(p => p.offer_summary.offer_count > 0);
    if (!product) throw new Error('The current snapshot has no phone with offers');
    const filters = { maxPrice: null, radiusKm: null, sort: 'price', openNowOnly: false, creditOnly: false };
    const offers = await c.loadOffers(product.product_id, filters, null, signal);
    const selected = offers.items[0]; if (!selected) throw new Error('Selected source product has no offers');
    const selection = { product_id: product.product_id, offer_id: selected.offer_id, shop_id: selected.shop_id };
    const prepared = await c.prepareFollowup(selection, null, signal);
    const alternatives = await c.findAlternatives(selection, 'no_answer', filters, null, signal);
    return { products: products.items.length, offers: offers.items.length, unsent: prepared.draft.delivery_status,
      hasSource: Boolean(products.provenance.snapshot_id),
      noContact: !prepared.draft.external_contact_attempted && !prepared.draft.contact_channel_available,
      alternativeScope: alternatives.alternatives.items.every(o => o.product_id === selection.product_id && o.shop_id !== selection.shop_id) };
  });
  expect(summary.products).toBeGreaterThan(0); expect(summary.offers).toBeGreaterThan(0);
  expect(summary).toMatchObject({ unsent: 'draft_not_sent', hasSource: true, noContact: true, alternativeScope: true });
});
test('all A/B mount points navigate without losing the chosen conditions', async ({ page }) => {
  await page.goto('/design.html');
  await page.locator('summary').filter({ hasText: 'صفحه‌های پایه' }).click();
  const routes = page.getByRole('navigation', { name: 'صفحه‌های پایه', exact: true });
  for (const name of ['بررسی نیاز','محصول‌ها','فروشندگان','مقایسهٔ آفر','پیگیری','مراجعه','شروع']) {
    await routes.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.ub-panel-top strong')).toHaveText(name);
  }
});
test('offer retry resumes the failed page without dropping already loaded rows', async ({ page }) => {
  const offsets = []; let failNext = true;
  await page.route('**/api/products?**', route => route.fulfill({ json: fixturePage() }));
  await page.route('**/api/products/p1/offers?**', route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset')); offsets.push(offset);
    if (offset === 20 && failNext) { failNext = false; return route.fulfill({ status: 503, json: { code: 'catalogue_unavailable' } }); }
    return route.fulfill({ json: { ...offers([offer(offset === 0 ? 'o1' : 'o2')]), offset, has_more: offset === 0 } });
  });
  await page.goto('/design.html'); await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان' }).click();
  await page.getByRole('button', { name: 'آفرهای بیشتر' }).click();
  await expect(page.getByRole('alert')).toContainText('در دسترس نیست');
  await expect(page.locator('.ub-offer')).toHaveCount(1);
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.locator('.ub-offer')).toHaveCount(2);
  expect(offsets).toEqual([0,20,20]);
});
