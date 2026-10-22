import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNeedState, parseTurn, parseCataloguePage, parseOffers, parsePrepared, parseAlternatives } from '../../src/app/base/domain/parsers.ts';
import { formatMoney, addressEvidence, groupOffers, minimumRecordedPrice } from '../../src/app/base/domain/presentation.ts';
import { needState, turn, offer, offers, page, prepared, alternatives, requestId } from './fixtures.mjs';

test('exact money distinguishes unknown, zero and numbers beyond JS safe integer', () => {
  assert.match(formatMoney(null), /ثبت نشده/);
  assert.equal(formatMoney('0'), '۰ تومان');
  assert.equal(formatMoney('9007199254740993').replace(/[^۰-۹]/g, ''), '۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳');
  assert.throws(() => formatMoney('0.5'));
});
test('address fragments carry literal source evidence and never invent absent units', () => {
  const source = 'تهران، پاساژ نمونه، طبقه دوم، واحد ۱۲';
  const evidence = addressEvidence(source);
  assert.equal(evidence.mall.value, 'نمونه'); assert.equal(evidence.floor.value, 'دوم'); assert.equal(evidence.unit.value, '۱۲');
  for (const part of Object.values(evidence)) assert.ok(source.includes(part.matchedText));
  assert.deepEqual(addressEvidence(null), { mall: null, floor: null, unit: null });
  assert.equal(addressEvidence('کنار بازار و نزدیک طبقات بالایی').unit, null);
});
test('shop grouping keeps independent offers and exact minimum including zero', () => {
  const a = offer(), b = { ...offer('o2'), price_toman: '0' }, c = { ...offer('o3', 's2'), price_toman: null };
  const groups = groupOffers([a, b, c]);
  assert.deepEqual(groups.map(g => g.offers.map(o => o.offer_id)), [['o1', 'o2'], ['o3']]);
  assert.equal(minimumRecordedPrice(groups[0].offers), '0'); assert.equal(minimumRecordedPrice([c]), null);
});
test('need state keeps semantic category separate from cleared SQL filter and retains pending', () => {
  const source = { ...needState(), category_cleared: true, pending_requirements: [{ key: 'گارانتی', source_text: 'گارانتی رسمی', status: 'unsupported' }] };
  assert.deepEqual(parseNeedState(source), source);
  assert.throws(() => parseNeedState({ ...source, version: 2 }));
  assert.throws(() => parseNeedState({ ...source, topic_query: null }));
  assert.throws(() => parseNeedState({ ...source, pending_requirements: [...source.pending_requirements, ...source.pending_requirements] }));
  assert.throws(() => parseNeedState({ ...source, max_price_toman: '9223372036854775808' }));
});
test('assistant parser retains question code, full state and limitations array', () => {
  const result = parseTurn(turn(), requestId);
  assert.deepEqual(result.need_state, needState());
  assert.deepEqual(result.explanation.limitations, ['موجودی تأییدنشده', 'درخواست تماس انجام نشده']);
  assert.equal(result.products.provenance.snapshot_id, 'fixture');
  assert.throws(() => parseTurn(turn(), 'different-request'));
  assert.throws(() => parseTurn({ ...turn(), battery_requirement: { status: 'minimum', minimum_mah: null } }, requestId));
  assert.throws(() => parseTurn({ ...turn(), explanation: { ...turn().explanation, limitations: 'not-an-array' } }, requestId));
});
test('clarification permits retained topic but never a successful products payload', () => {
  const raw = { ...turn(), status: 'needs_input', question: 'بودجه چند تومان است؟', question_code: 'budget', products: null, explanation: null };
  assert.equal(parseTurn(raw, requestId).question_code, 'budget');
  assert.throws(() => parseTurn({ ...raw, products: page() }, requestId));
});
test('nearest witness is distinct from global minimum and rejects cross-product IDs', () => {
  const raw = page(); raw.items[0].nearest_offer = { offer_id: 'o1', product_id: 'p1', shop_id: 's1', price_toman: '100',
    direct_distance_meters: 120, last_price_changed_at: null, inventory_status: 'unconfirmed' };
  const product = parseCataloguePage(raw).items[0];
  assert.equal(product.nearest_offer.price_toman, '100'); assert.equal(product.offer_summary.min_price_toman, '0');
  raw.items[0].nearest_offer.product_id = 'other'; assert.throws(() => parseCataloguePage(raw));
});
test('offer boundary rejects invented inventory, bad coordinates and duplicate offer IDs', () => {
  assert.equal(parseOffers(offers()).items[0].price_toman, '9007199254740993');
  assert.throws(() => parseOffers(offers([{ ...offer(), inventory_status: 'confirmed' }])));
  assert.throws(() => parseOffers(offers([{ ...offer(), shop: { ...offer().shop, lat: 999 } }])));
  assert.throws(() => parseOffers(offers([offer(), offer()])));
});
test('followup retains IDs and rejects sending/contact claims and unrelated alternatives', () => {
  const result = parsePrepared(prepared());
  assert.equal(result.selected_offer.shop_id, 's1'); assert.equal(result.draft.delivery_status, 'draft_not_sent');
  assert.throws(() => parsePrepared({ ...prepared(), draft: { ...prepared().draft, external_contact_attempted: true } }));
  assert.equal(parseAlternatives(alternatives()).alternatives.items[0].shop_id, 's2');
  assert.throws(() => parseAlternatives({ ...alternatives(), alternatives: offers([offer()]) }));
  assert.throws(() => parseAlternatives({ ...alternatives(), outcome: { ...alternatives().outcome, seller_confirmation: true } }));
});
