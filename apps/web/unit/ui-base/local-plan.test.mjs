import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, workspaceReducer as reduce, offerQueryKey, canPlanOffer } from '../../src/app/base/state/model.ts';
import { offer, offers, product } from './fixtures.mjs';
import { parseGuidance } from '../../src/app/screens/a/guidance.ts';

test('source-backed choices preserve zero and huge integers; reject invalid money', () => {
  const valid = { starters: [], budget_samples: ['0', '9007199254740993'], sample_size: 3, query: 'گوشی' };
  assert.deepEqual(parseGuidance(valid).budget_samples, ['0', '9007199254740993']);
  for (const value of [NaN, null, '-1', '9e10', '9223372036854775808']) {
    assert.throws(() => parseGuidance({ ...valid, budget_samples: [value] }));
  }
});

test('an unverified or outdated offer cannot become a new destination', () => {
  let state = reduce(initialWorkspace(), { type: 'product', value: product() });
  state = reduce(state, { type: 'selectOffer', value: offer() });
  assert.equal(canPlanOffer(state, offer()), false);
  assert.equal(reduce(state, { type: 'plan', primary: offer() }).visitPlan, null);
  state = reduce(state, { type: 'offersLoaded', key: offerQueryKey('p1', state.filters, null), page: offers() });
  assert.equal(canPlanOffer(state, offer()), true);
  state = reduce(state, { type: 'filters', value: { maxPrice: '1' } });
  assert.equal(canPlanOffer(state, offer()), false);
});

test('simulation keeps its source, unconfirmed stock and saved destination across filters', () => {
  let state = reduce(initialWorkspace(), { type: 'product', value: product() });
  state = reduce(state, { type: 'offersLoaded', key: offerQueryKey('p1', state.filters, null), page: offers() });
  state = reduce(state, { type: 'plan', primary: offer(), source: 'simulated' });
  assert.equal(state.visitPlan.source, 'simulated');
  assert.equal(state.visitPlan.primary.inventory_status, 'unconfirmed');
  const saved = state.visitPlan;
  state = reduce(state, { type: 'filters', value: { maxPrice: '1' } });
  assert.equal(state.visitPlan, saved);
  state = reduce(state, { type: 'plan', primary: offer(), alternative: null });
  assert.equal(state.visitPlan.source, 'simulated');
});
