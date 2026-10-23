import { test, expect } from '@playwright/test';

for (const width of [320, 390, 1440]) {
  test(`A start offers explicit paths without model calls at ${width}px`, async ({ page }) => {
    let modelRequests = 0, statusRequests = 0;
    await page.route('**/api/assistant/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path === '/api/assistant/status') {
        statusRequests++;
        await route.fulfill({ json: { ready: true, reason: 'ready', remaining_calls: 25 } });
        return;
      }
      if (path === '/api/assistant/turn' && request.method() === 'POST') modelRequests++;
      await route.abort();
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/design.html');
    await expect(page.getByRole('heading', { name: 'از کجا شروع کنیم؟' })).toBeVisible();
    expect(statusRequests).toBe(0);
    await page.getByRole('button', { name: 'جست‌وجوی کالا', exact: true }).click();
    await expect(page.getByLabel('نام کالا در کاتالوگ')).toBeFocused();
    await expect(page.getByRole('button', { name: 'جست‌وجو', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'نیازتان را بگویید' })).toBeVisible();
    await expect.poll(() => statusRequests).toBeGreaterThan(0);
    expect(modelRequests).toBe(0);
    await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
    await expect(page.getByRole('heading', { name: 'از کجا شروع کنیم؟' })).toBeVisible();
    expect(modelRequests).toBe(0);
  });
}
