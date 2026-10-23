import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { offer, offers, page as products, tileOk } from '../ui-b/fixtures.mjs';
const qa = fileURLToPath(new URL('../../../../.local/ui-ux-handoff/cm-b4/', import.meta.url));
mkdirSync(qa, { recursive: true });

async function open(page) {
  const errors = []; let paid = 0;
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/assistant/status', r => r.fulfill({ json: { ready: false, reason: 'disabled', remaining_calls: 0 } }));
  await page.route('**/api/assistant/turn', r => { paid++; return r.abort(); });
  await page.route('**/api/products?**', r => r.fulfill({ json: products() }));
  await page.route('**/api/products/p1/offers?**', r => r.fulfill({ json: offers([
    offer(), offer('o2', 's1'), ...Array.from({ length: 6 }, (_, i) => offer(`extra${i}`, `extra${i}`)),
  ]) }));
  await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ body: tileOk, contentType: 'image/svg+xml' }));
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
  await expect(page.locator('.uv-card')).toHaveCount(8);
  return { errors, paid: () => paid };
}
const handle = page => page.getByRole('slider', { name: 'اندازهٔ پنل فروشندگان', exact: true });
async function height(page) { return page.locator('.ub-panel').evaluate(el => el.getBoundingClientRect().height); }
async function dragTo(page, desired) {
  const box = await handle(page).boundingBox(), current = await height(page);
  await page.mouse.move(box.x + box.width / 2, box.y + 22);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 22 + current - desired, { steps: 12 });
  await page.mouse.up();
}

for (const [width, viewportHeight] of [[320, 568], [390, 844], [768, 360], [959, 800]]) {
  test(`three real sheet sizes are keyboard accessible without changing offers at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: viewportHeight });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    const { errors, paid } = await open(page);
    const slider = handle(page);
    await expect(slider).toHaveAttribute('aria-valuenow', '3');
    await slider.focus(); await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '1');
    expect(await height(page)).toBe(96);
    await expect(page.locator('.um-map')).toBeVisible();
    await expect(page.locator('.ub-panel-body')).toBeHidden();
    await expect(page.locator('.ub-panel-body')).toHaveAttribute('inert', '');
    await page.keyboard.press('ArrowUp');
    await expect(slider).toHaveAttribute('aria-valuenow', '2');
    await expect(page.locator('.ub-panel-body')).toBeVisible();
    expect(await page.locator('.ub-map').evaluate(el => el.getBoundingClientRect().height)).toBe(viewportHeight);
    const search = page.getByRole('button', { name: 'جست‌وجو', exact: true });
    expect(await search.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap');
    await page.screenshot({ path: `${qa}/sheet-half-${width}.png` });
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '3');
    await expect(page.locator('.um-map')).toBeHidden();
    await page.locator('.uv-card').nth(1).getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
    await slider.focus(); await page.keyboard.press('Home');
    await page.getByRole('combobox', { name: 'تم نمایش', exact: true }).selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
    await page.screenshot({ path: `${qa}/sheet-peek-dark-${width}.png` });
    await slider.focus(); await page.keyboard.press('End');
    await expect(page.locator('.uv-card').nth(1)).toHaveClass(/is-selected/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]); expect(paid()).toBe(0);
  });
}

test('mouse drag snaps, cancellation reverts and content scroll does not move the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors, paid } = await open(page);
  await dragTo(page, 96);
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '1');
  await handle(page).click();
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '2');
  await page.keyboard.press('End');
  const full = await height(page), box = await handle(page).boundingBox();
  await page.mouse.move(box.x + 100, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 100, { steps: 6 });
  expect(await height(page)).toBeLessThan(full);
  await handle(page).dispatchEvent('pointercancel'); await page.mouse.up();
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '3');
  expect(await height(page)).toBe(full);
  const again = await handle(page).boundingBox();
  await page.mouse.move(again.x + 100, again.y + 20); await page.mouse.down();
  await page.mouse.move(again.x + 100, again.y + 90);
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await height(page)).toBe(full);
  const body = page.locator('.ub-panel-body');
  const bodyBox = await body.boundingBox();
  await page.mouse.move(bodyBox.x + 100, bodyBox.y + bodyBox.height / 2); await page.mouse.wheel(0, 400);
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '3');
  expect(errors).toEqual([]); expect(paid()).toBe(0);
});

test('touch drag and orientation change release the gesture without late snapping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await open(page);
  const cdp = await page.context().newCDPSession(page);
  const box = await handle(page).boundingBox(), full = await height(page);
  const x = box.x + box.width / 2, y = box.y + 20;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x, y: y + (full - 96) * step / 8 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '1');
  await handle(page).focus(); await page.keyboard.press('End');
  const body = page.locator('.ub-panel-body'), bodyBox = await body.boundingBox();
  const tx = bodyBox.x + bodyBox.width / 2, ty = bodyBox.y + bodyBox.height - 30;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
  for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: tx, y: ty - Math.min(160, bodyBox.height / 2) * step / 8 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '3');
  const next = await handle(page).boundingBox();
  await page.mouse.move(next.x + 100, next.y + 20); await page.mouse.down();
  await page.mouse.move(next.x + 100, next.y + 80);
  await page.setViewportSize({ width: 768, height: 360 });
  await page.mouse.up();
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '3');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.ub-sheet-handle')).toBeHidden();
  await expect(page.locator('.ub-panel-body')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a shorter visual viewport keeps the sheet inside the available area and filters stay usable in landscape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 460 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => page.locator('.ub-panel').evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(461);
  await page.evaluate(() => {
    delete window.visualViewport.height;
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.setViewportSize({ width: 768, height: 360 });
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'شرایط جست‌وجو', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'رفتن به شروع', exact: true })).toBeVisible();
});
