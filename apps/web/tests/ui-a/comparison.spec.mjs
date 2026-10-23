import { test, expect } from '@playwright/test';
import { product, cataloguePage } from './fixtures.mjs';
import { offer, offers } from '../../unit/ui-base/fixtures.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const qa = fileURLToPath(new URL('../../../../.local/qa/ui-a/', import.meta.url));
mkdirSync(qa, { recursive: true });
const spec = (section, key, value) => ({ section, key, value });
function products() {
  return [
    { ...product('p1'), persian_title: 'گوشی الف', specs: [spec('مشخصات کلی', 'وزن', '۱۷۰ گرم'), spec('نمایشگر', 'نوع', 'OLED'),
      spec('دوربین', 'نوع', 'بدون دوربین'), spec('باتری', 'ظرفیت', '۵۰۰۰'), spec('باتری', 'ظرفیت', '۴۰۰۰')] },
    { ...product('p2'), persian_title: 'گوشی ب', specs: [spec('مشخصات کلی', 'وزن', '۱۹۰ گرم'), spec('نمایشگر', 'نوع', 'OLED'), spec('باتری', 'ظرفیت', null)],
      offer_summary: { offer_count: 1, min_price_toman: null, max_price_toman: null, missing_price_count: 1 } },
    { ...product('p3'), persian_title: 'گوشی ج', specs: [],
      offer_summary: { offer_count: 1, min_price_toman: '9223372036854775807', max_price_toman: '9223372036854775807', missing_price_count: 0 } },
    { ...product('p4'), persian_title: 'گوشی د' },
  ];
}
async function setup(page, more = false) {
  let posts = 0;
  await page.route('**/api/assistant/turn', r => { posts++; return r.abort(); });
  await page.route('**/api/products?**', r => {
    const p = new URL(r.request().url()).searchParams;
    if (p.get('q') === 'لپ تاپ') return r.fulfill({ json: { ...cataloguePage([{ ...product('p20'), persian_title: 'لپ‌تاپ جدید', category_name: 'لپ تاپ' }]), category_name: 'لپ تاپ' } });
    if (p.get('offset') === '12') return r.fulfill({ json: { ...cataloguePage([{ ...product('p13'), persian_title: 'محصول صفحه بعد' }]), offset: 12 } });
    const items = products();
    if (more) for (let i = 5; i <= 12; i++) items.push({ ...product(`p${i}`), persian_title: `محصول ${i}` });
    return r.fulfill({ json: cataloguePage(items, more) });
  });
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'گوشی الف', exact: true })).toBeVisible();
  return () => posts;
}
async function add(page, title) {
  await page.getByRole('article', { name: title, exact: true }).getByRole('button', { name: /به مقایسه$/ }).click();
}

test('comparison aligns raw specs, preserves duplicate and negative data, filters equal values and restores keyboard focus', async ({ page }) => {
  const posts = await setup(page);
  await add(page, 'گوشی الف');
  await expect(page.getByRole('button', { name: 'مقایسه محصولات', exact: true })).toBeDisabled();
  await add(page, 'گوشی ب');
  await page.getByRole('button', { name: 'مقایسه محصولات', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'مقایسهٔ محصولات', exact: true });
  await expect(dialog).toBeVisible();
  const camera = dialog.getByRole('row').filter({ hasText: 'بدون دوربین' });
  await expect(camera).toContainText('ردیف متناظر ثبت نشده');
  const battery = dialog.getByRole('row').filter({ hasText: '۵۰۰۰' });
  await expect(battery).toContainText('۴۰۰۰');
  await expect(battery).toContainText('مقدار ثبت نشده');
  const price = dialog.getByRole('row').filter({ hasText: 'کمترین قیمت ثبت‌شده' });
  await expect(price).toContainText('۰ تومان');
  await expect(price).toContainText('قیمت ثبت نشده');
  await dialog.getByRole('checkbox', { name: 'فقط تفاوت‌ها و اطلاعات ناقص' }).check();
  await expect(dialog.getByText('OLED', { exact: true })).toHaveCount(0);
  await expect(camera).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'مقایسه محصولات', exact: true })).toBeFocused();
  expect(posts()).toBe(0);
});

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [959, 800], [960, 844], [1440, 900]]) {
  test(`comparison limit and local horizontal scrolling work at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    await add(page, 'گوشی الف'); await add(page, 'گوشی ب'); await add(page, 'گوشی ج');
    await add(page, 'گوشی د');
    const limit = page.getByRole('status').filter({ hasText: 'حداکثر ۳ محصول' });
    await expect(limit).toBeVisible(); await expect(limit).toBeInViewport();
    await expect(page.getByRole('article', { name: 'گوشی د' }).getByRole('button', { name: /به مقایسه$/ })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'بستن پیام', exact: true }).click();
    await page.getByRole('button', { name: 'مقایسه محصولات', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'مقایسهٔ محصولات', exact: true });
    await expect(dialog.getByRole('heading', { name: 'گوشی ج', exact: true })).toBeVisible();
    await expect(dialog).toContainText('۹٬۲۲۳٬۳۷۲٬۰۳۶٬۸۵۴٬۷۷۵٬۸۰۷');
    const numericLineCount = await dialog.getByRole('row').filter({ hasText: 'کمترین قیمت ثبت‌شده' }).locator('td').nth(2).locator('bdi').evaluate(node => {
      const text = node.firstChild, end = text.textContent.indexOf(' تومان');
      const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, end);
      return range.getClientRects().length;
    });
    expect(numericLineCount).toBe(1);
    const region = dialog.getByRole('region', { name: 'جدول مقایسهٔ محصولات؛ قابل پیمایش افقی', exact: true });
    const corner = dialog.getByRole('columnheader', { name: 'مشخصهٔ منبع', exact: true });
    await corner.scrollIntoViewIfNeeded();
    const before = await corner.boundingBox();
    if (width < 768) {
      expect(await region.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
      await region.evaluate(node => { node.scrollLeft = -node.scrollWidth; });
      const after = await corner.boundingBox();
      expect(Math.abs(before.x - after.x)).toBeLessThan(2);
      const priceBounds = await dialog.getByRole('row').filter({ hasText: 'کمترین قیمت ثبت‌شده' }).locator('td').nth(2).locator('bdi').evaluate(node => {
        const text = node.firstChild, range = document.createRange();
        range.setStart(text, 0); range.setEnd(text, text.textContent.indexOf(' تومان'));
        const rect = range.getBoundingClientRect(); return { left: rect.left, right: rect.right };
      });
      const viewport = await region.boundingBox();
      expect(priceBounds.left).toBeGreaterThanOrEqual(viewport.x);
      expect(priceBounds.right).toBeLessThanOrEqual(after.x);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: `${qa}/comparison-${width}.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.getByRole('article', { name: 'گوشی الف' }).getByRole('button', { name: /از مقایسه$/ }).click();
    await add(page, 'گوشی د');
    await expect(page.getByRole('complementary', { name: 'انتخاب‌های مقایسهٔ محصول' })).toContainText('۳ محصول');
  });
}

test('removing products inside comparison leaves a recoverable minimum state and clear-all releases the tray', async ({ page }) => {
  await setup(page);
  await add(page, 'گوشی الف'); await add(page, 'گوشی ب');
  await page.getByRole('button', { name: 'مقایسه محصولات', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'مقایسهٔ محصولات', exact: true });
  await dialog.getByRole('button', { name: 'حذف گوشی ب از مقایسه', exact: true }).click();
  await expect(dialog.getByText('برای مقایسه، دست‌کم دو محصول انتخاب کنید', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('status')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'انتخاب محصول', exact: true })).toBeFocused();
  await add(page, 'گوشی ج');
  await page.getByRole('button', { name: 'حذف انتخاب‌ها', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'انتخاب‌های مقایسهٔ محصول' })).toHaveCount(0);
});

test('selected products survive pagination and independent searches; seller selection keeps the exact product ID', async ({ page }) => {
  await setup(page, true);
  await page.route('**/api/products/p13/offers?**', r => r.fulfill({ json: offers([offer('o13', 's13', 'p13')]) }));
  await add(page, 'گوشی الف');
  await page.getByRole('button', { name: 'محصولات بیشتر', exact: true }).click();
  await add(page, 'محصول صفحه بعد');
  await page.getByLabel('نام کالا در کاتالوگ').fill('لپ تاپ');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'لپ‌تاپ جدید', exact: true })).toBeVisible();
  await add(page, 'لپ‌تاپ جدید');
  await page.getByRole('button', { name: 'مقایسه محصولات', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'مقایسهٔ محصولات', exact: true });
  await expect(dialog.getByText(/دسته‌های این انتخاب‌ها یکسان نیستند/)).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'گوشی الف', exact: true })).toBeVisible();
  const column = dialog.getByRole('columnheader').filter({ has: page.getByRole('heading', { name: 'محصول صفحه بعد', exact: true }) });
  await column.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
  await expect(page.locator('.ub-panel-top strong')).toHaveText('فروشندگان');
  await expect(page.getByRole('heading', { name: 'محصول صفحه بعد', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'انتخاب این آفر', exact: true })).toBeVisible();
});

test('real snapshot comparison shows the two selected source product titles without a model call', async ({ page }) => {
  await page.route('**/api/assistant/turn', r => r.abort());
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی سامسونگ');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page.locator('.ua-product-card')).toHaveCount(12);
  const titles = [];
  for (const i of [0, 1]) {
    const card = page.locator('.ua-product-card').nth(i);
    titles.push(await card.getByRole('heading').innerText());
    await card.getByRole('button', { name: /به مقایسه$/ }).click();
  }
  await page.getByRole('button', { name: 'مقایسه محصولات', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'مقایسهٔ محصولات', exact: true });
  for (const title of titles) await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(dialog).toContainText('موجودی و تناسب کالا تأیید نشده است');
});

test('dark comparison with reduced motion reports absent specs instead of claiming equal products', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await page.getByRole('combobox', { name: 'تم نمایش' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
  await add(page, 'گوشی ج'); await add(page, 'گوشی د');
  await page.getByRole('button', { name: 'مقایسه محصولات', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'مقایسهٔ محصولات', exact: true });
  await expect(dialog.getByText('مشخصات فنی کافی برای هم‌ترازی در این پاسخ ثبت نشده است.', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/متن ردیف‌های قابل مقایسه یکسان است/)).toHaveCount(0);
  await page.screenshot({ path: `${qa}/comparison-390-dark.png`, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'مقایسه محصولات', exact: true })).toBeFocused();
});
