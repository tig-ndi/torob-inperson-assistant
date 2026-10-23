import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { offer, offers, page as productPage, alternatives, tileOk } from '../ui-b/fixtures.mjs';

const selected = offer('o1', 's1');
const qa = fileURLToPath(new URL('../../../../.local/qa/ui-integration/', import.meta.url));
mkdirSync(qa, { recursive: true });
const initialRows = Array.from({ length: 20 }, (_, i) => offer(`a${i + 1}`, `s${i + 2}`));
function response(body, offset = body.offset, rows = initialRows, more = true) {
  return { ...alternatives(selected, undefined, body.outcome, body.outcome_source),
    status: rows.length ? 'alternatives_available' : 'no_alternatives',
    alternatives: offers(rows, { offset, has_more: more }) };
}
async function setup(page, handler) {
  await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/svg+xml', body: tileOk }));
  await page.route('**/api/products?**', r => r.fulfill({ json: productPage() }));
  await page.route('**/api/products/p1/offers?**', r => r.fulfill({ json: offers([selected]) }));
  await page.route('**/api/followups/alternatives', handler);
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('button', { name: 'دیدن فروشندگان', exact: true }).click();
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).click();
  await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
}
async function report(page) {
  await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه', exact: true }).click();
  await expect(page.locator('.uv-alt-card')).toHaveCount(20);
}
async function budget(page, value) {
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  await page.getByLabel('سقف بودجه به تومان').fill(value);
  await page.getByRole('button', { name: 'اعمال شرایط', exact: true }).click();
}

test('more alternatives retry the same offset, preserve every independent offer and survive navigation', async ({ page }) => {
  const bodies = []; let fail = true;
  await setup(page, r => {
    const body = r.request().postDataJSON(); bodies.push(body);
    if (body.offset === 0) return r.fulfill({ json: response(body) });
    if (fail) { fail = false; return r.fulfill({ status: 503, json: { code: 'catalogue_unavailable' } }); }
    const rows = body.offset === 20 ? [initialRows[19], offer('a21', 's9'), offer('a22', 's9')] : [];
    return r.fulfill({ json: response(body, body.offset, rows, body.offset === 20) });
  });
  await page.getByRole('button', { name: /انتخاب موقعیت/ }).click();
  await page.getByLabel('عرض جغرافیایی').fill('35.7');
  await page.getByLabel('طول جغرافیایی').fill('51.4');
  await page.getByRole('button', { name: 'انتخاب این نقطه', exact: true }).click();
  await page.getByRole('button', { name: 'شرایط جست‌وجو', exact: true }).click();
  await page.getByLabel('سقف بودجه به تومان').fill('9007199254740993');
  await page.getByLabel('شعاع هوایی به کیلومتر').fill('2');
  await page.getByRole('dialog', { name: 'شرایط جست‌وجو' }).getByRole('combobox').selectOption('nearest');
  await page.getByLabel('فقط باز طبق برنامهٔ اعلام‌شده').check();
  await page.getByLabel('فقط منطبق با شرایط ثبت‌شدهٔ اعتبار حضوری').check();
  await page.getByRole('button', { name: 'اعمال شرایط', exact: true }).click();
  await page.locator('input[name=uv-source]').nth(1).check();
  await report(page);
  await page.getByRole('button', { name: 'جایگزین‌های بیشتر', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('سرویس فعلاً');
  await expect(page.getByRole('alert')).toBeInViewport();
  await page.screenshot({ path: `${qa}/alternatives-error-390.png`, animations: 'disabled' });
  await expect(page.locator('.uv-alt-card')).toHaveCount(20);
  await page.getByRole('button', { name: 'تلاش مجدد', exact: true }).click();
  await expect(page.locator('.uv-alt-card')).toHaveCount(22);
  await expect(page.locator('#uv-alternative-a21')).toBeFocused();
  await expect(page.locator('#uv-alternative-a21')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `${qa}/alternatives-loaded-390.png`, animations: 'disabled' });
  expect(bodies.map(b => b.offset)).toEqual([0, 20, 20]);
  for (const body of bodies) expect(body).toMatchObject({ product_id: 'p1', offer_id: 'o1', shop_id: 's1',
    max_price_toman: '9007199254740993', max_distance_km: 2, open_now_only: true, in_person_credit_only: true,
    sort_by: 'nearest', user_lat: 35.7, user_lon: 51.4, outcome_source: 'user_report', limit: 20 });
  await page.goBack();
  await expect(page.locator('.uv-stores')).toBeVisible();
  await page.goForward();
  await expect(page.locator('.uv-alt-card')).toHaveCount(22);
  await expect(page.locator('input[name=uv-source]').nth(1)).toBeChecked();
  await page.getByRole('button', { name: 'جایگزین‌های بیشتر', exact: true }).click();
  await expect(page.getByText('پایان جایگزین‌های ثبت‌شده با این شرایط.', { exact: true })).toBeVisible();
  await expect(page.locator('.uv-alt-card')).toHaveCount(22);
  await expect(page.getByRole('status').filter({ hasText: 'این شمارش کل نتایج' })).toBeFocused();
  expect(bodies.map(b => b.offset)).toEqual([0, 20, 20, 40]);
});

test('changed report and budget disable old alternatives, and a fresh report resets pagination', async ({ page }) => {
  const bodies = [];
  await setup(page, r => { const body = r.request().postDataJSON(); bodies.push(body); return r.fulfill({ json: response(body) }); });
  await report(page);
  await page.locator('input[name=uv-outcome]').nth(2).check();
  await expect(page.getByRole('button', { name: 'جایگزین‌های بیشتر', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'ثبت این جایگزین به‌عنوان مقصد' }).first()).toBeDisabled();
  await budget(page, '0');
  await report(page);
  expect(bodies.map(b => b.offset)).toEqual([0, 0]);
  expect(bodies[1]).toMatchObject({ outcome: 'out_of_stock', max_price_toman: '0' });
  await expect(page.getByRole('button', { name: 'جایگزین‌های بیشتر', exact: true })).toBeEnabled();
});

test('a late page after a filter edit cannot attach to the saved collection', async ({ page }) => {
  let release; let started = false; let finished = false;
  await setup(page, async r => {
    const body = r.request().postDataJSON();
    if (!body.offset) return r.fulfill({ json: response(body) });
    started = true;
    await new Promise(resolve => { release = resolve; });
    await r.fulfill({ json: response(body, 20, [offer('late', 's99')], false) }).catch(() => {});
    finished = true;
  });
  await report(page);
  await page.getByRole('button', { name: 'جایگزین‌های بیشتر', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await budget(page, '100000');
  release(); await expect.poll(() => finished).toBe(true);
  await expect(page.locator('.uv-alt-card')).toHaveCount(20);
  await expect(page.locator('#uv-alternative-late')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'جایگزین‌های بیشتر', exact: true })).toBeDisabled();
});

for (const kind of ['snapshot', 'excluded_shop', 'report_source']) {
  test(`incompatible next page (${kind}) is an error and retains the original alternatives`, async ({ page }) => {
    await setup(page, r => {
      const body = r.request().postDataJSON();
      if (!body.offset) return r.fulfill({ json: response(body) });
      const value = response(body, 20, [offer('bad', kind === 'excluded_shop' ? 's1' : 's99')], false);
      if (kind === 'snapshot') value.alternatives.provenance = { ...value.alternatives.provenance, snapshot_id: 'changed' };
      if (kind === 'report_source') value.outcome.source = 'user_report';
      return r.fulfill({ json: value });
    });
    await report(page);
    await page.getByRole('button', { name: 'جایگزین‌های بیشتر', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('.uv-alt-card')).toHaveCount(20);
    await expect(page.locator('#uv-alternative-bad')).toHaveCount(0);
  });
}

test('real snapshot alternatives continue with exact source offer IDs and exclude the whole reported shop', async ({ page }) => {
  await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/svg+xml', body: tileOk }));
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const script = 'import sqlite3,json,sys; from pathlib import Path; ' +
    'c=sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True); ' +
    'print(json.dumps([r[0] for r in c.execute("SELECT product_id FROM offers JOIN shops USING(shop_id) ' +
    'GROUP BY product_id HAVING count(DISTINCT shop_id)>1 ORDER BY count(*) DESC LIMIT 12")])); c.close()';
  const idsByVolume = JSON.parse(execFileSync(python, ['-c', script,
    process.env.TOROB_DATABASE ?? path.join(root, '.local/catalogue.sqlite3')], { encoding: 'utf8', cwd: root }));
  let candidate;
  for (const id of idsByVolume) {
    const detailResponse = await page.request.get(`/api/products/${encodeURIComponent(id)}`);
    expect(detailResponse.ok()).toBe(true);
    const detail = await detailResponse.json(), product = detail.product;
    const offerPage = await (await page.request.get(`/api/products/${encodeURIComponent(product.product_id)}/offers?limit=20`)).json();
    const first = offerPage.items[0];
    if (!first) continue;
    const response = await page.request.post('/api/followups/alternatives', { data: { product_id: product.product_id,
      offer_id: first.offer_id, shop_id: first.shop_id, outcome: 'no_answer', outcome_source: 'simulated', limit: 20, offset: 0 } });
    expect(response.ok()).toBe(true);
    if ((await response.json()).alternatives.has_more) { candidate = { product, provenance: detail.provenance }; break; }
  }
  expect(candidate, 'snapshot must contain a product with more than one alternative page').toBeTruthy();
  // Controlled discovery handoff of a real detail response; offers and both alternative pages use the actual API.
  await page.route('**/api/products?**', r => r.fulfill({ json: { items: [candidate.product], has_more: false,
    offset: 0, limit: 12, category_name: candidate.product.category_name, min_battery_capacity_mah: null, provenance: candidate.provenance } }));
  await page.goto('/');
  await page.getByLabel('نام کالا در کاتالوگ').fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.locator('.ua-product-card').getByRole('button', { name: 'دیدن فروشندگان' }).click();
  await page.getByRole('button', { name: 'انتخاب این آفر', exact: true }).first().click();
  await page.getByRole('button', { name: 'پیگیری', exact: true }).click();
  const firstResponse = page.waitForResponse(r => r.url().endsWith('/api/followups/alternatives'));
  await page.getByRole('button', { name: 'دیدن جایگزین‌ها با این نتیجه', exact: true }).click();
  const first = await (await firstResponse).json();
  await expect(page.locator('.uv-alt-card')).toHaveCount(first.alternatives.items.length);
  const nextResponse = page.waitForResponse(r => r.url().endsWith('/api/followups/alternatives'));
  await page.getByRole('button', { name: 'جایگزین‌های بیشتر', exact: true }).click();
  const next = await (await nextResponse).json();
  const combined = [...first.alternatives.items, ...next.alternatives.items];
  expect(combined.every(row => row.product_id === candidate.product.product_id && row.shop_id !== first.reported_shop_id)).toBe(true);
  const ids = new Set(combined.map(row => row.offer_id));
  await expect(page.locator('.uv-alt-card')).toHaveCount(ids.size);
  for (const id of ids) await expect(page.locator(`[id="uv-alternative-${encodeURIComponent(id)}"]`)).toHaveCount(1);
  expect(next.alternatives.offset).toBe(20);
});
