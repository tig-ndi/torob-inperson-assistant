import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { page as products, offer, offers, tileOk } from '../ui-b/fixtures.mjs';
const qa = fileURLToPath(new URL('../../../../.local/ui-ux-handoff/cm-b3/', import.meta.url));
mkdirSync(qa, { recursive: true });

async function open(page) {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/assistant/turn', r => r.abort());
  await page.route('**/api/assistant/status', r => r.fulfill({ json: { ready: false, reason: 'disabled', remaining_calls: 0 } }));
  await page.route('**/api/products?**', r => r.fulfill({ json: products() }));
  await page.route('**/api/products/p1/offers?**', r => r.fulfill({ json: offers([offer(), offer('o2', 's1')]) }));
  await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ body: tileOk, contentType: 'image/svg+xml' }));
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
  await expect(page.locator('.uv-card')).toHaveCount(2);
  const second = page.locator('.uv-card').nth(1);
  await second.getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await second.getByRole('button', { name: 'نمایش روی نقشه', exact: true }).click();
  return { errors, second };
}
async function expectClearPin(page) {
  await expect.poll(async () => page.locator('.um-pin.is-selected').evaluate(el => {
    const pin = el.getBoundingClientRect(), map = el.closest('.um-map').getBoundingClientRect();
    const x = (pin.left + pin.right) / 2, y = pin.bottom;
    const within = x > map.left && x < map.right && y > map.top && y < map.bottom;
    return within && ['.ub-panel', '.ub-search-area'].every(selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return x < r.left || x > r.right || y < r.top || y > r.bottom;
    });
  })).toBe(true);
}

for (const [width, height] of [[320, 568], [390, 844], [768, 360], [960, 800], [1440, 900]]) {
  test(`shell owns theme and selected map point stays outside overlays at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    const { errors, second } = await open(page);
    await expect(page.locator('.um-controls button')).toHaveCount(2);
    const theme = page.getByRole('combobox', { name: 'تم نمایش', exact: true });
    await expect(theme).toHaveCount(1); await expect(theme).toBeVisible();
    await expectClearPin(page);
    const before = await page.locator('.um-pin').evaluate(el => el.getBoundingClientRect().toJSON());
    await theme.selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
    await expectClearPin(page);
    const after = await page.locator('.um-pin').evaluate(el => el.getBoundingClientRect().toJSON());
    expect(Math.abs(before.x - after.x)).toBeLessThan(1);
    expect(Math.abs(before.y - after.y)).toBeLessThan(1);
    await theme.selectOption('system');
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
    if (width >= 960) {
      // Simulate a wider delivered panel: no viewport-width guess can satisfy this.
      await page.locator('.ub-app').evaluate(el => el.style.setProperty('--uv-panel', '570px'));
      await expectClearPin(page);
    } else {
      await page.getByRole('button', { name: 'نمایش فهرست فروشندگان', exact: true }).click();
      await expect(page.locator('.um-map')).toBeHidden();
      await second.getByRole('button', { name: 'نمایش روی نقشه', exact: true }).click();
      await expectClearPin(page);
    }
    await expect(second).toHaveClass(/is-selected/);
    await page.screenshot({ path: `${qa}/map-coordination-${width}.png` });
    expect(errors).toEqual([]);
  });
}

test('selected offer survives desktop/mobile resizing and navigation through a hidden mounted map', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { errors } = await open(page);
  for (const [width, height] of [[390, 844], [960, 800], [768, 360], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'نمایش همهٔ فروشگاه‌ها روی نقشه', exact: true }).click();
    await expectClearPin(page);
    await expect(page.locator('.uv-card').nth(1)).toHaveClass(/is-selected/);
  }
  for (let n = 0; n < 3; n++) {
    await page.getByRole('button', { name: 'رفتن به شروع', exact: true }).last().click();
    await expect(page.locator('.um-map')).toBeHidden();
    await page.getByRole('button', { name: /ادامه/ }).first().click();
    await expect(page.locator('.um-map')).toBeVisible();
    await expectClearPin(page);
  }
  expect(errors).toEqual([]);
});
