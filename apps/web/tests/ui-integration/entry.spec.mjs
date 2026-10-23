import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`root starts the new workspace and reload starts fresh at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const oldModules = [];
    let turns = 0;
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/src/main.tsx') oldModules.push(request.url());
      if (request.url().endsWith('/api/assistant/turn')) turns++;
    });
    await page.goto('/');
    await expect(page.locator('.ub-app')).toBeVisible();
    await expect(page.getByLabel('نام کالا در کاتالوگ')).toBeVisible();
    await expect(page.getByRole('link', { name: 'رابط فعلی', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
    await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toBeVisible();
    await page.reload();
    await expect(page.locator('.ub-panel-top strong')).toHaveText('شروع');
    expect(new URL(page.url()).pathname).toBe('/');
    expect(oldModules).toEqual([]);
    expect(turns).toBe(0);
  });
}

test('old design bookmark replaces its entry with root without a navigation loop', async ({ page }) => {
  await page.goto('/design.html?old-bookmark=1#workspace-panel');
  await expect(page).toHaveURL('http://127.0.0.1:15173/');
  await expect(page.locator('.ub-app')).toBeVisible();
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await expect(page.locator('.ub-panel-top strong')).toHaveText('بررسی نیاز');
  await page.goBack();
  await expect(page.locator('.ub-panel-top strong')).toHaveText('شروع');
  await expect(page).toHaveURL('http://127.0.0.1:15173/');
});
