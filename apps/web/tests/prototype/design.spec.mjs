import { test, expect } from '@playwright/test';

const sizes = [
  [320, 740], [390, 844], [540, 720], [768, 1024], [844, 390], [1024, 768], [1440, 900],
];

async function checkLayout(page, screen) {
  const panel = page.locator('[data-design-panel]');
  await expect(panel).toHaveAttribute('data-screen', screen);
  const bounds = await page.evaluate(() => {
    const panel = document.querySelector('[data-design-panel]');
    const content = document.querySelector('[data-panel-content]');
    const box = panel.getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      panel: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      contentWidth: content.clientWidth, contentScrollWidth: content.scrollWidth,
      frameWidth: document.querySelector('.design-frame').clientWidth,
    };
  });
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.frameWidth).toBe(bounds.width);
  expect(bounds.panel.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.panel.right).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.panel.top).toBeGreaterThanOrEqual(-1);
  expect(bounds.panel.bottom).toBeLessThanOrEqual(bounds.height + 1);
  expect(bounds.contentScrollWidth).toBeLessThanOrEqual(bounds.contentWidth + 1);
}

test('keyboard dialogs, budget bounds, and empty-result recovery', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /بودجه ·/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'فیلترها' });
  await expect(dialog).toBeVisible();
  const lower = page.getByRole('slider', { name: 'حداقل بودجه', exact: true });
  const upper = page.getByRole('slider', { name: 'حداکثر بودجه', exact: true });
  await lower.focus();
  await lower.press('Home');
  await lower.press('ArrowRight');
  await expect(lower).toHaveAttribute('aria-valuenow', '1000000');
  await upper.focus();
  await upper.press('End');
  await upper.press('ArrowLeft');
  await expect(upper).toHaveAttribute('aria-valuenow', '6000000');
  const last = dialog.getByRole('button').last();
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'بازنشانی' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'تغییر ارتفاع پنل' }).click();
  await page.getByRole('button', { name: 'کفش کتونی', exact: true }).click();
  await page.getByRole('button', { name: 'پیشنهاد بده', exact: true }).click();
  await page.getByRole('button', { name: 'فروشگاه‌های نزدیک رو پیدا کن' }).click();
  await expect(page.locator('#card-a1')).toBeVisible();
  await page.getByRole('button', { name: 'فیلتر', exact: true }).click();
  await dialog.getByRole('switch', { name: 'ترب‌پی', exact: true }).click();
  await dialog.getByRole('switch', { name: 'ارسال فوری', exact: true }).click();
  await page.getByRole('button', { name: 'نتیجه‌ای نیست؛ فیلترها رو شل کن' }).click();
  await expect(page.getByText('فروشگاهی با این فیلترها پیدا نشد', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'حذف فیلترها', exact: true }).click();
  await expect(page.locator('#card-a1')).toBeVisible();
});

test('error and offline states recover without backend calls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'پروفایل و تنظیمات' }).click();
  await page.getByRole('button', { name: 'شبیه‌سازی خطا' }).click();
  await expect(page.getByRole('heading', { name: 'نتونستم این بخش رو بیارم' })).toBeVisible();
  await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
  await expect(page.getByRole('heading', { name: /سلام سارا/ })).toBeVisible();
  await page.getByRole('button', { name: 'پروفایل و تنظیمات' }).click();
  await page.getByRole('button', { name: 'شبیه‌سازی آفلاین' }).click();
  await expect(page.getByRole('status')).toContainText('آفلاین هستی');
  await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
  await expect(page.getByText('آفلاین هستی؛ قیمت‌ها مال آخرین بروزرسانی‌اند.')).toHaveCount(0);
});

for (const outcome of ['قیمت جدید', 'ناموجود', 'بی‌پاسخ']) {
  test(`simulated seller response: ${outcome}`, async ({ page }) => {
    await page.setViewportSize({width:1440,height:900});
    await page.goto('/');
    await page.getByRole('button', { name: 'کفش کتونی', exact:true }).click();
    await page.getByRole('button', { name: 'پیشنهاد بده', exact:true }).click();
    await page.getByRole('button', { name: 'فروشگاه‌های نزدیک رو پیدا کن' }).click();
    await page.locator('#card-a1 > button').click();
    await page.locator('#card-a1').getByRole('button', {name:'بپرس',exact:true}).click();
    await page.getByRole('tab', {name:outcome,exact:true}).click();
    await page.getByRole('button', {name:'بفرست و منتظر جواب باش'}).click();
    await expect(page.getByText('شبیه‌سازی', {exact:true})).toBeVisible();
    await expect(page.getByRole('heading', {name:outcome === 'قیمت جدید' ? /قیمت تغییر کرده/ : new RegExp(outcome)})).toBeVisible();
    if (outcome === 'قیمت جدید') {
      await page.getByRole('button', {name:'با قیمت جدید ادامه بده'}).click();
      await checkLayout(page,'trip');
      await expect(page.locator('[data-panel-content]')).toContainText('۲,۹۹۰,۰۰۰');
    } else {
      await expect(page.getByText(/جایگزین نزدیک پیدا کردم/)).toBeVisible();
    }
  });
}

for (const [width, height] of sizes) {
  for (const colorScheme of ['light', 'dark']) {
    test(`${width}x${height} ${colorScheme}: complete design journey`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      const errors = [], apiRequests = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) apiRequests.push(r.url()); });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      await checkLayout(page, 'home');
      if ([390, 1440].includes(width)) await page.screenshot({ path: `../../.local/design-qa/home-${width}-${colorScheme}.png` });
      if (await page.getByRole('button', { name: 'تغییر ارتفاع پنل' }).isVisible()) {
        await page.getByRole('button', { name: 'تغییر ارتفاع پنل' }).click();
      }
      await page.getByRole('button', { name: 'انتخاب دستی محله', exact: true }).click();
      await page.getByRole('button', { name: 'ونک', exact: true }).click();
      await page.getByRole('button', { name: 'کفش کتونی', exact: true }).click();
      await checkLayout(page, 'decide');
      await page.getByRole('button', { name: 'پیشنهاد بده', exact: true }).click();
      await expect(page.getByRole('button', { name: 'فروشگاه‌های نزدیک رو پیدا کن' })).toBeVisible();
      await checkLayout(page, 'results');
      await page.getByRole('button', { name: 'فروشگاه‌های نزدیک رو پیدا کن' }).click();
      await expect(page.locator('#card-a1')).toBeVisible();
      await checkLayout(page, 'stores');
      if ([390, 1440].includes(width)) await page.screenshot({ path: `../../.local/design-qa/stores-${width}-${colorScheme}.png` });
      await page.getByRole('button', { name: 'فیلتر', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'فیلترها' })).toBeVisible();
      await page.getByRole('button', { name: 'بستن', exact: true }).click();
      await page.getByRole('button', { name: '۳ تای برتر', exact: true }).click();
      await expect(page.locator('.design-store-table')).toBeVisible();
      await checkLayout(page, 'compare');
      if ([390, 1440].includes(width)) await page.screenshot({ path: `../../.local/design-qa/compare-${width}-${colorScheme}.png` });
      await page.getByRole('button', { name: /انتخاب .* و تأیید با فروشنده/ }).click();
      await checkLayout(page, 'contact');
      await page.getByRole('tab', { name: 'تأیید', exact: true }).click();
      await page.getByRole('button', { name: 'بفرست و منتظر جواب باش' }).click();
      await expect(page.getByRole('button', { name: 'برو سراغ فروشگاه' })).toBeVisible();
      await page.getByRole('button', { name: 'برو سراغ فروشگاه' }).click();
      await checkLayout(page, 'trip');
      if ([390, 1440].includes(width)) await page.screenshot({ path: `../../.local/design-qa/trip-${width}-${colorScheme}.png` });
      await page.getByRole('button', { name: 'مسیریابی', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'مسیریابی', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'نشان', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(errors).toEqual([]);
      expect(apiRequests).toEqual([]);
    });
  }
}
