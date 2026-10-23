import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { offer, offers, page as productPage, prepared, tileOk } from '../ui-b/fixtures.mjs';

const qa = fileURLToPath(new URL('../../../../.local/ui-ux-handoff/cm-b2/', import.meta.url));
mkdirSync(qa, { recursive: true });
const amount = '9007199254740993001';
const formatted = '۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٬۰۰۱';
function rows(extra = []) {
  return [offer('o1', 's1', { price_toman: null }),
    offer('o2', 's1', { price_toman: amount, seller_title: 'آفر مستقل دوم' }),
    offer('o3', 's2', { price_toman: '0', shop: { lat: 35.78, lon: 51.5 } }), ...extra];
}

async function open(page, items = rows()) {
  const calls = { prepare: [], paid: 0, tiles: 0, tileFailure: false };
  await page.route('**/api/assistant/turn', r => { calls.paid++; return r.abort(); });
  await page.route('**/api/products?**', r => r.fulfill({ json: productPage() }));
  await page.route('**/api/products/p1/offers?**', r => r.fulfill({ json: offers(items) }));
  await page.route('**/api/followups/prepare', r => {
    const body = r.request().postDataJSON(); calls.prepare.push(body);
    return r.fulfill({ json: prepared(items.find(o => o.offer_id === body.offer_id)) });
  });
  await page.route('**/tile.openstreetmap.org/**', r => {
    calls.tiles++;
    return calls.tileFailure ? r.abort() : r.fulfill({ contentType: 'image/svg+xml', body: tileOk });
  });
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
  await expect(page.locator('.uv-stores')).toHaveAttribute('aria-busy', 'false');
  return calls;
}
async function reveal(page) {
  await page.getByRole('button', { name: 'نمایش همهٔ فروشگاه‌ها روی نقشه' }).click();
  await expect(page.locator('.um-map')).toBeVisible();
}
async function expose(page, shop) {
  const close = page.getByRole('button', { name: 'بستن پیش‌نمایش', exact: true });
  if (await close.isVisible()) await close.click();
  const pin = page.locator(`.um-pin[aria-label*="نام نمایشی ${shop}"]`);
  for (let n = 0; n < 8 && await pin.count() === 0; n++) {
    await page.locator('.um-cluster').first().click({ force: true });
    await page.waitForTimeout(150);
  }
  await expect(pin).toHaveCount(1);
  return pin;
}

for (const [width, height] of [[320, 568], [390, 844], [768, 360], [1440, 900]]) {
  test(`price pills keep full source labels and usable targets in both themes at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    const calls = await open(page);
    await reveal(page);
    const pin = await expose(page, 's1');
    await expect(pin).toHaveAttribute('aria-label', new RegExp(`${formatted} تومان.*ساعت نامشخص.*۲ آفر`));
    await expect(page.locator('.um-pin[aria-label*="نام نمایشی s2"]')).toHaveAttribute('aria-label', /از ۰ تومان/);
    const positions = await page.locator('.um-pin').evaluateAll(nodes => nodes.map(n => n.style.transform));
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator('html')).toHaveAttribute('data-ui-theme', theme);
      const style = await pin.locator('.um-tag').evaluate(el => {
        const c = getComputedStyle(el);
        return { height: el.getBoundingClientRect().height, radius: c.borderRadius, border: c.borderTopStyle, bg: c.backgroundColor };
      });
      expect(style).toMatchObject({ height: 32, radius: '999px', border: 'dashed' });
      const surface = await page.locator('.um-control').first().evaluate(el => {
        const probe = document.createElement('span'); probe.style.background = 'var(--ub-surface)'; el.append(probe);
        const value = getComputedStyle(probe).backgroundColor; probe.remove(); return value;
      });
      expect(style.bg).toBe(surface);
      expect(await pin.evaluate(el => el.getBoundingClientRect().height)).toBe(44);
      for (const control of await page.locator('.um-control, .leaflet-control-zoom a').all()) {
        const box = await control.boundingBox();
        if (box) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
      }
      expect(await page.locator('.um-pin').evaluateAll(nodes => nodes.map(n => n.style.transform))).toEqual(positions);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: `${qa}/map-${width}-${theme}.png`, animations: 'disabled' });
    }
    expect(calls.paid).toBe(0);
  });
}

test('co-located shops, two offers from one shop, keyboard focus and the non-first offer keep their identities', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const calls = await open(page, rows([offer('o4', 's4')]));
  const second = page.locator('#uv-shop-s1 .uv-card').nth(1);
  await second.getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await second.getByRole('button', { name: 'نمایش روی نقشه' }).click();
  await expect(page.locator('.um-cluster.is-selected')).toContainText('۲');
  expect(await page.locator('.um-cluster').evaluate(el => el.getBoundingClientRect().height)).toBe(44);
  const pin = await expose(page, 's1');
  await expect(page.locator('.um-pin[aria-label*="نام نمایشی s4"]')).toHaveCount(1);
  await pin.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#uv-shop-s1')).toHaveClass(/is-focused/);
  await expect(page.locator('#uv-shop-s1 .uv-card')).toHaveCount(2);
  await expect(second).toHaveClass(/is-selected/);
  await page.getByRole('button', { name: 'نمایش فهرست فروشندگان', exact: true }).click();
  for (const card of await page.locator('#uv-shop-s1 .uv-card').all()) {
    await card.getByRole('button', { name: 'مقایسه', exact: true }).click();
  }
  await page.getByRole('button', { name: 'مقایسهٔ ۲ آفر', exact: true }).click();
  await expect(page.locator('.uv-table thead th')).toHaveCount(3);
  await expect(page.locator('.uv-table')).toContainText(formatted);
  await expect(page.locator('.uv-table')).toContainText('قیمت ثبت نشده');
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await second.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await page.locator('.uv-advanced-details > summary').click();
  await page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده', exact: true }).click();
  expect(calls.prepare).toEqual([expect.objectContaining({ product_id: 'p1', offer_id: 'o2', shop_id: 's1' })]);
  expect(calls.paid).toBe(0);
});

test('synthetic user position, radius and direct line follow theme tokens and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 35.7, longitude: 51.4 });
  const calls = await open(page);
  await page.getByRole('button', { name: 'موقعیت من', exact: true }).click();
  await expect(page.locator('.um-user')).toHaveCount(1);
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'شرایط جست‌وجو', exact: true });
  await dialog.getByLabel('شعاع هوایی به کیلومتر').fill('10');
  await dialog.getByRole('button', { name: 'اعمال شرایط', exact: true }).click();
  await expect(page.locator('.uv-stores')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#uv-shop-s1 .uv-card').nth(1).getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', theme);
    const brand = await page.locator('.um-map').evaluate(el => {
      const node = document.createElement('span'); node.style.color = 'var(--ub-brand)'; el.append(node);
      const value = getComputedStyle(node).color; node.remove(); return value;
    });
    for (const dash of ['7 9', '5 9']) {
      const path = page.locator(`.um-map path[stroke-dasharray="${dash}"]`);
      await expect(path).toHaveCount(1);
      expect(await path.evaluate(el => getComputedStyle(el).stroke)).toBe(brand);
    }
  }
  expect(await page.locator('.um-user').evaluate(el => getComputedStyle(el, '::after').animationName)).toBe('um-user-pulse');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.um-user').evaluate(el => getComputedStyle(el, '::after').animationName)).toBe('none');
  expect(calls.paid).toBe(0);
});

test('tile recovery leaves the 320px list route and selected offer usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const calls = await open(page); calls.tileFailure = true;
  await reveal(page);
  // Force a fresh tile request after changing the deterministic tile fixture.
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const retry = page.getByRole('button', { name: 'تلاش دوباره برای نقشه', exact: true });
  await expect(retry).toBeVisible();
  calls.tileFailure = false;
  await retry.click();
  await expect(page.locator('.um-tile-failure')).toHaveCount(0);
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await page.getByRole('button', { name: 'نمایش فهرست فروشندگان', exact: true }).click();
  await page.locator('#uv-shop-s1 .uv-card').nth(1).getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await expect(page.getByRole('button', { name: 'پیگیری', exact: true })).toBeVisible();
  expect(calls.paid).toBe(0);
});
