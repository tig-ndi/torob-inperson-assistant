import test from 'node:test';
import assert from 'node:assert/strict';
import { appendAlternatives, alternativeSearchKey } from '../../src/app/base/state/alternativePages.ts';
import { initialWorkspace, workspaceReducer as reduce } from '../../src/app/base/state/model.ts';
import { findAlternatives } from '../../src/app/base/domain/client.ts';
import { alternatives, offer, offers, product } from '../../tests/ui-b/fixtures.mjs';

function first() { return { ...alternatives(), alternatives: offers([offer('a1', 's2')], { has_more: true }) }; }
function next() { return { ...alternatives(), outcome: { ...alternatives().outcome, received_at: '2026-10-23T11:00:00Z' },
  alternatives: offers([offer('a1', 's2'), offer('a2', 's2', { price_toman: '9007199254740993' })], { offset: 20 }) }; }
function search() { return { selection: { product_id: 'p1', offer_id: 'o1', shop_id: 's1' }, outcome: 'no_answer', source: 'simulated',
  filters: { ...initialWorkspace().filters, maxPrice: '9007199254740993' },
  position: { lat: 35.7, lon: 51.4, source: 'manual', label: 'آزمون', accuracyMeters: null } }; }

test('alternative pages deduplicate only offer IDs and keep first report metadata and exact money', () => {
  const base = first(), before = structuredClone(base);
  const result = appendAlternatives(base, next());
  assert.deepEqual(result.alternatives.items.map(row => row.offer_id), ['a1', 'a2']);
  assert.equal(result.alternatives.items[1].shop_id, 's2');
  assert.equal(result.alternatives.items[1].price_toman, '9007199254740993');
  assert.equal(result.alternatives.offset, 20);
  assert.equal(result.outcome.received_at, base.outcome.received_at);
  assert.deepEqual(base, before);
  const end = { ...next(), status: 'no_alternatives', alternatives: offers([], { offset: 40 }) };
  const loaded = appendAlternatives({ ...result, alternatives: { ...result.alternatives, has_more: true } }, end);
  assert.equal(loaded.status, 'alternatives_available');
  assert.equal(loaded.alternatives.items.length, 2);
  assert.equal(loaded.alternatives.has_more, false);
});

test('wrong page, snapshot, report source and excluded shop cannot contaminate an alternative collection', () => {
  const invalid = [
    { ...next(), alternatives: { ...next().alternatives, offset: 40 } },
    { ...next(), alternatives: { ...next().alternatives, provenance: { ...next().alternatives.provenance, snapshot_id: 'changed' } } },
    { ...next(), outcome: { ...next().outcome, source: 'user_report' } },
    { ...next(), alternatives: offers([offer('bad', 's1')], { offset: 20 }) },
    { ...next(), alternatives: offers([offer('bad', 's2', { product_id: 'different' })], { offset: 20 }) },
    { ...next(), excluded_offer_count: 3 },
    { ...next(), alternatives: offers([], { offset: 20, has_more: true }) },
  ];
  for (const page of invalid) assert.throws(() => appendAlternatives(first(), page));
});

test('request identity includes all constraints and a late merge cannot replace a new collection', () => {
  const context = search(), key = alternativeSearchKey(context);
  for (const filters of [{ maxPrice: '0' }, { radiusKm: 5 }, { openNowOnly: true }, { creditOnly: true }, { sort: 'nearest' }]) {
    assert.notEqual(alternativeSearchKey({ ...context, filters: { ...context.filters, ...filters } }), key);
  }
  assert.notEqual(alternativeSearchKey({ ...context, position: { ...context.position, lat: 35.8 } }), key);
  assert.notEqual(alternativeSearchKey({ ...context, outcome: 'closed' }), key);
  assert.notEqual(alternativeSearchKey({ ...context, source: 'user_report' }), key);
  let state = reduce(initialWorkspace(), { type: 'product', value: product() });
  const base = first(), revision = state.revision;
  state = reduce(state, { type: 'alternatives', result: base, expectedRevision: revision, search: context });
  state = reduce(state, { type: 'alternatives', result: first(), expectedRevision: revision, search: context });
  assert.equal(reduce(state, { type: 'alternatives', result: appendAlternatives(base, next()), base,
    expectedRevision: revision, search: context }), state);
});

test('the client rejects a returned outcome or offset that differs from the requested report', async () => {
  const original = globalThis.fetch;
  try {
    for (const value of [{ ...alternatives(), outcome: { ...alternatives().outcome, source: 'user_report' } },
      { ...alternatives(), alternatives: offers([], { offset: 20 }) }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(value), { status: 200 });
      const input = search();
      await assert.rejects(findAlternatives(input.selection, input.outcome, input.filters, input.position, new AbortController().signal));
    }
  } finally { globalThis.fetch = original; }
});
