import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, workspaceReducer as reduce, appendProductPage, catalogueSearchForWorkspace } from '../../src/app/base/state/model.ts';
import { nextProductSearch } from '../../src/app/screens/a/pagination.ts';
import { page, product, turn } from '../ui-base/fixtures.mjs';

function firstResults(source = 'manual') {
  let state = reduce(initialWorkspace(), { type: 'query', value: 'گوشی' });
  const first = { ...page([product('p1'), product('p2')]), has_more: true };
  if (source === 'assistant') {
    const response = { ...turn(), products: first };
    state = reduce(state, { type: 'assistant', result: response, userMessage: 'گوشی', expectedRevision: state.revision });
  } else state = reduce(state, { type: 'catalogue', page: first, search: catalogueSearchForWorkspace(state), expectedRevision: state.revision });
  return state;
}

test('next-page search preserves exact constraints and fixes the effective category from the source', () => {
  const base = firstResults().productResults;
  base.search = { ...base.search, maxPrice: '9007199254740993', minimumBattery: 5000, sort: 'nearest',
    position: { lat: 35.7, lon: 51.4, source: 'manual', label: 'آزمون', accuracyMeters: null } };
  assert.deepEqual(nextProductSearch(base), { ...base.search, categoryName: 'گوشی موبایل', offset: 12, limit: 12 });
  base.search.categoryCleared = true;
  assert.equal(nextProductSearch(base).categoryName, null);
  assert.equal(nextProductSearch(base).categoryCleared, true);
});

test('pages deduplicate by product ID, advance by server offset and limit, and retain source and original evidence', () => {
  const base = firstResults('assistant').productResults;
  const next = { ...page([product('p2'), product('p3')]), offset: 12, has_more: true };
  const merged = appendProductPage(base, next);
  assert.deepEqual(merged.page.items.map(p => p.product_id), ['p1', 'p2', 'p3']);
  assert.equal(merged.source, 'assistant');
  assert.equal(merged.explanation, base.explanation);
  assert.equal(merged.initialOffset, 0);
  assert.equal(merged.search, base.search);
  assert.equal(nextProductSearch(merged).offset, 24);
  assert.equal(base.page.items.length, 2);
});

test('wrong page, snapshot or constraints never merge into the saved result set', () => {
  const base = firstResults().productResults;
  const next = { ...page([product('p3')]), offset: 12 };
  for (const bad of [
    { ...next, offset: 24 },
    { ...next, limit: 10 },
    { ...next, items: [], has_more: true },
    { ...next, category_name: 'کفش' },
    { ...next, min_battery_capacity_mah: 5000 },
    { ...next, provenance: { ...next.provenance, snapshot_id: 'new' } },
    { ...next, provenance: { ...next.provenance, generated_at_utc: '2026-10-24T00:00:00Z' } },
  ]) assert.throws(() => appendProductPage(base, bad));
  assert.equal(base.page.items.length, 2);
});

test('late pages cannot attach after conditions, source request or the base page changed', () => {
  let state = firstResults();
  const base = state.productResults;
  state = reduce(state, { type: 'beginProductResults', token: 'page2' });
  const action = { type: 'moreProducts', base, page: { ...page([product('p3')]), offset: 12 },
    expectedRevision: state.revision, expectedResultsRequest: 'page2' };
  const changed = reduce(state, { type: 'filters', value: { maxPrice: '0' } });
  assert.equal(reduce(changed, action), changed);
  const newerRequest = reduce(state, { type: 'beginProductResults', token: 'new-search' });
  assert.equal(reduce(newerRequest, action), newerRequest);
  const committed = reduce(state, action);
  assert.equal(committed.productResults.page.items.length, 3);
  assert.equal(reduce(committed, action), committed);
  assert.equal(committed.needState, state.needState);
  assert.equal(committed.history, state.history);
});
