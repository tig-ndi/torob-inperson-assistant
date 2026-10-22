"""Independent synthetic API checks: source linkage and global nearest ordering."""

from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from apps.api.assistant import AgentSettings
from apps.api.intent import AssistantRequest, QUESTIONS, query_choices
import test_api
import test_assistant


class NearestCatalogueTests(unittest.TestCase):
    setUp = test_api.CatalogueApiTests.setUp

    def test_nearest_is_global_before_pagination_and_preserves_same_shop_offers(self):
        params = {'sort_by': 'nearest', 'user_lat': 35.71, 'user_lon': 51.41, 'limit': 1}
        pages = [self.client.get('/api/products/product_two/offers', params={**params, 'offset': i}).json()
                 for i in range(4)]
        self.assertEqual([p['items'][0]['offer_id'] for p in pages],
                         ['offer_near_1', 'offer_near_2', 'other_product', 'offer_far'])
        self.assertTrue(pages[0]['has_more'])
        self.assertFalse(pages[-1]['has_more'])
        self.assertTrue(all(p['items'][0]['inventory_status'] == 'unconfirmed' for p in pages))
        default = self.client.get('/api/products/product_two/offers').json()
        self.assertEqual(default['items'][0]['offer_id'], 'other_product')
        self.assertIn('offer_no_coord', [o['offer_id'] for o in default['items']])

    def test_nearest_combines_budget_radius_and_does_not_widen(self):
        params = {'sort_by': 'nearest', 'user_lat': 35.71, 'user_lon': 51.41,
                  'max_price_toman': '190000', 'limit': 1}
        data = self.client.get('/api/products/product_two/offers', params=params).json()
        self.assertEqual(data['items'][0]['offer_id'], 'other_product')
        empty = self.client.get('/api/products/product_two/offers', params={**params, 'max_distance_km': 0.1}).json()
        self.assertEqual(empty['items'], [])

    def test_nearest_orders_unrounded_distance_not_display_rounding(self):
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE shops SET lat=35.710002,lon=51.41 WHERE shop_id='shop_far'")
            connection.commit()
        data = self.client.get('/api/products/product_two/offers', params={
            'sort_by': 'nearest', 'user_lat': 35.71, 'user_lon': 51.41}).json()
        # All three round to zero metres; the further but cheaper offer stays third.
        self.assertEqual([o['offer_id'] for o in data['items'][:3]], ['offer_near_1', 'offer_near_2', 'offer_far'])
        self.assertEqual([o['direct_distance_meters'] for o in data['items'][:3]], [0, 0, 0])

    def test_product_ranking_has_actual_budget_qualifying_offer_witness(self):
        data = self.client.get('/api/products', params={
            'q': 'گوشی', 'category_name': 'گوشی موبایل', 'sort_by': 'nearest',
            'user_lat': 35.71, 'user_lon': 51.41, 'limit': 1, 'max_price_toman': '250000'}).json()
        product = data['items'][0]
        self.assertEqual(product['product_id'], 'product_two')
        self.assertEqual(product['nearest_offer']['offer_id'], 'offer_near_1')
        self.assertEqual(product['nearest_offer']['price_toman'], '200000')
        self.assertEqual(product['nearest_offer']['direct_distance_meters'], 0)
        self.assertEqual(product['nearest_offer']['shop_id'], 'shop_near')
        self.assertTrue(data['has_more'])
        # Cheaper global summary is not relabeled as the nearest seller's price.
        self.assertEqual(product['offer_summary']['min_price_toman'], '2')

    def test_missing_coordinates_cannot_win_product_ranking(self):
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE offers SET shop_id='shop_null_coord' WHERE product_id='product_one'")
            connection.commit()
        data = self.client.get('/api/products', params={
            'q': 'گوشی', 'category_name': 'گوشی موبایل', 'sort_by': 'nearest',
            'user_lat': 35.71, 'user_lon': 51.41}).json()
        self.assertEqual([p['product_id'] for p in data['items']], ['product_two'])

    def test_invalid_location_or_sort_is_a_validation_error(self):
        for path, base in [('/api/products', {'q': 'گوشی'}), ('/api/products/product_two/offers', {})]:
            for params in [{'sort_by': 'nearest'}, {'user_lat': 35.7},
                           {'sort_by': 'nearest', 'user_lat': 'nan', 'user_lon': 51.4}, {'sort_by': 'arbitrary'}]:
                with self.subTest(path=path, params=params):
                    self.assertEqual(self.client.get(path, params={**base, **params}).status_code, 422)


class VisitAssistantTests(unittest.TestCase):
    setUp = test_assistant.AssistantApiTests.setUp

    def post(self, text, **changes):
        return self.agent_client.post('/api/assistant/turn', json=test_assistant.body(
            text, context_query='گوشی سامسونگ', context_category='گوشی موبایل',
            max_price_toman='100000000', **changes))

    def test_location_followup_keeps_identity_and_asks_without_searching(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی سامسونگ'))
        with patch.object(self.service.catalogue, 'search', side_effect=AssertionError('premature retrieval')):
            response = self.post('نزدیک ترین به مکان فعلیم باشه')
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual((result['status'], result['query'], result['offer_sort']),
                         ('needs_input', 'گوشی سامسونگ', 'nearest'))
        self.assertEqual(result['question'], QUESTIONS['location'])
        self.assertIsNone(result['products'])

    def test_colour_and_location_does_not_silently_apply_only_one_condition(self):
        text = 'رنگ آبی باشه و نزدیک ترین به مکان فعلیم میبایست باشه'
        request = AssistantRequest.model_validate(test_assistant.body(text, context_query='گوشی سامسونگ'))
        self.assertEqual(query_choices(request), ['گوشی سامسونگ'])
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی سامسونگ'))
        result = self.post(text, user_lat=35.71, user_lon=51.41).json()
        self.assertEqual(result['query'], 'گوشی سامسونگ')
        self.assertEqual(result['question'], QUESTIONS['unsupported_filter'])
        self.assertIsNone(result['products'])

    def test_location_never_goes_to_provider_and_nearest_has_linked_source(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی سامسونگ'))
        response = self.post('نزدیک ترین فروشنده را میخواهم', user_lat=35.71, user_lon=51.41)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result['status'], 'results')
        self.assertEqual(result['products']['items'][0]['nearest_offer']['offer_id'], 'offer_a')
        payload = self.calls[0].content.decode()
        self.assertNotIn('35.71', payload)
        self.assertNotIn('51.41', payload)

    def test_invalid_budget_keeps_priority_over_location(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی سامسونگ'))
        result = self.post('نزدیک ترین فروشنده با بودجه منفی ده میلیون تومان').json()
        self.assertEqual(result['question'], QUESTIONS['budget'])
        self.assertIsNone(result['products'])

    def test_nearest_context_survives_budget_edit(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی سامسونگ'))
        result = self.post('بودجه را هشت میلیون کن', context_offer_sort='nearest',
                           user_lat=35.71, user_lon=51.41).json()
        self.assertEqual(result['offer_sort'], 'nearest')
        self.assertEqual(result['max_price_toman'], '8000000')
        self.assertIsNotNone(result['products']['items'][0]['nearest_offer'])

    def test_battery_requirement_does_not_override_unsupported_modifier_question(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی سامسونگ'))
        result = self.post('رنگ آبی باشه', context_battery_requirement={'status': 'minimum', 'minimum_mah': 5000}).json()
        self.assertEqual(result['question'], QUESTIONS['unsupported_filter'])
        self.assertEqual(result['category_name'], 'گوشی موبایل')
        self.assertEqual(result['battery_requirement'], {'status': 'minimum', 'minimum_mah': 5000})
        self.assertIsNone(result['products'])

    def test_new_product_does_not_get_replaced_by_old_topic(self):
        request = AssistantRequest.model_validate(test_assistant.body(
            'حالا کفش کتانی نزدیک ترین فروشگاه را میخواهم', context_query='گوشی سامسونگ'))
        self.assertNotIn('گوشی سامسونگ', query_choices(request))
        self.assertIn('کفش کتانی', query_choices(request))
        for text in ['فروشگاه کفش میخواهم', 'مغازه کفش میخواهم']:
            with self.subTest(text=text):
                request = AssistantRequest.model_validate(test_assistant.body(text, context_query='گوشی سامسونگ'))
                self.assertNotIn('گوشی سامسونگ', query_choices(request))

    def test_incomplete_or_nonfinite_location_is_rejected_before_model(self):
        for fields in [{'user_lat': 35.7}, {'user_lat': 91.0, 'user_lon': 51.4}]:
            self.assertEqual(self.post('نزدیک ترین فروشنده', **fields).status_code, 422)
        self.assertEqual(self.calls, [])

    def test_negated_nearest_does_not_silently_apply_a_positive_filter(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی سامسونگ'))
        result = self.post('نزدیک ترین فروشگاه نباشه', user_lat=35.71, user_lon=51.41).json()
        self.assertEqual(result['question'], QUESTIONS['priority'])
        self.assertIsNone(result['products'])

    def test_explicit_release_after_unsupported_question_keeps_original_product(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی سامسونگ'))
        result = self.post('بدون این شرط', messages=[
            {'role': 'user', 'content': 'رنگ آبی باشه'},
            {'role': 'assistant', 'content': QUESTIONS['unsupported_filter']},
            {'role': 'user', 'content': 'بدون این شرط'},
        ]).json()
        self.assertEqual(result['status'], 'results')
        self.assertEqual(result['query'], 'گوشی سامسونگ')


class SettingsLimitTests(unittest.TestCase):
    def test_approved_200_limit_is_valid_and_out_of_range_still_rejected(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict('os.environ', {}, clear=True):
            root = Path(directory)
            for limit in (100, 200):
                (root / '.env.local').write_text(f'TOROB_ASSISTANT_ENABLED=1\nTOROB_ASSISTANT_ATTEMPT_LIMIT={limit}\n')
                self.assertEqual(AgentSettings.load(root).attempt_limit, limit)
            for limit in (0, 201):
                (root / '.env.local').write_text(f'TOROB_ASSISTANT_ATTEMPT_LIMIT={limit}\n')
                with self.assertRaises(ValueError):
                    AgentSettings.load(root)
