"""Capacity evidence, pre-pagination filtering and dialogue; no real provider calls."""

from contextlib import closing
import json
import sqlite3
import unittest

from apps.api.battery import assess_capacity, quantity_mah
from apps.api.battery_intent import capacity_update
from apps.api.intent import AssistantRequest, QUESTIONS, query_choices
from apps.api.models import BatteryRequirement
import test_api
import test_assistant


def specs(value, key='ظرفیت باتری'):
    return [{'key': key, 'section': 'باتری', 'value': value}]


class CapacityTests(unittest.TestCase):
    def test_exact_units_digits_grouping_and_decimal_ampere_hours(self):
        for value, expected in [('۵٬۰۰۰ میلی‌آمپرساعت', 5000), ('٥٠٠٠ mAh', 5000), ('5.001 Ah', 5001), ('۰ میلی آمپر ساعت', 0)]:
            with self.subTest(value=value):
                result = assess_capacity('گوشی موبایل', specs(value))
                self.assertEqual((result.status, result.capacity_mah), ('known', expected))
                self.assertEqual(result.references[0][3], value)
        self.assertEqual(assess_capacity('گوشی موبایل', specs('5000', 'ظرفیت باتری(میلی آمپر ساعت)')).capacity_mah, 5000)

    def test_unknown_and_unsupported_values_never_become_zero(self):
        for value in [None, '', 'ندارد', '5000', 'از 4000 تا 5000 میلی‌آمپرساعت', '5000, ,', '5000 میلی آمپر بر ساعت', '5,00 mAh', '0.0001 Ah', '-5000 mAh', '1000001 mAh', '5.00000000000000000000000000001 Ah']:
            with self.subTest(value=value):
                result = assess_capacity('گوشی موبایل', specs(value))
                self.assertEqual(result.status, 'unknown')
                self.assertIsNone(result.capacity_mah)
        self.assertEqual(assess_capacity('گوشی موبایل', specs('5000 mAh', 'محدوده ظرفیت باتری')).status, 'unknown')

    def test_duplicate_missing_conflicting_and_unsupported_evidence(self):
        self.assertEqual(assess_capacity('گوشی موبایل', specs(None) + specs('5000 mAh')).capacity_mah, 5000)
        for second in ['6000 mAh', 'ندارد']:
            result = assess_capacity('گوشی موبایل', specs('5000 mAh') * 5 + specs(second)).as_dict()
            self.assertEqual(result['status'], 'conflicting')
            self.assertIsNone(result['capacity_mah'])
            self.assertIn(second, [r['value'] for r in result['evidence']])
        self.assertEqual(assess_capacity('گوشی موبایل', specs('5000 mAh') + specs('5000 تا 5999')).status, 'unknown')
        unknown = assess_capacity('گوشی موبایل', specs(None) * 5 + specs('5000 تا 5999')).as_dict()
        self.assertEqual(unknown['evidence'][0]['source_index'], 5)
        self.assertEqual(assess_capacity('باتری گوشی موبایل', specs('5000 mAh')).status, 'not_applicable')
        self.assertEqual(assess_capacity('گوشی موبایل', []).reason, 'no_capacity_field')

    def test_user_minimum_never_guesses_a_threshold_from_strength(self):
        initial = BatteryRequirement()
        for text in ['باتری قوی', 'باتری خوب', 'باتری ۵۰۰۰', 'باتری ۵۰۰۰ mAh', 'حداقل ۵,۰۰ mAh', 'حداقل -5000 mAh', 'حداقل 5e3 mAh', 'باتری بین 4000 تا 5000 mAh', 'باتری حداکثر 5000 mAh', 'باتری 5000 mAh یا 6000 mAh']:
            with self.subTest(text=text):
                self.assertEqual(capacity_update(text, initial).status, 'awaiting_minimum')
        for text in ['حداقل ۵۰۰۰ mAh', 'باتری حداقل پنج هزار میلی‌آمپرساعت', 'حداقل ۵ آمپرساعت']:
            self.assertEqual(capacity_update(text, initial).minimum_mah, 5000, text)
        waiting = BatteryRequirement(status='awaiting_minimum')
        self.assertEqual(capacity_update('۵۰۰۰', waiting).minimum_mah, 5000)
        self.assertEqual(capacity_update('بدون حداقل', waiting).status, 'no_minimum')
        self.assertEqual(capacity_update('۵۰۰۰', initial).status, 'unspecified')
        self.assertEqual(capacity_update('گوشی با باتری قابل تعویض', initial).status, 'unspecified')

    def test_quantity_validation_and_clean_query_keep_separate_units(self):
        with self.assertRaises(ValueError):
            quantity_mah('5', 'تومان')
        for message in ['گوشی با باتری حداقل ۵۰۰۰ میلی‌آمپرساعت تا ده میلیون تومان', 'گوشی با ظرفیت باتری ۵ آمپرساعت']:
            request = AssistantRequest.model_validate(test_assistant.body(message))
            self.assertEqual(query_choices(request), ['گوشی'])


class CapacityApiTests(unittest.TestCase):
    def setUp(self):
        test_api.CatalogueApiTests.setUp(self)
        # Source fixtures deliberately span known, missing, conflicting and non-phone rows.
        with closing(sqlite3.connect(self.database)) as connection:
            for pid, source in [('product_one', specs('5000 mAh')), ('product_two', specs('6000 mAh')), ('product_case', specs('7000 mAh'))]:
                connection.execute('UPDATE products SET specs=? WHERE product_id=?', (json.dumps(source), pid))
            connection.commit()

    def test_filter_before_pagination_with_budget_and_inclusive_boundary(self):
        params = {'q': 'گوشی', 'min_battery_capacity_mah': 5000, 'limit': 1, 'max_price_toman': '200000'}
        first = self.client.get('/api/products', params=params).json()
        second = self.client.get('/api/products', params={**params, 'offset': 1}).json()
        self.assertTrue(first['has_more'])
        self.assertFalse(second['has_more'])
        self.assertEqual({p['product_id'] for p in first['items'] + second['items']}, {'product_one', 'product_two'})
        self.assertEqual(first['min_battery_capacity_mah'], 5000)
        rows = self.client.get('/api/products', params={**params, 'limit': 20, 'min_battery_capacity_mah': 5001}).json()['items']
        self.assertEqual([r['product_id'] for r in rows], ['product_two'])
        self.assertEqual(self.client.get('/api/products', params={**params, 'min_battery_capacity_mah': 7000}).json()['items'], [])

    def test_unknown_conflicting_and_non_phone_do_not_pass_even_minimum_zero(self):
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute('UPDATE products SET specs=? WHERE product_id=?', (json.dumps(specs('5000 mAh') + specs('6000 mAh')), 'product_one'))
            connection.execute('UPDATE products SET specs=? WHERE product_id=?', (json.dumps(specs(None)), 'product_two'))
            connection.commit()
        response = self.client.get('/api/products', params={'q': 'گوشی', 'min_battery_capacity_mah': 0, 'category_cleared': 'true'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['items'], [])
        detail = self.client.get('/api/products/product_one').json()['product']['battery_capacity']
        self.assertEqual(detail['status'], 'conflicting')
        self.assertIsNone(detail['capacity_mah'])

    def test_validation_and_cleared_category_are_independent(self):
        for value in ['-1', '5000.5', '1000001', 'nan', '5000 OR 1=1']:
            self.assertEqual(self.client.get('/api/products', params={'q': 'گوشی', 'min_battery_capacity_mah': value}).status_code, 422)
        self.assertEqual(self.client.get('/api/products', params={'q': 'لپ تاپ', 'min_battery_capacity_mah': 5000}).status_code, 422)
        response = self.client.get('/api/products', params={'q': 'گوشی', 'category_cleared': 'true', 'min_battery_capacity_mah': 5000}).json()
        self.assertIsNone(response['category_name'])
        self.assertEqual({p['product_id'] for p in response['items']}, {'product_one', 'product_two'})


class CapacityDialogueTests(unittest.TestCase):
    def setUp(self):
        test_assistant.AssistantApiTests.setUp(self)
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute('UPDATE products SET specs=? WHERE product_id=?', (json.dumps(specs('5000 mAh')), 'product_one'))
            connection.commit()

    post = test_assistant.AssistantApiTests.post

    def test_vague_then_numeric_answer_keeps_budget_and_source_evidence(self):
        self.response = test_assistant.completion(test_assistant.proposal())
        first = self.post(test_assistant.body('گوشی با باتری قوی تا ده میلیون تومان')).json()
        self.assertEqual(first['status'], 'needs_input')
        self.assertEqual(first['question'], QUESTIONS['battery_capacity'])
        self.assertIsNone(first['products'])
        self.assertEqual(first['battery_requirement']['status'], 'awaiting_minimum')
        messages = [{'role': 'user', 'content': 'گوشی با باتری قوی تا ده میلیون تومان'}, {'role': 'assistant', 'content': first['question']}, {'role': 'user', 'content': '۵۰۰۰'}]
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی', budget_text='۵۰۰۰'))
        result = self.post(test_assistant.body(messages=messages, context_query=first['query'], max_price_toman=first['max_price_toman'])).json()
        self.assertEqual(result['status'], 'results', result)
        self.assertEqual(result['max_price_toman'], '10000000')
        self.assertEqual(result['products']['min_battery_capacity_mah'], 5000)
        self.assertEqual([r['product_id'] for r in result['products']['items']], ['product_one'])
        self.assertEqual(result['explanation']['products'][0]['battery_capacity']['capacity_mah'], 5000)
        self.assertEqual(result['explanation']['products'][0]['suitability'], 'not_verified')
        self.assertEqual(len(self.calls), 2)

    def test_explicit_minimum_budget_edit_and_removal(self):
        first = self.post(test_assistant.body('گوشی با باتری حداقل ۵۰۰۰ mAh')).json()
        self.assertEqual(first['battery_requirement']['minimum_mah'], 5000)
        second = self.post(test_assistant.body('بودجه را هشت میلیون کن', context_query='گوشی', context_battery_requirement=first['battery_requirement'])).json()
        self.assertEqual(second['max_price_toman'], '8000000')
        self.assertEqual(second['products']['min_battery_capacity_mah'], 5000)
        # Model's literal filter-command query is replaced by the validated phone topic.
        choices = query_choices(AssistantRequest.model_validate(test_assistant.body('فیلتر ظرفیت باتری را حذف کن', context_query='گوشی')))
        self.response = test_assistant.completion(test_assistant.proposal(query=choices[0]))
        third = self.post(test_assistant.body('فیلتر ظرفیت باتری را حذف کن', context_query='گوشی', max_price_toman=second['max_price_toman'], context_battery_requirement=second['battery_requirement'])).json()
        self.assertEqual(third['battery_requirement']['status'], 'no_minimum')
        self.assertIsNone(third['products']['min_battery_capacity_mah'])
        self.assertEqual(len(third['products']['items']), 2)

    def test_product_switch_and_fresh_conversation_clear_minimum(self):
        state = {'status': 'minimum', 'minimum_mah': 5000}
        self.response = test_assistant.completion(test_assistant.proposal(query='کفش'))
        switched = self.post(test_assistant.body('کفش میخواهم', context_query='گوشی', context_category='گوشی موبایل', context_battery_requirement=state)).json()
        self.assertEqual(switched['battery_requirement']['status'], 'unspecified')
        self.assertIsNone(switched['products']['min_battery_capacity_mah'])
        self.response = test_assistant.completion(test_assistant.proposal())
        fresh = self.post(test_assistant.body('گوشی میخواهم')).json()
        self.assertEqual(fresh['battery_requirement']['status'], 'unspecified')

    def test_phone_followup_keeps_valid_minimum(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی'))
        result = self.post(test_assistant.body(
            'بودجه را هشت میلیون کن',
            context_need_state=test_assistant.phone_battery_state())).json()
        self.assertEqual(result['status'], 'results', result)
        self.assertEqual(result['max_price_toman'], '8000000')
        self.assertEqual(result['battery_requirement'], {'status': 'minimum', 'minimum_mah': 5000})
        self.assertEqual(result['products']['min_battery_capacity_mah'], 5000)
        self.assertEqual([p['product_id'] for p in result['products']['items']], ['product_one'])

    def test_invalid_capacity_clarifies_and_unsupported_type_does_not_ignore_constraint(self):
        invalid = self.post(test_assistant.body('گوشی با باتری حداقل ۵,۰۰ mAh')).json()
        self.assertEqual(invalid['question'], QUESTIONS['battery_capacity'])
        self.response = test_assistant.completion(test_assistant.proposal(query='لپ تاپ'))
        other = self.post(test_assistant.body('لپ تاپ با باتری حداقل ۵۰۰۰ mAh')).json()
        self.assertEqual(other['question'], QUESTIONS['battery_scope'])
        self.assertIsNone(other['products'])

    def test_impossible_minimum_is_no_evidence_not_a_provider_failure(self):
        result = self.post(test_assistant.body('گوشی با باتری حداقل ۹۰۰۰ mAh')).json()
        self.assertEqual(result['status'], 'no_evidence')
        self.assertEqual(result['products']['items'], [])
        self.assertEqual(result['battery_requirement']['minimum_mah'], 9000)

    def test_invalid_carried_state_rejected_without_a_provider_call(self):
        response = self.post(test_assistant.body(context_battery_requirement={'status': 'minimum', 'minimum_mah': None}))
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.calls, [])

    def test_brand_refinement_carries_minimum_even_with_category_cleared(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='سامسونگ'))
        result = self.post(test_assistant.body('سامسونگ میخواهم', context_query='گوشی', context_category='گوشی موبایل', category_cleared=True,
                                             context_battery_requirement={'status': 'minimum', 'minimum_mah': 5000})).json()
        self.assertEqual(result['products']['min_battery_capacity_mah'], 5000)
        self.assertIsNone(result['category_name'])
        self.assertEqual([p['product_id'] for p in result['products']['items']], ['product_one'])
        continued = self.post(test_assistant.body('بودجه را هشت میلیون کن', context_query=result['query'], category_cleared=True,
                                                  context_battery_requirement=result['battery_requirement'])).json()
        self.assertEqual(continued['products']['min_battery_capacity_mah'], 5000)
        self.assertIsNone(continued['category_name'])

    def test_scope_release_and_no_minimum_are_explicit_and_separate(self):
        messages = [{'role': 'user', 'content': 'لپ تاپ با باتری حداقل 5000 mAh'},
                    {'role': 'assistant', 'content': QUESTIONS['battery_scope']}, {'role': 'user', 'content': 'بدون این شرط'}]
        request = test_assistant.body(messages=messages, context_query='لپ تاپ')
        choices = query_choices(AssistantRequest.model_validate(request))
        self.response = test_assistant.completion(test_assistant.proposal(query=choices[0]))
        result = self.post(request).json()
        self.assertNotEqual(result['status'], 'needs_input', result)
        self.assertEqual(result['query'], 'لپ تاپ')
        self.assertIsNone(result['products']['min_battery_capacity_mah'])

    def test_vague_model_priority_is_replaced_by_precise_capacity_question(self):
        self.response = test_assistant.completion(test_assistant.proposal(action='clarify', query='گوشی', question='priority'))
        result = self.post(test_assistant.body('گوشی با باتری قوی', max_price_toman='10000000')).json()
        self.assertEqual(result['question'], QUESTIONS['battery_capacity'])
        self.assertEqual(result['battery_requirement']['status'], 'awaiting_minimum')

    def test_physical_quantity_quote_never_replaces_money(self):
        self.response = test_assistant.completion(test_assistant.proposal(budget_text='۵۰۰۰'))
        result = self.post(test_assistant.body('گوشی با باتری حداقل ۵۰۰۰ mAh', max_price_toman='10000000')).json()
        self.assertEqual(result['max_price_toman'], '10000000')
        self.assertEqual(result['products']['min_battery_capacity_mah'], 5000)

    def test_incomplete_client_context_does_not_create_a_null_search(self):
        self.response = test_assistant.completion(test_assistant.proposal(action='clarify', query=None, question='product_kind'))
        response = self.post(test_assistant.body('۵۰۰۰', context_category='گوشی موبایل', context_battery_requirement={'status': 'awaiting_minimum', 'minimum_mah': None}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'needs_input')
        self.response = test_assistant.completion(test_assistant.proposal(query='5000 mah'))
        unit_reply = self.post(test_assistant.body('۵۰۰۰ mAh', context_category='گوشی موبایل', context_battery_requirement={'status': 'awaiting_minimum', 'minimum_mah': None}))
        self.assertEqual(unit_reply.status_code, 200)
        self.assertEqual(unit_reply.json()['status'], 'needs_input')
