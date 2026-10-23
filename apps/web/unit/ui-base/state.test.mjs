import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, workspaceReducer, offerQueryKey, mergeOffers } from '../../src/app/base/state/model.ts';
import { RequestGate } from '../../src/app/base/state/RequestGate.ts';
import { pinsForWorkspace } from '../../src/app/base/domain/mapPins.ts';
import { product, offer, offers, turn, prepared } from './fixtures.mjs';

const reduce = workspaceReducer;
test('budget edits preserve history, unresolved needs and category-cleared state', () => {
  const response = turn(); response.need_state.category_cleared = true;
  response.need_state.pending_requirements = [{ key: 'رنگ', source_text: 'رنگ آبی', status: 'unsupported' }];
  let state = reduce(initialWorkspace(), { type: 'assistant', result: response, userMessage: 'گوشی آبی', expectedRevision: 0 });
  state = reduce(state, { type: 'filters', value: { maxPrice: '10000000' } });
  assert.equal(state.history.length, 2); assert.equal(state.needState.category_cleared, true);
  assert.equal(state.needState.pending_requirements[0].key, 'رنگ');
  assert.equal(state.filters.maxPrice, '10000000');
});
test('late assistant result cannot overwrite newer budget or query', () => {
  const state = reduce(initialWorkspace(), { type: 'filters', value: { maxPrice: '10' } });
  assert.equal(reduce(state, { type: 'assistant', result: turn(), userMessage: 'old', expectedRevision: 0 }), state);
});
test('product changes invalidate offer selection, followup and visit plan, without transferring confirmation', () => {
  let state = reduce(initialWorkspace(), { type: 'product', value: product() });
  state = reduce(state, { type: 'selectOffer', value: offer() });
  state = reduce(state, { type: 'prepared', result: prepared(), expectedRevision: state.revision });
  state = reduce(state, { type: 'offersLoaded', key: offerQueryKey('p1', state.filters, state.position), page: offers() });
  state = reduce(state, { type: 'plan', primary: offer() });
  assert.ok(state.visitPlan);
  state = reduce(state, { type: 'product', value: product('p2') });
  assert.equal(state.selectedOffer, null); assert.equal(state.visitPlan, null); assert.deepEqual(state.followups, {});
});
test('comparison does not implicitly create a trip and is capped at three products', () => {
  let state = initialWorkspace();
  for (const id of ['p1', 'p2', 'p3', 'p4']) state = reduce(state, { type: 'compareProduct', value: product(id) });
  assert.equal(state.compareProducts.length, 3); assert.match(state.notice, /حداکثر/); assert.equal(state.visitPlan, null);
});
test('back follows actual origin, filters retain selected offer with a review warning', () => {
  let state = reduce(initialWorkspace(), { type: 'navigate', screen: 'results' });
  state = reduce(state, { type: 'navigate', screen: 'trip' });
  state = reduce(state, { type: 'back' }); assert.equal(state.screen, 'results');
  state = reduce(state, { type: 'product', value: product() });
  state = reduce(state, { type: 'selectOffer', value: offer() });
  state = reduce(state, { type: 'filters', value: { openNowOnly: true } });
  assert.equal(state.selectedOffer.offer_id, 'o1'); assert.equal(state.selectionNeedsReview, true);
});
test('map and list use loaded offers from the same filter key without losing multiple offers', () => {
  let state = reduce(initialWorkspace(), { type: 'product', value: product() });
  const key = offerQueryKey('p1', state.filters, null);
  state = reduce(state, { type: 'offersLoaded', key, page: offers([offer(), offer('o2')]) });
  assert.deepEqual(pinsForWorkspace(state)[0].offerIds, ['o1', 'o2']);
  state = reduce(state, { type: 'filters', value: { creditOnly: true } });
  assert.deepEqual(pinsForWorkspace(state), []);
  assert.equal(reduce(state, { type: 'offersLoaded', key, page: offers() }), state);
});
test('offer pagination preserves all source rows and updates a repeated ID only once', () => {
  assert.deepEqual(mergeOffers([offer()], [offer('o2'), { ...offer(), price_toman: '5' }]).map(o => [o.offer_id, o.price_toman]),
    [['o1', '5'], ['o2', '9007199254740993']]);
});
test('request gate ignores a transport that resolves after cancellation', async () => {
  const gate = new RequestGate(); const old = gate.begin(); const fresh = gate.begin();
  await Promise.resolve();
  assert.equal(old.signal.aborted, true); assert.equal(old.isCurrent(), false); assert.equal(fresh.isCurrent(), true);
  gate.cancel(); assert.equal(fresh.isCurrent(), false);
});
