import { test, expect } from '@playwright/test';
import { needsInputTurn, noEvidenceTurn, resultsTurn } from './fixtures.mjs';

const readyStatus = { ready: true, reason: 'ready', remaining_calls: 25 };
const question = 'سقف بودجه‌تان چقدر است؟';

async function settle(route, action) {
  try { await action(); } catch { /* the page may have canceled the request first */ }
}

async function openDecide(page, options = {}) {
  const calls = { status: 0, posts: 0, bodies: [] };
  const status = options.status ?? readyStatus;
  await page.route('**/api/assistant/status', async route => {
    calls.status++;
    await settle(route, () => status === 'error'
      ? route.fulfill({ status: 503, json: { code: 'provider_unavailable' } })
      : route.fulfill({ json: status }));
  });
  await page.route('**/api/assistant/turn', async route => {
    const body = route.request().postDataJSON();
    calls.posts++; calls.bodies.push(body);
    const response = options.turn ? options.turn(body, calls.posts) : { turn: needsInputTurn() };
    if (response.error) {
      await settle(route, () => route.fulfill({ status: response.error, json: { code: response.code ?? 'request_failed' } }));
      return;
    }
    if (response.delay) await new Promise(resolve => setTimeout(resolve, response.delay));
    await settle(route, () => route.fulfill({ json: { ...response.turn, request_id: body.request_id } }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'نیازتان را بگویید' })).toBeVisible();
  return calls;
}

function outcome(page) { return page.locator('.ua-outcome'); }

for (const [width, height] of [[320, 568], [390, 844], [1440, 844]]) {
  test(`a fresh clarification is visible without manual scrolling at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openDecide(page);
    await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی برای عکاسی');
    await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
    await expect(outcome(page)).toBeFocused();
    await expect(outcome(page).getByText(question, { exact: true })).toBeInViewport();
  });
}

test('decide checks status on entry, sends only on submit, and keeps the outcome on decide', async ({ page }) => {
  const calls = await openDecide(page);
  await expect(page.getByText(/آمادهٔ بررسی نیاز است/)).toBeVisible();
  await expect(page.getByText(/درخواست مجاز باقی‌مانده/)).toBeVisible();
  expect(calls.status).toBeGreaterThan(0);
  expect(calls.posts).toBe(0);

  const box = page.getByLabel('نیاز و کاربرد موردنظر');
  await box.fill('گوشی برای عکاسی');
  await page.waitForTimeout(250);
  expect(calls.posts).toBe(0);

  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(outcome(page).getByRole('heading', { name: 'برای ادامه به پاسخ شما نیاز است' })).toBeVisible();
  await expect(outcome(page).getByText(question)).toBeVisible();
  expect(calls.posts).toBe(1);
  expect(calls.bodies[0].messages).toEqual([{ role: 'user', content: 'گوشی برای عکاسی' }]);
  expect(calls.bodies[0].max_price_toman).toBe(null);
  expect(calls.bodies[0].context_need_state).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'نیازتان را بگویید' })).toBeVisible();
  await expect(box).toHaveValue('');
  await expect(page.getByText('internal_budget_check')).toHaveCount(0);
  await expect(page.getByText('هنوز اعمال نشده')).toBeVisible();
  await expect(page.getByText('پشتیبانی‌نشده')).toBeVisible();
});

test('budget change preserves history and the next turn carries the exact override', async ({ page }) => {
  const calls = await openDecide(page);
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی برای عکاسی');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(outcome(page).getByText(question)).toBeVisible();

  await page.locator('.ua-history > summary').click();
  await expect(page.locator('.ua-history')).toContainText('گوشی برای عکاسی');
  await expect(page.locator('.ua-history')).toContainText(question);

  await page.getByRole('button', { name: 'بودجه و شرایط', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'شرایط جست‌وجو' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('سقف بودجه به تومان').fill('12500000');
  await dialog.getByRole('button', { name: 'اعمال شرایط' }).click();
  await expect(dialog).toBeHidden();
  expect(calls.posts).toBe(1);
  await expect(page.getByText(/بودجهٔ فعال در ارسال بعدی/)).toBeVisible();
  await expect(page.getByText(/بودجهٔ فعال با بودجهٔ ثبت‌شده در گفت‌وگو/)).toBeVisible();
  await expect(page.locator('.ua-history')).toContainText(question);

  await page.getByLabel('نیاز و کاربرد موردنظر').fill('بله، همین کافی است');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect.poll(() => calls.posts).toBe(2);
  const second = calls.bodies[1];
  expect(second.max_price_toman).toBe('12500000');
  expect(second.context_need_state.max_price_toman).toBe('10000000');
  expect(second.messages.length).toBe(3);
  expect(second.messages[0].content).toBe('گوشی برای عکاسی');
  expect(second.messages[1].role).toBe('assistant');
  expect(second.messages[2].content).toBe('بله، همین کافی است');
});

test('unknown status allows explicit submit, does not auto-retry, and can be rechecked', async ({ page }) => {
  const calls = await openDecide(page, { status: 'error' });
  await expect(page.getByText(/وضعیت دستیار: نامشخص است/)).toBeVisible();
  await expect(page.getByText(/ارسال صریح نیاز همچنان ممکن است/)).toBeVisible();
  const statusCalls = calls.status;
  await page.waitForTimeout(300);
  expect(calls.status).toBe(statusCalls);
  await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeDisabled();

  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی برای عکاسی');
  await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(outcome(page).getByText(question)).toBeVisible();
  expect(calls.posts).toBe(1);

  const before = calls.status;
  await page.getByRole('button', { name: 'بررسی مجدد وضعیت' }).click();
  await expect.poll(() => calls.status).toBeGreaterThan(before);
});

test('a valid capped status disables sending with a precise reason', async ({ page }) => {
  const calls = await openDecide(page, { status: { ready: false, reason: 'attempt_limit', remaining_calls: 0 } });
  await expect(page.getByText(/سقف درخواست‌های دستیار مصرف شده است/)).toBeVisible();
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeDisabled();
  expect(calls.posts).toBe(0);
});

test('a failed turn keeps the draft and retry remains explicit', async ({ page }) => {
  const calls = await openDecide(page, { turn: (_body, count) => count === 1
    ? { error: 503, code: 'provider_unavailable' }
    : { turn: resultsTurn() } });
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی برای عکاسی');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('سرویس فعلاً در دسترس نیست');
  await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toHaveValue('گوشی برای عکاسی');
  await page.waitForTimeout(300);
  expect(calls.posts).toBe(1);
  await page.getByRole('button', { name: 'تلاش مجدد' }).click();
  await expect(outcome(page).getByRole('heading', { name: 'پاسخ کاتالوگ برای این درخواست' })).toBeVisible();
  expect(calls.posts).toBe(2);
  await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toHaveValue('');
  await expect(outcome(page).getByText('موجودی تأیید نشده')).toBeVisible();
});

test('a no-evidence answer is shown neutrally and stays on decide', async ({ page }) => {
  await openDecide(page, { turn: () => ({ turn: noEvidenceTurn() }) });
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی برای عکاسی');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(outcome(page).getByRole('heading', { name: 'در کاتالوگ ثبت‌شده نتیجه‌ای برنگشت' })).toBeVisible();
  await expect(outcome(page).getByText(/محصولی در پاسخ ثبت‌شده برنگشت/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'نیازتان را بگویید' })).toBeVisible();
});

test('canceling stops the browser request without claiming provider work stopped', async ({ page }) => {
  const calls = await openDecide(page, { turn: () => ({ delay: 1500, turn: resultsTurn() }) });
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی برای عکاسی');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.getByText('در حال ارسال به دستیار…')).toBeVisible();
  await page.getByRole('button', { name: 'لغو درخواست' }).click();
  await expect(page.getByText(/توقف نمایش پاسخ، پایان پردازش یا مصرف سرویس را تضمین نمی‌کند/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'لغو درخواست' })).toHaveCount(0);
  await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toHaveValue('گوشی برای عکاسی');
  await page.waitForTimeout(1800);
  await expect(outcome(page)).toHaveCount(0);
  expect(calls.posts).toBe(1);
});

test('leaving decide cancels pending work and a late response does not overwrite state', async ({ page }) => {
  await openDecide(page, { turn: () => ({ delay: 1200, turn: resultsTurn() }) });
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی برای عکاسی');
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).click();
  await expect(page.getByText('در حال ارسال به دستیار…')).toBeVisible();
  await page.getByRole('button', { name: 'بازگشت به مرحلهٔ قبل' }).click();
  await expect(page.getByRole('heading', { name: 'از کجا شروع کنیم؟' })).toBeVisible();
  await page.waitForTimeout(1400);
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'نیازتان را بگویید' })).toBeVisible();
  await expect(outcome(page)).toHaveCount(0);
  await expect(page.locator('.ua-history')).toHaveCount(0);
});

test('keyboard flow, dialog escape, and focus return stay usable', async ({ page }) => {
  await openDecide(page);
  const box = page.getByLabel('نیاز و کاربرد موردنظر');
  await box.fill('گوشی');
  await box.press('Tab');
  await expect(page.getByRole('button', { name: 'بررسی نیاز', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'بودجه و شرایط', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'شرایط جست‌وجو' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'شرایط جست‌وجو' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'بودجه و شرایط', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'بررسی نیاز', exact: true }).press('Enter');
  await expect(outcome(page).getByText(question)).toBeVisible();
});

for (const width of [320, 390, 768, 959, 960, 1440]) {
  test(`decide fits without horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openDecide(page);
    await expect(page.getByText(/آمادهٔ بررسی نیاز است/)).toBeVisible();
    const submit = page.getByRole('button', { name: 'بررسی نیاز', exact: true });
    await expect(submit).toBeVisible();
    await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width <= 390) {
      await page.evaluate(() => scrollTo(0, 0));
      const box = await submit.boundingBox();
      expect(box).not.toBeNull();
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
  });
}
