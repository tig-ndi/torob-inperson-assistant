import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resultsTurn } from '../ui-a/fixtures.mjs';
import { offer, offers, page as productPage, product, prepared, alternatives, tileOk } from '../ui-b/fixtures.mjs';

const qa = fileURLToPath(new URL('../../../../.local/qa/ui-integration/', import.meta.url));
mkdirSync(qa, { recursive: true });

async function fixture(page) {
  const rows = [offer('o1', 's1'), offer('o2', 's1', { seller_title: 'آفر مستقل دوم' }),
    offer('o3', 's2', { shop: { lat: 35.78, lon: 51.5 } })];
  const bodies = { turns: [], prepare: [], alternatives: [] };
  await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/svg+xml', body: tileOk }));
  await page.route('**/api/assistant/status', r => r.fulfill({ json: { ready: true, reason: 'ready', remaining_calls: 20 } }));
  await page.route('**/api/assistant/turn', r => {
    const body = r.request().postDataJSON(); bodies.turns.push(body);
    const turn = resultsTurn({ need: { pending_requirements: [], review_topics: [] } });
    turn.products = productPage([product(), product('p2', 'گوشی دوم آزمون')]);
    return r.fulfill({ json: { ...turn, request_id: body.request_id } });
  });
  await page.route('**/api/products?**', r => r.fulfill({ json: productPage() }));
  await page.route('**/api/products/p1/offers?**', r => {
    expect(new URL(r.request().url()).searchParams.get('max_price_toman')).toBe('10000000');
    return r.fulfill({ json: offers(rows) });
  });
  await page.route('**/api/followups/prepare', r => {
    const body = r.request().postDataJSON(); bodies.prepare.push(body);
    return r.fulfill({ json: prepared(rows[1]) });
  });
  await page.route('**/api/followups/alternatives', r => {
    const body = r.request().postDataJSON(); bodies.alternatives.push(body);
    return r.fulfill({ json: alternatives(rows[1], rows[2], body.outcome, body.outcome_source) });
  });
  return bodies;
}

for (const width of [390, 1440]) {
  test(`assistant to product comparison, map, exact offer follow-up and alternative trip at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    const bodies = await fixture(page);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/design.html');
    await expect(page.getByText(/صفحه‌های اختصاصی و نقشه هنوز/)).toHaveCount(0);
    await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
    await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی تا ده میلیون تومان');
    await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
    await page.getByRole('button', { name: 'دیدن محصولات این پاسخ' }).click();
    for (const title of ['گوشی نمونهٔ آزمون', 'گوشی دوم آزمون']) {
      await page.getByRole('article', { name: title, exact: true }).getByRole('button', { name: /به مقایسه$/ }).click();
    }
    await page.getByRole('button', { name: 'مقایسه محصولات', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'مقایسهٔ محصولات' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /فروشندگان/ }).first().click();
    await expect(page.locator('.uv-stores')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#uv-shop-s1 .uv-card')).toHaveCount(2);
    await expect(page.locator('.uv-visit')).toHaveAttribute('data-theme-mode', 'light');
    await page.screenshot({ path: `${qa}/journey-stores-light-${width}.png`, animations: 'disabled' });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await expect(page.locator('.uv-visit')).toHaveAttribute('data-theme-mode', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
    const second = page.locator('#uv-shop-s1 .uv-card').nth(1);
    await second.getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
    // Test the official control even if the old shell toggle is unavailable.
    await page.locator('.ub-sheet-control').evaluate(element => { element.disabled = true; });
    await second.getByRole('button', { name: 'نمایش روی نقشه', exact: true }).click();
    await expect(page.locator('.um-map')).toBeVisible();
    await expect(page.locator('.ub-map')).toBeFocused();
    await expect(page.getByRole('button', { name: 'تغییر به تم روشن' })).toBeVisible();
    await page.screenshot({ path: `${qa}/journey-map-dark-${width}.png`, animations: 'disabled' });
    if (width < 960) {
      await page.getByRole('button', { name: 'نمایش فهرست فروشندگان' }).click();
      await expect(page.locator('#workspace-panel')).toBeFocused();
      await expect(page.locator('.um-map')).toBeHidden();
    } else {
      await expect(second).toBeVisible(); // Desktop keeps the list beside the map.
    }
    await page.locator('.ub-sheet-control').evaluate(element => { element.disabled = false; });
    await page.locator('#uv-shop-s1 .uv-card').first().getByRole('button', { name: 'مقایسه', exact: true }).click();
    await second.getByRole('button', { name: 'مقایسه', exact: true }).click();
    await page.getByRole('button', { name: 'مقایسهٔ ۲ آفر', exact: true }).click();
    await expect(page.getByRole('region', { name: 'جدول مقایسهٔ آفرها' })).toBeVisible();
    await expect(page.locator('.uv-table thead th')).toHaveCount(3);
    await expect(page.locator('.uv-table').getByRole('button', { name: 'انتخاب‌شده', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
    await expect(page.locator('.uv-stores')).toHaveAttribute('aria-busy', 'false');
    await second.getByRole('button', { name: 'پیگیری', exact: true }).click();
    await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده' }).click();
    await expect(page.getByText('پیش‌نویس ارسال‌نشده', { exact: true })).toBeVisible();
    expect(bodies.prepare).toEqual([expect.objectContaining({ product_id: 'p1', offer_id: 'o2', shop_id: 's1' })]);
    await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه' }).click();
    await expect(page.locator('.uv-alternatives')).toContainText('تأیید بیرونی: خیر');
    expect(bodies.alternatives).toEqual([expect.objectContaining({ product_id: 'p1', offer_id: 'o2', shop_id: 's1',
      max_price_toman: '10000000', outcome_source: 'simulated' })]);
    await page.getByRole('button', { name: 'ثبت این جایگزین به‌عنوان مقصد' }).click();
    await expect(page.getByRole('heading', { name: 'نام نمایشی s2' })).toBeVisible();
    await expect(page.getByText('منبع انتخاب: شبیه‌سازی', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${qa}/journey-trip-${width}.png`, animations: 'disabled' });
    await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
    // Return must not manufacture or re-send a draft for the old offer under the new selection.
    await expect(page.getByRole('heading', { name: 'پیگیری همین آفر' })).toBeVisible();
    expect(bodies.prepare).toHaveLength(1);
    expect(bodies.turns).toHaveLength(1);
    expect(await page.locator('a[href^="tel:"], a[href*="wa.me"]').count()).toBe(0);
    expect(errors).toEqual([]);
  });
}
