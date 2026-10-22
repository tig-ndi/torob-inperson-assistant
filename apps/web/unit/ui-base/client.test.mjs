import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantBody, loadOffers, searchCatalogue, prepareFollowup, ApiError } from '../../src/app/base/domain/client.ts';
import { page, offers, needState, prepared, requestId } from './fixtures.mjs';

const signal = () => new AbortController().signal;
const filters = { maxPrice: '0', radiusKm: null, openNowOnly: true, creditOnly: true, sort: 'price' };
test('assistant budget omission and explicit null are distinct, full state is carried', () => {
  const input = { messages: [{ role: 'user', content: 'گوشی' }], needState: needState(), position: null };
  const body = assistantBody(input, requestId);
  assert.equal(Object.hasOwn(body, 'max_price_toman'), false);
  assert.deepEqual(body.context_need_state, needState());
  assert.equal(assistantBody({ ...input, budgetOverride: null }, requestId).max_price_toman, null);
  assert.throws(() => assistantBody({ ...input, messages: [{ role: 'assistant', content: 'bad order' }] }, requestId));
});
test('offer and search requests preserve exact zero and apply filters on server before pagination', async () => {
  const original = globalThis.fetch, urls = [];
  globalThis.fetch = async url => { urls.push(String(url)); return Response.json(String(url).includes('/offers?') ? offers() : page()); };
  try {
    await loadOffers('p1', filters, null, signal(), 20);
    const query = new URL(urls[0], 'http://localhost').searchParams;
    assert.equal(query.get('max_price_toman'), '0'); assert.equal(query.get('offset'), '20');
    assert.equal(query.get('open_now_only'), 'true'); assert.equal(query.get('in_person_credit_only'), 'true');
    await searchCatalogue({ query: 'گوشی', maxPrice: '0', categoryCleared: true, categoryName: 'گوشی موبایل' }, signal());
    assert.equal(new URL(urls[1], 'http://localhost').searchParams.has('category_name'), false);
  } finally { globalThis.fetch = original; }
});
test('service errors never become a successful empty page and missing location is rejected locally', async () => {
  const original = globalThis.fetch; globalThis.fetch = async () => Response.json({ code: 'catalogue_unavailable' }, { status: 503 });
  try {
    await assert.rejects(loadOffers('p1', filters, null, signal()), e => e instanceof ApiError && e.status === 503);
    assert.throws(() => loadOffers('p1', { ...filters, sort: 'nearest' }, null, signal()));
  } finally { globalThis.fetch = original; }
});
test('followup caller verifies the returned selection instead of accepting another offer', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(prepared());
  try { await assert.rejects(prepareFollowup({ product_id: 'p1', offer_id: 'different', shop_id: 's1' }, null, signal())); }
  finally { globalThis.fetch = original; }
});
