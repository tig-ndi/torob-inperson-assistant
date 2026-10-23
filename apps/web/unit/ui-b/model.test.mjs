import test from 'node:test';
import assert from 'node:assert/strict';
import { alternativeOrigin, mapLink, offerCoordinates, selectionReview, shopFacts, shopName, storeGroups,
  tripAlternatives } from '../../src/app/screens/b/model.ts';
import { offer, offers } from '../ui-base/fixtures.mjs';

test('store grouping keeps every offer_id of one shop without collapsing rows', () => {
  const groups = storeGroups([
    offer('o1', 's1'),
    { ...offer('o2', 's1'), price_toman: '0' },
    { ...offer('o3', 's2'), price_toman: null },
  ]);
  assert.deepEqual(groups.map(group => group.offers.map(item => item.offer_id)), [['o1', 'o2'], ['o3']]);
  assert.equal(groups[0].title, 'نام نمایشی آزمون');
  assert.equal(groups[1].title, 'نام نمایشی آزمون');
  assert.equal(groups[1].address, offer('o3', 's2').shop.address);
});

test('selection identity is offer_id; another offer in the same shop is not the selected one', () => {
  const selected = offer('o2', 's1');
  assert.equal(selectionReview(selected, [offer('o1', 's1'), selected]), 'visible');
  assert.equal(selectionReview(selected, [offer('o1', 's1'), offer('o3', 's2')]), 'outside');
  assert.equal(selectionReview(null, []), 'none');
});

test('alternatives add-ons and destination origin come only from the recorded endpoint result', () => {
  const reported = offer('o1', 's1');
  const next = offer('o3', 's2');
  const followups = { o1: { prepared: null, alternatives: {
    status: 'alternatives_available', product_id: 'p1', reported_offer_id: 'o1', reported_shop_id: 's1',
    excluded_offer_count: 1, outcome: { kind: 'no_answer', source: 'simulated', received_at: '2026-10-23T10:00:00Z',
      verified_externally: false, seller_confirmation: false },
    alternatives: offers([next]), limitations: [],
  } } };
  assert.deepEqual(tripAlternatives(followups, reported).map(item => [item.offer.offer_id, item.source]), [['o3', 'simulated']]);
  assert.deepEqual(tripAlternatives(followups, next), []);
  assert.equal(alternativeOrigin(followups, next), 'simulated');
  assert.equal(alternativeOrigin(followups, reported), undefined);
  assert.deepEqual(tripAlternatives({}, reported), []);
});

test('trip coordinates and external map links require a real coordinate pair', () => {
  const withPoint = offer('o1', 's1');
  assert.deepEqual(offerCoordinates(withPoint), { lat: 35.7, lon: 51.4 });
  assert.match(mapLink(withPoint), /openstreetmap\.org\/\?mlat=35\.7&mlon=51\.4/);
  const withoutPoint = { ...withPoint, shop: { ...withPoint.shop, lat: null } };
  assert.equal(offerCoordinates(withoutPoint), null);
  assert.equal(mapLink(withoutPoint), null);
  assert.equal(mapLink({ ...withPoint, shop: { ...withPoint.shop, lat: 999 } }), null);
});

test('mall and floor quotes come only from the literal address text', () => {
  const facts = shopFacts(offer('o1', 's1'));
  assert.equal(facts.name, 'نام نمایشی آزمون');
  assert.equal(shopName(offer('o1', 's1')), 'نام نمایشی آزمون');
  assert.equal(facts.mall.value, 'نمونه');
  assert.equal(facts.floor.value, 'دوم');
  assert.equal(facts.unit.value, '۱۲');
  assert.equal(facts.address, offer('o1', 's1').shop.address);
  const unknown = shopFacts({ ...offer('o1', 's1'), shop: { ...offer('o1', 's1').shop, address: 'تهران، محدودهٔ نامشخص' } });
  assert.equal(unknown.mall, null);
  assert.equal(unknown.floor, null);
  assert.equal(unknown.unit, null);
});
