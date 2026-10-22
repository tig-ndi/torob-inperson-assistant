import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, workspaceReducer as reduce, catalogueSearchForWorkspace, catalogueSearchKey } from '../../src/app/base/state/model.ts';
import { productImageUrl } from '../../src/app/screens/a/resultPresentation.ts';
import { turn, page, product } from '../ui-base/fixtures.mjs';

test('active results switch sources explicitly without leaking an assistant explanation into manual results', () => {
  let state = reduce(initialWorkspace(), { type: 'assistant', result: turn(), userMessage: 'گوشی', expectedRevision: 0 });
  assert.equal(state.productResults.source, 'assistant');
  assert.equal(state.productResults.explanation.summary, turn().explanation.summary);
  assert.equal(catalogueSearchKey(state.productResults.search), catalogueSearchKey(catalogueSearchForWorkspace(state)));
  state = reduce(state, { type: 'query', value: 'کفش' });
  const search = catalogueSearchForWorkspace(state);
  assert.equal(search.categoryName, undefined);
  assert.equal(search.minimumBattery, null);
  state = reduce(state, { type: 'catalogue', page: page([product('shoe')]), search, expectedRevision: state.revision });
  assert.equal(state.productResults.source, 'manual');
  assert.equal(state.productResults.page.items[0].product_id, 'shoe');
  assert.equal(state.productResults.explanation, null);
  assert.equal(state.needState.topic_query, 'گوشی');
  assert.equal(state.history.length, 2);
  state = reduce(state, { type: 'assistant', result: turn(), userMessage: 'گوشی', expectedRevision: state.revision });
  assert.equal(state.productResults.source, 'assistant');
  assert.equal(state.productResults.page.items[0].product_id, 'p1');
});

test('late manual results are rejected, budget edits mark saved context stale, and selecting a product does not lose results', () => {
  let state = reduce(initialWorkspace(), { type: 'query', value: 'گوشی' });
  const search = catalogueSearchForWorkspace(state), revision = state.revision;
  state = reduce(state, { type: 'catalogue', page: page(), search, expectedRevision: revision });
  state = reduce(state, { type: 'product', value: product() });
  assert.equal(catalogueSearchKey(search), catalogueSearchKey(catalogueSearchForWorkspace(state)));
  state = reduce(state, { type: 'filters', value: { maxPrice: '0' } });
  assert.notEqual(catalogueSearchKey(search), catalogueSearchKey(catalogueSearchForWorkspace(state)));
  assert.equal(reduce(state, { type: 'catalogue', page: page([]), search, expectedRevision: revision }), state);
  assert.equal(state.productResults.page.items.length, 1);
});

test('a new clarification cannot be represented as previous successful results; empty evidence stays explicitly empty', () => {
  let state = reduce(initialWorkspace(), { type: 'assistant', result: turn(), userMessage: 'گوشی', expectedRevision: 0 });
  const question = { ...turn(), status: 'needs_input', question: 'چه کالایی؟', products: null };
  state = reduce(state, { type: 'assistant', result: question, userMessage: 'مبهم', expectedRevision: state.revision });
  assert.equal(state.productResults, null);
  state = reduce(state, { type: 'assistant', result: { ...turn(), status: 'no_evidence', products: page([]) }, userMessage: 'کالا', expectedRevision: state.revision });
  assert.equal(state.productResults.page.items.length, 0);
  state = reduce(state, { type: 'newConversation' });
  assert.equal(state.productResults, null);
});

test('refresh preserves cleared category, exact money, battery and location without transferring them to a different product topic', () => {
  const response = turn();
  response.need_state.category_cleared = true;
  response.need_state.battery_requirement = { status: 'minimum', minimum_mah: 5000 };
  let state = reduce(initialWorkspace(), { type: 'assistant', result: response, userMessage: 'گوشی', expectedRevision: 0 });
  state = reduce(state, { type: 'position', value: { lat: 35.7, lon: 51.4, source: 'manual', label: 'آزمون', accuracyMeters: null } });
  state = reduce(state, { type: 'filters', value: { maxPrice: '9007199254740993', sort: 'nearest' } });
  const search = catalogueSearchForWorkspace(state);
  assert.equal(search.maxPrice, '9007199254740993');
  assert.equal(search.categoryCleared, true);
  assert.equal(search.minimumBattery, 5000);
  assert.equal(search.sort, 'nearest');
  assert.equal(search.position.lat, 35.7);
  state = reduce(state, { type: 'query', value: 'کفش' });
  assert.equal(catalogueSearchForWorkspace(state).minimumBattery, null);
  assert.equal(catalogueSearchForWorkspace(state).categoryCleared, undefined);
});

test('product images accept only source HTTP(S) URLs without credentials', () => {
  assert.equal(productImageUrl(['javascript:alert(1)', 'data:image/svg+xml,test', '/untrusted']), null);
  assert.equal(productImageUrl(['https://user:pass@example.com/a', 'https://example.com/ok.png']), 'https://example.com/ok.png');
});

test('a newer explicit request owns the result source even if the other transport completes later', () => {
  let state = reduce(initialWorkspace(), { type: 'query', value: 'گوشی' });
  const revision = state.revision;
  state = reduce(state, { type: 'beginProductResults', token: 'assistant-first' });
  state = reduce(state, { type: 'beginProductResults', token: 'manual-later' });
  assert.equal(reduce(state, { type: 'assistant', result: turn(), userMessage: 'گوشی', expectedRevision: revision,
    expectedResultsRequest: 'assistant-first' }), state);
  state = reduce(state, { type: 'catalogue', page: page(), search: catalogueSearchForWorkspace(state), expectedRevision: revision,
    expectedResultsRequest: 'manual-later' });
  assert.equal(state.productResults.source, 'manual');
  state = reduce(state, { type: 'beginProductResults', token: 'assistant-later' });
  assert.equal(reduce(state, { type: 'catalogue', page: page([]), search: catalogueSearchForWorkspace(state), expectedRevision: revision,
    expectedResultsRequest: 'manual-later' }), state);
  state = reduce(state, { type: 'assistant', result: turn(), userMessage: 'گوشی', expectedRevision: revision,
    expectedResultsRequest: 'assistant-later' });
  assert.equal(state.productResults.source, 'assistant');
});
