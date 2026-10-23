import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { offer } from '../ui-b/fixtures.mjs';
import { syntheticHours } from '../fixtures/hours.mjs';

const qa = fileURLToPath(new URL('../../../../.local/ui-ux-handoff/cm-b1/', import.meta.url));
mkdirSync(qa, { recursive: true });

async function mount(page) {
  let paidRequests = 0;
  await page.route('**/api/assistant/turn', route => { paidRequests++; return route.abort(); });
  await page.goto('/');
  await expect(page.locator('.ub-app')).toBeVisible();
  const rows = ['unknown', 'declared_open', 'declared_closed'].map(status =>
    offer(status, status, { opening_hours: syntheticHours(status) }));
  await page.evaluate(async rows => {
    const React = (await import('/@id/react')).default;
    const { createRoot } = (await import('/@id/react-dom/client')).default;
    const P = await import('/src/app/base/ui/primitives.tsx');
    const h = React.createElement;
    // Isolate component behavior from the underlying application's focus order.
    const app = document.getElementById('root'); app.inert = true; app.hidden = true;
    const host = document.createElement('section'); host.id = 'cm-fixture'; host.dir = 'rtl';
    host.style.cssText = 'padding:16px;display:grid;gap:16px;min-width:0;max-width:100%;box-sizing:border-box';
    document.body.append(host);
    function Fixture() {
      const [dialog, setDialog] = React.useState(false);
      const [pressed, setPressed] = React.useState(false);
      const [submitted, setSubmitted] = React.useState(0);
      const [retries, setRetries] = React.useState(0);
      const [blocked, setBlocked] = React.useState(true);
      const [toast, setToast] = React.useState('حداکثر ۳ محصول را می‌توانید هم‌زمان مقایسه کنید.');
      return h(React.Fragment, null,
        h('h1', null, 'اجزای مشترک — دادهٔ مصنوعی آزمون'),
        h('form', { onSubmit: e => { e.preventDefault(); setSubmitted(n => n + 1); }, style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
          h(P.Button, { className: 'cm-submit', 'data-testid': 'submit' }, 'ثبت فرم'),
          h(P.Button, { type: 'button', tone: 'secondary', 'aria-pressed': pressed, onClick: () => setPressed(v => !v) }, 'انتخاب شرط'),
          h(P.Button, { type: 'button', disabled: true, onClick: () => setSubmitted(999) }, 'غیرفعال')),
        h('output', { 'data-testid': 'submits' }, String(submitted)),
        h('div', { 'data-testid': 'prices', style: { display: 'grid', gap: '12px', maxWidth: '100%' } },
          ...[null, '0', '9007199254740993001'].map((value, i) => h('div', { key: i, 'data-testid': `price-${i}` }, h(P.Price, { value })))),
        ...rows.map(row => h('div', { key: row.offer_id, 'data-testid': row.offer_id }, h(P.OpenBadge, { offer: row }))),
        h(P.CreditBadge, { offer: rows[0] }), h(P.SimBadge), h(P.FreshTag, { timestamp: null }),
        h(P.Skeleton),
        h(P.Empty, { title: 'نتیجه‌ای با این شرایط ثبت نشده' },
          h('p', null, 'نبود نتیجه، نبود موجودی در تهران را اثبات نمی‌کند.'),
          h(P.Button, { tone: 'secondary', onClick: () => setBlocked(false) }, 'تغییر شرایط')),
        h('div', { 'data-testid': 'error' }, h(P.ErrorCard, { message: 'سرویس موقتاً پاسخ نداد.',
          failure: { kind: 'http', status: 503, code: 'test_failure', message: 'سرویس موقتاً پاسخ نداد.', retryable: !blocked },
          onRetry: () => setRetries(n => n + 1) })),
        h('output', { 'data-testid': 'retries' }, String(retries)),
        h(P.Button, { onClick: () => setDialog(true) }, 'بازکردن پنجره'),
        dialog && h(P.Dialog, { title: 'پنجرهٔ آزمون', className: 'cm-dialog-extra', onClose: () => setDialog(false) },
          h(P.Button, null, 'اول پنجره'), h(P.Button, { tone: 'secondary' }, 'آخر پنجره')),
        h(P.Toast, { message: toast, onClose: () => setToast(null) }));
    }
    createRoot(host).render(h(Fixture));
  }, rows);
  await expect(page.locator('#cm-fixture h1')).toBeVisible();
  return () => paidRequests;
}

for (const [width, height] of [[320, 568], [390, 844], [768, 360], [1440, 900]]) {
  test(`exact money and declared states stay readable in both themes at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const calls = await mount(page);
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator('html')).toHaveAttribute('data-ui-theme', theme);
      await expect(page.getByTestId('price-0')).toHaveText('قیمت ثبت نشده');
      await expect(page.getByTestId('price-1')).toHaveText('۰ تومان');
      await expect(page.getByTestId('price-2')).toHaveText('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٬۰۰۱ تومان');
      await expect(page.getByTestId('unknown')).toHaveText('ساعت نامشخص');
      await expect(page.getByTestId('declared_open')).toHaveText('طبق برنامه باز');
      await expect(page.getByTestId('declared_closed')).toHaveText('طبق برنامه بسته');
      expect(await page.getByTestId('unknown').locator('.ub-badge').evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('dashed');
      expect(await page.getByTestId('submit').evaluate(el => getComputedStyle(el).borderRadius)).toBe('14px');
      expect(await page.getByTestId('submit').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await expect(page.getByText('شرایط اعتبار نامشخص', { exact: true })).toBeVisible();
      await expect(page.getByText('شبیه‌سازی — تماس واقعی انجام نشد', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: `${qa}/components-${width}-${theme}.png`, fullPage: true, animations: 'disabled' });
    }
    expect(calls()).toBe(0);
  });
}

test('button submit, pressed state, disabled state, retry policy and toast close retain their callbacks', async ({ page }) => {
  const calls = await mount(page);
  const submit = page.getByTestId('submit');
  await submit.focus(); await page.keyboard.press('Enter');
  await expect(page.getByTestId('submits')).toHaveText('1');
  await expect(page.getByRole('button', { name: 'غیرفعال', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'انتخاب شرط', exact: true }).click();
  await expect(page.getByRole('button', { name: 'انتخاب شرط', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('submits')).toHaveText('1');
  await expect(page.getByTestId('error').getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'تغییر شرایط', exact: true }).click();
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.getByTestId('retries')).toHaveText('1');
  await page.getByRole('button', { name: 'بستن پیام', exact: true }).click();
  await expect(page.locator('.ub-toast')).toHaveCount(0);
  expect(calls()).toBe(0);
});

test('native dialog preserves focus trapping, Escape, trigger focus and custom class support', async ({ page }) => {
  await mount(page);
  const trigger = page.getByRole('button', { name: 'بازکردن پنجره', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'پنجرهٔ آزمون' });
  await expect(dialog).toHaveClass(/cm-dialog-extra/);
  const close = dialog.getByRole('button', { name: 'بستن پنجره' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'آخر پنجره' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  expect(await close.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
});

test('loading has a single named status and disables shimmer for reduced motion', async ({ page }) => {
  await mount(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const status = page.getByRole('status', { name: 'در حال دریافت', exact: true });
  await expect(status).toHaveCount(1);
  await expect(status).toContainText('در حال دریافت…');
  const bar = status.locator('.up-skeleton-shape > span').first();
  expect(await bar.evaluate(el => getComputedStyle(el).animationName)).toBe('up-shimmer');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await bar.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});
