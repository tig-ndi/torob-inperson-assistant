import { test, expect } from '@playwright/test';
import { product, cataloguePage, needsInputTurn, resultsTurn } from './fixtures.mjs';
import { offers, offer, prepared, alternatives, tileOk } from '../ui-b/fixtures.mjs';
import { mkdirSync } from 'node:fs';
const visual = '../../.local/agent-visual';
mkdirSync(visual, { recursive: true });

async function setup(page, { disabled = false, malformed = false } = {}) {
  const bodies = [];
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: tileOk }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: disabled
    ? { ready: false, reason: 'disabled', remaining_calls: 0 }
    : { ready: true, reason: 'ready', remaining_calls: 25 } }));
  await page.route('**/api/assistant/guidance**', route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    return route.fulfill({ json: malformed ? { starters: ['bad'], budget_samples: ['NaN'] } : {
      starters: q ? [] : ['گوشی موبایل', 'کفش', 'لپ تاپ'], budget_samples: q ? ['0', '1000000', '9007199254740993'] : [], sample_size: q ? 4 : 0, query: q,
    } });
  });
  await page.route('**/api/products?**', route => route.fulfill({ json: cataloguePage() }));
  await page.route('**/api/products/*/offers**', route => route.fulfill({ json: offers([offer(), offer('o2', 's1')]) }));
  await page.route('**/api/assistant/turn', async route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    let turn;
    if (bodies.length === 1) {
      turn = needsInputTurn('سقف بودجه‌ات چقدر است؟', { need: { max_price_toman: null, budget_needs_input: true, pending_requirements: [] } });
      turn.question_code = 'budget';
    } else {
      turn = resultsTurn({ need: { max_price_toman: '9007199254740993', pending_requirements: [] } });
      const second = { ...product('p2'), persian_title: 'گوشی دوم آزمون' };
      turn.products = cataloguePage([product(), second]);
      turn.explanation.products = [];
    }
    await route.fulfill({ json: { ...turn, request_id: body.request_id } });
  });
  await page.goto('/');
  return bodies;
}

for (const width of [320, 390, 1440]) for (const theme of ['dark', 'light']) {
  test(`chat first responsive ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const bodies = await setup(page);
    await page.getByLabel('تم نمایش').selectOption(theme);
    await expect(page.getByRole('heading', { name: 'دستیار خرید حضوری', exact: true })).toBeVisible();
    await expect(page.locator('.uc-starters button')).toHaveCount(3);
    await expect(page.locator('.ub-search-area')).toHaveCount(0);
    const map = page.getByRole('region', { name: 'نقشهٔ خیابان با کاشی‌های OpenStreetMap' });
    await expect(map).toBeVisible();
    await expect.poll(() => page.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
    const mapBefore = await map.boundingBox();
    const panelBefore = await page.locator('#workspace-panel').boundingBox();
    if (width < 960) expect(mapBefore.y + mapBefore.height).toBeLessThanOrEqual(panelBefore.y + 2);
    else expect(panelBefore.x).toBeGreaterThan(width / 2);
    await page.screenshot({ path: `${visual}/chat-${width}-${theme}.png`, fullPage: true });
    await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی برای استفاده روزمره');
    expect(bodies).toHaveLength(0);
    await page.getByRole('button', { name: 'شروع گفت‌وگو', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'شروع گفت‌وگو', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'شروع گفت‌وگو', exact: true })).toBeEnabled();
    await expect(page.locator('#ua-need')).toBeInViewport();
    const composer = await page.locator('.uc-composer').boundingBox();
    const stream = await page.locator('.uc-stream').boundingBox();
    expect(stream.height).toBeGreaterThan(100);
    expect(stream.y + stream.height).toBeLessThanOrEqual(composer.y + 1);
    expect(await page.locator('.uc-composer').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(map).toBeVisible();
    expect((await map.boundingBox()).height).toBeCloseTo(mapBefore.height, 0);
  });
}

test('small phone keeps the prompt and icon send visible below a readable transcript', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setup(page);
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('گوشی');
  const send = page.getByRole('button', { name: 'شروع گفت‌وگو', exact: true });
  await expect(send).toBeInViewport();
  await expect(page.locator('#ua-need')).toBeInViewport();
  expect((await page.locator('.uc-stream').boundingBox()).height).toBeGreaterThan(48);
  expect(await send.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  expect(await page.locator('.uc-composer').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
});

test('the map prompt types in place and Enter uses the same conversation and history', async ({ page }) => {
  const bodies = await setup(page);
  const prompt = page.getByRole('textbox', { name: 'پیام به دستیار روی نقشه' });
  await prompt.fill('گوشی برای عکاسی');
  expect(bodies).toHaveLength(0);
  await expect(page.getByLabel('نیاز و کاربرد موردنظر')).toHaveValue('گوشی برای عکاسی');
  await prompt.press('Enter');
  await expect(page.locator('.ua-question')).toBeVisible();
  expect(bodies).toHaveLength(1);
  await expect(prompt).toHaveValue('');
  await prompt.fill('بودجه من تا 9007199254740993 تومان است');
  await prompt.press('Enter');
  await expect(page.locator('.uc-product')).toHaveCount(2);
  expect(bodies).toHaveLength(2);
  expect(bodies[1].messages).toHaveLength(3);
  await page.locator('.uc-product').first().getByRole('button', { name: 'فروشگاه‌ها', exact: true }).click();
  await expect(page.locator('.ub-app')).toHaveAttribute('data-screen', 'stores');
  await prompt.fill('همین کالا را با بودجه بیشتر بررسی کن');
  await prompt.press('Enter');
  await expect.poll(() => bodies.length).toBe(3);
  await expect(page.locator('.ub-app')).toHaveAttribute('data-screen', 'decide');
  expect(bodies[2].messages).toHaveLength(5);
});

test('location is requested only after consent and successful permission dismisses the card', async ({ page }) => {
  await page.addInitScript(() => {
    window.__locationCalls = 0;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success) { window.__locationCalls++; success({ coords: { latitude: 35.7, longitude: 51.4, accuracy: 50 } }); },
    } });
  });
  const bodies = await setup(page);
  expect(await page.evaluate(() => window.__locationCalls)).toBe(0);
  await expect(page.getByRole('heading', { name: 'موقعیتت رو بدی؟' })).toBeVisible();
  await page.getByRole('button', { name: 'بله، موقعیتم رو بده', exact: true }).click();
  expect(await page.evaluate(() => window.__locationCalls)).toBe(1);
  await expect(page.locator('.uc-location-nudge')).toHaveCount(0);
  expect(bodies).toHaveLength(0);
});

test('manual location opens the existing selector without requesting browser permission', async ({ page }) => {
  await page.addInitScript(() => {
    window.__locationCalls = 0;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition() { window.__locationCalls++; },
    } });
  });
  await setup(page);
  await page.getByRole('button', { name: 'انتخاب دستی محله', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('انتخاب تقریبی منطقه')).toBeVisible();
  expect(await page.evaluate(() => window.__locationCalls)).toBe(0);
});

test('source price reply retains history and opens real product comparison and stores', async ({ page }) => {
  const bodies = await setup(page);
  await page.locator('.um-map').evaluate(element => element.setAttribute('data-lifetime-test', 'preserved'));
  await page.locator('#ua-need').evaluate(element => element.setAttribute('data-lifetime-test', 'preserved'));
  await page.locator('.uc-starters').getByRole('button', { name: 'گوشی موبایل', exact: true }).click();
  await expect(page.locator('.ua-question')).toHaveText('سقف بودجه‌ات چقدر است؟');
  expect(bodies).toHaveLength(1);
  await expect(page.locator('.uc-budget-choices button')).toHaveCount(3);
  await page.locator('.uc-budget-choices button').last().click();
  await expect(page.locator('.uc-product')).toHaveCount(2);
  expect(bodies).toHaveLength(2);
  expect(bodies[1].messages).toHaveLength(3);
  expect(bodies[1].messages[2].content).toContain('9007199254740993');
  expect(bodies[1].context_need_state.topic_query).toBe('گوشی');
  await page.locator('.uc-product').nth(0).getByRole('button', { name: /افزودن.*مقایسه/ }).click();
  await page.locator('.uc-product').nth(1).getByRole('button', { name: /افزودن.*مقایسه/ }).click();
  await page.getByRole('button', { name: 'مقایسه محصولات', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'بستن پنجره', exact: true }).click();
  await page.locator('.uc-product').first().getByRole('button', { name: 'فروشگاه‌ها', exact: true }).click();
  await expect(page.locator('.ub-app')).toHaveAttribute('data-screen', 'stores');
  await expect(page.locator('.um-map')).toHaveAttribute('data-lifetime-test', 'preserved');
  await page.getByRole('button', { name: 'ادامهٔ گفت‌وگو با دستیار', exact: true }).click();
  await expect(page.locator('.uc-messages')).toContainText('گوشی موبایل');
  await expect(page.locator('.um-map')).toHaveAttribute('data-lifetime-test', 'preserved');
  await expect(page.locator('#ua-need')).toHaveAttribute('data-lifetime-test', 'preserved');
  await expect(page.locator('#ua-need')).toBeFocused();
  expect(bodies).toHaveLength(2);
});

test('desktop wheel zoom works from the first view without a selected product', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const levels = [];
  await setup(page);
  await page.route('https://tile.openstreetmap.org/**', route => {
    levels.push(Number(new URL(route.request().url()).pathname.split('/')[1]));
    return route.fulfill({ contentType: 'image/svg+xml', body: tileOk });
  });
  const current = await page.locator('.leaflet-tile').first().getAttribute('src');
  const initial = Number(new URL(current).pathname.split('/')[1]);
  await page.mouse.move(250, 550);
  await page.mouse.wheel(0, -600);
  await expect.poll(() => levels.some(level => level > initial)).toBe(true);
});

test('budget dialog changes only explicit context and keeps the conversation', async ({ page }) => {
  const bodies = await setup(page);
  await page.locator('.uc-starters button').first().click();
  await expect(page.locator('.ua-question')).toBeVisible();
  await page.getByRole('button', { name: /بودجه و شرایط/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('سقف بودجه به تومان').fill('12500000');
  await dialog.getByRole('button', { name: 'اعمال شرایط' }).click();
  expect(bodies).toHaveLength(1);
  await page.getByLabel('نیاز و کاربرد موردنظر').fill('با همین بودجه ادامه بده');
  await page.getByRole('button', { name: 'ارسال پاسخ', exact: true }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1].max_price_toman).toBe('12500000');
  expect(bodies[1].messages).toHaveLength(3);
});

test('disabled provider has an honest catalogue recovery without paid POSTs', async ({ page }) => {
  const bodies = await setup(page, { disabled: true });
  await page.getByText('ادامه با کاتالوگ، بدون مدل', { exact: true }).click();
  await page.getByLabel('نام کالا', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجوی کاتالوگ', exact: true }).click();
  await expect(page.locator('.ub-app')).toHaveAttribute('data-screen', 'results');
  await expect(page.getByRole('heading', { name: 'گوشی نمونهٔ آزمون', exact: true })).toBeVisible();
  expect(bodies).toHaveLength(0);
});

test('invalid guidance is rejected with explicit recovery', async ({ page }) => {
  const bodies = await setup(page, { malformed: true });
  await expect(page.getByRole('button', { name: 'تلاش مجدد برای دریافت پیشنهادها' })).toBeVisible();
  await expect(page.locator('.uc-starters button')).toHaveCount(1);
  expect(bodies).toHaveLength(0);
});

test('the exact second offer reaches draft and a user-reported unconfirmed visit', async ({ page }) => {
  const bodies = await setup(page, { disabled: true });
  const preparedBodies = [];
  await page.route('**/api/followups/prepare', route => {
    const body = route.request().postDataJSON(); preparedBodies.push(body);
    return route.fulfill({ json: prepared(offer(body.offer_id, body.shop_id)) });
  });
  await page.getByText('ادامه با کاتالوگ، بدون مدل', { exact: true }).click();
  await page.getByLabel('نام کالا', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجوی کاتالوگ', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
  const second = page.locator('#uv-shop-s1 .uv-card').nth(1);
  await second.getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await second.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await page.getByRole('tab', { name: /استعلام خریدار/ }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(4);
  for (const checkbox of await page.getByRole('checkbox').all()) await expect(checkbox).not.toBeChecked();
  await page.getByRole('button', { name: 'ساخت پیش‌نویس رسمی کاتالوگ', exact: true }).click();
  await expect.poll(() => preparedBodies.length).toBe(1);
  expect(preparedBodies[0].offer_id).toBe('o2');
  expect(preparedBodies[0].shop_id).toBe('s1');
  await page.getByRole('button', { name: 'طبق گزارش من موجود بود؛ ساخت برنامهٔ مراجعه', exact: true }).click();
  await expect(page.locator('.ub-app')).toHaveAttribute('data-screen', 'trip');
  await expect(page.getByText('گزارش شما — تأیید بیرونی نشده', { exact: true })).toBeVisible();
  await expect(page.getByText('موجودی تأییدنشده', { exact: true }).first()).toBeVisible();
  expect(bodies).toHaveLength(0);
});

test('a negative seller report requests source-backed alternatives for the exact offer', async ({ page }) => {
  await setup(page, { disabled: true });
  const reports = [];
  await page.route('**/api/followups/alternatives', route => {
    const body = route.request().postDataJSON(); reports.push(body);
    return route.fulfill({ json: alternatives(offer(body.offer_id, body.shop_id), offer('o3', 's2'), body.outcome, body.outcome_source) });
  });
  await page.getByText('ادامه با کاتالوگ، بدون مدل', { exact: true }).click();
  await page.getByLabel('نام کالا', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجوی کاتالوگ', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
  const first = page.locator('#uv-shop-s1 .uv-card').first();
  await first.getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await first.getByRole('button', { name: 'پیگیری', exact: true }).click();
  await page.locator('.uv-advanced-details > summary').click();
  await page.getByRole('radio', { name: /کالا موجود نبود/ }).check();
  await page.getByRole('radio', { name: /گزارش خودم از مراجعه/ }).check();
  await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه', exact: true }).click();
  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0].offer_id).toBe('o1');
  expect(reports[0].outcome).toBe('out_of_stock');
  expect(reports[0].outcome_source).toBe('user_report');
  await expect(page.getByRole('heading', { name: 'فروشگاه‌های جایگزین دارای همین کالا', exact: true })).toBeVisible();
});
