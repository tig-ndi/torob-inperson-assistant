import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { offer, offers, page as products, tileOk } from '../ui-b/fixtures.mjs';

const qa = fileURLToPath(new URL('../../../../.local/qa/map-preview/', import.meta.url));
mkdirSync(qa, { recursive: true });

async function openPreview(page) {
  const paid = [];
  page.on('request', r => {
    if (/\/api\/(assistant\/turn|voice\/)/.test(r.url())) paid.push(r.url());
  });
  await page.route('**/api/assistant/status', r => r.fulfill({ json: {
    ready: false, reason: 'disabled', remaining_calls: 0, attempt_limit: 3 } }));
  await page.route('**/api/products?**', r => r.fulfill({ json: products() }));
  await page.route('**/api/products/p1/offers?**', r => r.fulfill({ json: offers([offer()]) }));
  await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/svg+xml', body: tileOk }));
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await page.getByRole('button', { name: 'نمایش روی نقشه', exact: true }).click();
  await expect(page.locator('.um-preview-card')).toBeVisible();
  return paid;
}

for (const [width, height] of [[320, 568], [390, 844], [768, 360], [959, 720], [960, 720], [1280, 800], [1440, 900]]) {
  for (const theme of ['light', 'dark']) {
    test(`preview stays outside the panel and search at ${width}x${height} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const paid = await openPreview(page);
      const preview = page.locator('.um-preview-card');
      const geometry = () => page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        const p = box('.um-preview-card');
        const overlaps = selector => {
          const r = box(selector);
          return Math.max(0, Math.min(p.right, r.right) - Math.max(p.left, r.left)) *
            Math.max(0, Math.min(p.bottom, r.bottom) - Math.max(p.top, r.top));
        };
        return { panel: overlaps('#workspace-panel'), search: overlaps('.ub-search-area'), controls: overlaps('.um-controls'),
          inViewport: p.left >= 0 && p.top >= 0 && p.right <= innerWidth && p.bottom <= innerHeight,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      if (process.env.MAP_PREVIEW_PHASE === 'before') {
        await page.screenshot({ path: `${qa}/before-${width}-${theme}.png`, animations: 'disabled' });
      }
      await expect.poll(geometry).toEqual({ panel: 0, search: 0, controls: 0, inViewport: true, overflow: false });
      if (width === 1440 && theme === 'light') {
        for (const viewport of [{ width: 390, height: 844 }, { width, height }]) {
          await page.setViewportSize(viewport);
          await expect.poll(geometry).toEqual({ panel: 0, search: 0, controls: 0, inViewport: true, overflow: false });
        }
      }
      await page.screenshot({ path: `${qa}/after-${width}-${theme}.png`, animations: 'disabled' });
      // Trial clicks include hit testing: another layer must not cover these controls.
      await preview.getByRole('button', { name: 'مشاهده در فهرست', exact: true }).click({ trial: true });
      await preview.getByRole('button', { name: 'بستن پیش‌نمایش', exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(preview).toHaveCount(0);
      await expect(page.locator('.um-pin')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(preview).toBeVisible();
      await preview.getByRole('button', { name: 'مشاهده در فهرست', exact: true }).click();
      await expect(preview).toHaveCount(0);
      await expect(page.locator('#workspace-panel')).toBeFocused();
      await expect(page.locator('.uv-card.is-selected')).toHaveCount(1);
      await page.getByRole('button', { name: 'نمایش روی نقشه', exact: true }).click();
      await expect(preview).toBeVisible();
      await preview.getByRole('button', { name: 'انتخاب این آفر و پیگیری', exact: true }).click();
      await expect(page.locator('.uv-contact')).toBeVisible();
      await expect(preview).toHaveCount(0);
      await page.getByText('تنظیمات سنتی و ساخت پیش‌نویس سیستمی', { exact: true }).click();
      await expect(page.getByRole('button', { name: 'ساخت پیش‌نویس ارسال‌نشده', exact: true })).toBeVisible();
      expect(errors).toEqual([]);
      expect(paid).toEqual([]);
    });
  }
}

test('leaving the map from the list closes its preview without clearing the selected offer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPreview(page);
  await page.locator('.uv-card.is-selected').getByRole('button', { name: 'پیگیری', exact: true }).click();
  await expect(page.locator('.uv-contact')).toBeVisible();
  await expect(page.locator('.um-preview-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل', exact: true }).click();
  await expect(page.locator('.uv-card.is-selected')).toHaveCount(1);
  await expect(page.locator('.um-preview-card')).toHaveCount(0);
});
