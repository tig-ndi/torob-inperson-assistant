"""P3-A follow-up preparation and same-product alternatives, without live contact."""

from contextlib import closing
from datetime import datetime
import json
import sqlite3
import unittest

from fastapi.testclient import TestClient

from apps.api.main import create_app
import test_api
import test_credit
import test_hours


class FollowupApiTests(unittest.TestCase):
    setUp = test_api.CatalogueApiTests.setUp

    def prepare(self, **changes):
        payload = {'product_id': 'product_two', 'offer_id': 'offer_near_1', 'shop_id': 'shop_near'}
        payload.update(changes)
        return self.client.post('/api/followups/prepare', json=payload)

    def alternatives(self, **changes):
        payload = {
            'product_id': 'product_two', 'offer_id': 'offer_near_1', 'shop_id': 'shop_near',
            'outcome': 'no_answer', 'outcome_source': 'simulated',
        }
        payload.update(changes)
        return self.client.post('/api/followups/alternatives', json=payload)

    def assert_no_contact_fields(self, body):
        text = json.dumps(body, ensure_ascii=False).lower()
        for marker in ('"contacts"', '"phone"', '"telephone"', '"website_url"', '"instagram"',
                       'tel:', 'wa.me', 'whatsapp'):
            self.assertNotIn(marker, text)

    def test_prepare_returns_source_evidence_and_an_explicitly_unsent_draft(self):
        response = self.prepare(product_id='product_one', offer_id='offer_a', shop_id='shop_one')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        body = response.json()
        self.assertEqual(body['status'], 'prepared')
        self.assertEqual(body['product']['product_id'], 'product_one')
        offer = body['selected_offer']
        self.assertEqual((offer['offer_id'], offer['product_id'], offer['shop_id']),
                         ('offer_a', 'product_one', 'shop_one'))
        self.assertEqual(offer['price_toman'], '120000')
        self.assertEqual(offer['last_price_changed_at'], '2020-12-03T00:00:00+00:00')
        self.assertEqual(offer['inventory_status'], 'unconfirmed')
        self.assertEqual(body['draft']['delivery_status'], 'draft_not_sent')
        self.assertFalse(body['draft']['contact_channel_available'])
        self.assertFalse(body['draft']['external_contact_attempted'])
        self.assertIn('گوشي مدل ۱۲', body['draft']['text'])
        self.assertIn('120000', body['draft']['text'])
        self.assertTrue(any('ارسال نشده' in item for item in body['limitations']))
        self.assertTrue(any('ساختگی' in item for item in body['limitations']))
        self.assert_no_contact_fields(body)

    def test_prepare_keeps_null_and_large_prices_exact(self):
        large = self.prepare(product_id='product_one', offer_id='offer_b', shop_id='shop_one').json()
        self.assertEqual(large['selected_offer']['price_toman'], '733518940747298944')
        self.assertEqual(large['selected_offer']['price_quality'], 'above_js_safe_integer')
        missing = self.prepare(product_id='product_one', offer_id='offer_null', shop_id='shop_one').json()
        self.assertIsNone(missing['selected_offer']['price_toman'])
        self.assertEqual(missing['selected_offer']['price_quality'], 'missing')
        self.assertIn('قیمت ثبت‌شده‌ای ندارد', missing['draft']['text'])

    def test_prepare_accepts_paired_coordinates_without_leaking_them(self):
        body = self.prepare(user_lat=35.7001, user_lon=51.4001).json()
        self.assertGreater(body['selected_offer']['direct_distance_meters'], 0)
        serialized = json.dumps(body)
        self.assertNotIn('35.7001', serialized)
        self.assertNotIn('51.4001', serialized)
        for value in (body, body['selected_offer']):
            self.assertNotIn('user_lat', value)
            self.assertNotIn('user_lon', value)

    def test_invalid_missing_and_mismatched_selection_are_distinct(self):
        missing_product = self.prepare(product_id='missing')
        self.assertEqual(missing_product.status_code, 404)
        self.assertEqual(missing_product.json()['code'], 'product_not_found')
        missing_offer = self.prepare(offer_id='missing')
        self.assertEqual(missing_offer.status_code, 404)
        self.assertEqual(missing_offer.json()['code'], 'offer_not_found')
        wrong_product = self.prepare(product_id='product_one')
        self.assertEqual(wrong_product.status_code, 404)
        self.assertEqual(wrong_product.json()['code'], 'offer_not_found')
        mismatched_shop = self.prepare(shop_id='shop_far')
        self.assertEqual(mismatched_shop.status_code, 409)
        self.assertEqual(mismatched_shop.json()['code'], 'offer_shop_mismatch')

    def test_followup_input_is_strict_and_bounded(self):
        cases = [
            {'product_id': 'product_two\n'},
            {'user_lat': 35.7},
            {'user_lon': 51.4},
            {'extra': True},
        ]
        for changes in cases:
            with self.subTest(changes=changes):
                self.assertEqual(self.prepare(**changes).status_code, 422)
        alternative_cases = [
            {'outcome': 'unknown'},
            {'outcome_source': 'verified'},
            {'outcome_source': None},
            {'sort_by': 'nearest'},
            {'max_distance_km': 5},
            {'max_price_toman': '9223372036854775808'},
            {'limit': 51},
            {'offset': -1},
            {'extra': True},
        ]
        for changes in alternative_cases:
            with self.subTest(changes=changes):
                self.assertEqual(self.alternatives(**changes).status_code, 422)

    def test_broken_snapshot_is_a_service_error_for_both_operations(self):
        missing = self.root / 'missing.sqlite3'
        with TestClient(create_app(missing)) as client:
            prepare = client.post('/api/followups/prepare', json={
                'product_id': 'p', 'offer_id': 'o', 'shop_id': 's'})
            alternatives = client.post('/api/followups/alternatives', json={
                'product_id': 'p', 'offer_id': 'o', 'shop_id': 's',
                'outcome': 'closed', 'outcome_source': 'user_report'})
        for response in (prepare, alternatives):
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()['code'], 'catalogue_unavailable')
        self.assertFalse(missing.exists())

    def test_alternatives_exclude_every_offer_of_the_reported_shop(self):
        response = self.alternatives()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        body = response.json()
        self.assertEqual(body['status'], 'alternatives_available')
        self.assertEqual((body['reported_offer_id'], body['reported_shop_id']),
                         ('offer_near_1', 'shop_near'))
        self.assertEqual(body['excluded_offer_count'], 2)
        self.assertEqual(body['outcome'], {
            'kind': 'no_answer', 'source': 'simulated', 'received_at': body['outcome']['received_at'],
            'verified_externally': False, 'seller_confirmation': False})
        self.assertTrue(body['outcome']['received_at'])
        page = body['alternatives']
        self.assertEqual([item['offer_id'] for item in page['items']],
                         ['other_product', 'offer_far', 'offer_no_coord'])
        self.assertTrue(all(item['product_id'] == 'product_two' for item in page['items']))
        self.assertTrue(all(item['shop_id'] != 'shop_near' for item in page['items']))
        self.assertTrue(all(item['inventory_status'] == 'unconfirmed' for item in page['items']))
        self.assertFalse(page['has_more'])
        self.assertTrue(any('کنار گذاشته' in item for item in body['limitations']))
        self.assertTrue(any('تأییدنشده' in item for item in body['limitations']))
        self.assert_no_contact_fields(body)

    def test_alternatives_keep_multiple_offers_from_another_shop(self):
        body = self.alternatives(offer_id='offer_far', shop_id='shop_far').json()
        self.assertEqual(body['excluded_offer_count'], 1)
        items = body['alternatives']['items']
        self.assertEqual([item['offer_id'] for item in items],
                         ['other_product', 'offer_no_coord', 'offer_near_1', 'offer_near_2'])
        near = [item for item in items if item['shop_id'] == 'shop_near']
        self.assertEqual([item['offer_id'] for item in near], ['offer_near_1', 'offer_near_2'])

    def test_budget_radius_and_nearest_are_applied_before_pagination_without_widening(self):
        budget = self.alternatives(max_price_toman='100000').json()
        self.assertEqual([item['offer_id'] for item in budget['alternatives']['items']], ['other_product'])
        radius = self.alternatives(user_lat=35.7, user_lon=51.4, max_distance_km=5).json()
        self.assertEqual([item['offer_id'] for item in radius['alternatives']['items']], ['other_product'])
        nearest = self.alternatives(user_lat=35.7, user_lon=51.4, sort_by='nearest').json()
        self.assertEqual([item['offer_id'] for item in nearest['alternatives']['items']],
                         ['other_product', 'offer_far'])

    def test_open_now_and_in_person_credit_filters_use_existing_rules(self):
        weekly_open = json.dumps({'wed': test_hours.declared(test_hours.shift()),
                                  'tue': test_hours.CLOSED})
        weekly_closed = json.dumps({'wed': test_hours.CLOSED, 'tue': test_hours.CLOSED})
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE shops SET weekly_hours=? WHERE shop_id='shop_one'", (weekly_open,))
            connection.execute("UPDATE shops SET weekly_hours=? WHERE shop_id IN ('shop_far','shop_null_coord')",
                               (weekly_closed,))
            connection.commit()
        instant = datetime.fromisoformat('2026-10-21T10:00:00+03:30')
        with TestClient(create_app(self.database, clock=lambda: instant)) as client:
            payload = {'product_id': 'product_two', 'offer_id': 'offer_near_1', 'shop_id': 'shop_near',
                       'outcome': 'closed', 'outcome_source': 'user_report', 'open_now_only': True}
            body = client.post('/api/followups/alternatives', json=payload).json()
        self.assertEqual([item['offer_id'] for item in body['alternatives']['items']], ['other_product'])
        self.assertEqual(body['outcome']['received_at'], instant.isoformat())
        self.assertEqual(body['alternatives']['hours_evaluated_at'], instant.isoformat())

        matching = test_credit.option(category_names=['گوشی موبایل'])
        mismatch = test_credit.option(category_names=['کفش'])
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE shops SET payment_options=? WHERE shop_id='shop_one'",
                               (json.dumps([matching]),))
            connection.execute("UPDATE shops SET payment_options=? WHERE shop_id='shop_far'",
                               (json.dumps([mismatch]),))
            connection.commit()
        body = self.alternatives(in_person_credit_only=True, limit=10).json()
        self.assertEqual([item['offer_id'] for item in body['alternatives']['items']], ['other_product'])

    def test_no_alternatives_is_explicit_and_pagination_does_not_invent_a_page(self):
        none = self.alternatives(max_price_toman='1').json()
        self.assertEqual(none['status'], 'no_alternatives')
        self.assertEqual(none['alternatives']['items'], [])
        self.assertIn('محصول دیگری جایگزین نشد', none['limitations'][-1])

        pages = []
        for offset in (0, 1, 2, 3):
            pages.append(self.alternatives(limit=1, offset=offset).json())
        self.assertEqual([page['alternatives']['items'][0]['offer_id'] if page['alternatives']['items'] else None
                          for page in pages], ['other_product', 'offer_far', 'offer_no_coord', None])
        self.assertEqual([page['alternatives']['has_more'] for page in pages], [True, True, False, False])
        self.assertEqual([page['status'] for page in pages],
                         ['alternatives_available'] * 3 + ['alternatives_available'])

    def test_same_shop_selection_with_null_price_reports_no_alternative(self):
        prepared = self.prepare(product_id='product_one', offer_id='offer_null', shop_id='shop_one').json()
        self.assertIsNone(prepared['selected_offer']['price_toman'])
        body = self.alternatives(product_id='product_one', offer_id='offer_null', shop_id='shop_one').json()
        self.assertEqual(body['status'], 'no_alternatives')
        self.assertEqual(body['excluded_offer_count'], 3)
        self.assertEqual(body['alternatives']['items'], [])

    def test_followup_operations_do_not_modify_the_snapshot(self):
        before = self.database.read_bytes()
        self.prepare()
        self.alternatives()
        self.assertEqual(before, self.database.read_bytes())


if __name__ == '__main__':
    unittest.main()
