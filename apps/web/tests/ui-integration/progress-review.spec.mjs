import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { page as catalogue, offer, offers, tileOk } from '../ui-b/fixtures.mjs';

const qa = fileURLToPath(new URL('../../../../.local/qa/owner-progress/', import.meta.url));
mkdirSync(qa, { recursive: true });

for (const width of [320, 390, 960, 1440]) {
  test(`one progress definition prevents empty destinations and keeps theme accessible at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ body: tileOk, contentType: 'image/svg+xml' }));
    await page.route('**/api/assistant/status', r => r.fulfill({ json: { ready: false, reason: 'disabled', remaining_calls: 0 } }));
    await page.route('**/api/products?**', r => r.fulfill({ json: catalogue() }));
    await page.route('**/api/products/p1/offers?**', r => r.fulfill({ json: offers([offer(), offer('o2')]) }));
    await page.goto('/');
    await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
    const progress = page.getByRole('navigation', { name: 'مسیر خرید', exact: true });
    await expect(progress).toHaveCount(1);
    await expect(progress.locator('[aria-current=step]')).toHaveCount(1);
    await expect(progress.getByRole('button', { name: /فروشندگان/ })).toBeDisabled();
    await expect(progress.getByRole('button', { name: /مقایسه/ })).toBeDisabled();
    await expect(progress.getByRole('button', { name: /پیگیری و مراجعه/ })).toBeDisabled();
    for (const label of await progress.locator('.ub-step-label').all()) {
      const size = await label.evaluate(el => ({ height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) }));
      expect(size.height).toBeLessThanOrEqual(size.line + 1);
    }
    await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
    await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
    await page.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
    await expect(progress.getByRole('button', { name: /فروشندگان/ })).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('.uv-card')).toHaveCount(2);
    const theme = page.getByRole('combobox', { name: 'تم نمایش', exact: true });
    await expect(theme).toHaveCount(1);
    await expect(theme).toBeVisible();
    await theme.selectOption('dark');
    await expect(page.locator('.uv-visit')).toHaveAttribute('data-theme-mode', 'dark');
    await page.screenshot({ path: `${qa}/stores-dark-${width}.png` });
    await theme.selectOption('system');
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
    for (const card of await page.locator('.uv-card').all()) await card.getByRole('button', { name: 'مقایسه', exact: true }).click();
    await expect(progress.getByRole('button', { name: /مقایسه/ })).toBeEnabled();
    await progress.getByRole('button', { name: /مقایسه/ }).click();
    await expect(page.locator('.uv-table thead th')).toHaveCount(3);
    await expect(progress.getByRole('button', { name: /پیگیری و مراجعه/ })).toBeDisabled();
    await progress.getByRole('button', { name: /فروشندگان/ }).click();
    await page.locator('.uv-card').nth(1).getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
    await progress.getByRole('button', { name: /پیگیری و مراجعه/ }).click();
    await expect(page.getByRole('heading', { name: 'پیگیری همین آفر', exact: true })).toBeVisible();
    await expect(page.getByText('مقصد اصلی', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
