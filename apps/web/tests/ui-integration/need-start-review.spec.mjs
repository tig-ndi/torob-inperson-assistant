import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { needsInputTurn } from '../ui-a/fixtures.mjs';

for (const width of [320, 390, 1440]) {
  test(`the initial need form submits once and continues clarification without another welcome at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    let turns = 0, tiles = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/assistant/status', route => route.fulfill({ json: { ready: true, reason: 'ready', remaining_calls: 25 } }));
    await page.route('**/api/assistant/turn', route => {
      turns++;
      return route.fulfill({ json: { ...needsInputTurn(), request_id: route.request().postDataJSON().request_id } });
    });
    await page.route('**/tile.openstreetmap.org/**', route => { tiles++; return route.abort(); });
    await page.goto('/');
    const need = page.getByLabel('نیاز و کاربرد موردنظر');
    await expect(need).toBeVisible();
    await need.fill('گوشی برای عکاسی');
    expect(turns).toBe(0);
    await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'ادامهٔ خرید', exact: true })).toHaveCount(0);
    await expect(page.locator('.um-map')).toHaveCount(0);
    await mkdir('../../.local/qa/owner-need-start', { recursive: true });
    await page.screenshot({ path: `../../.local/qa/owner-need-start/start-${width}.png` });
    await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
    await expect(page.locator('.ua-outcome')).toContainText('سقف بودجه‌تان چقدر است؟');
    await expect(page.getByRole('heading', { name: 'نیازتان را بگویید', exact: true })).toBeVisible();
    await expect(need).toHaveValue('');
    await expect(page.locator('.ua-start-intro')).toHaveCount(0);
    await need.fill('حداکثر ده میلیون');
    await page.getByRole('button', { name: 'رفتن به شروع', exact: true }).click();
    await page.getByRole('button', { name: 'ادامهٔ خرید', exact: true }).click();
    await expect(need).toHaveValue('حداکثر ده میلیون');
    await expect(page.locator('.ua-outcome')).toContainText('سقف بودجه‌تان چقدر است؟');
    expect(turns).toBe(1);
    expect(tiles).toBe(0);
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'گفت‌وگوی تازه', exact: true }).click();
    await expect(need).toHaveValue('');
    await expect(page.locator('.ua-history')).toHaveCount(0);
    await expect(page.locator('.ua-outcome')).toHaveCount(0);
    expect(turns).toBe(1);
  });
}
