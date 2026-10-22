"""BE-001/002/003 regressions through pure parsers and FastAPI with a fake provider."""

from contextlib import closing
from decimal import localcontext
import json
import sqlite3
import unittest
from unittest.mock import patch

from apps.api.battery_intent import capacity_update
from apps.api.intent import AssistantRequest, IntentPlan, QUESTIONS, explicit_budget, parse_toman, proposed_budget, query_choices
from apps.api.models import BatteryRequirement
import test_assistant


class ConstraintParserTests(unittest.TestCase):
    def test_be001_negated_removal_and_other_features_preserve_minimum(self):
        current = BatteryRequirement(status='minimum', minimum_mah=5000)
        for text in ['فیلتر ظرفیت باتری را حذف نکن، فقط بودجه را هشت میلیون کن',
                     'فیلتر ظرفیت باتری را حذف نکن و دوربین مهم نیست',
                     'گوشی با باتری حداقل ۵۰۰۰ mAh، دوربین مهم نیست',
                     'گوشی با باتری حداقل ۵۰۰۰ mAh و دوربین مهم نیست']:
            with self.subTest(text=text):
                self.assertEqual(capacity_update(text, current), current)

    def test_be001_budget_comparators_do_not_change_capacity_scope(self):
        for text, minimum in [
            ('گوشی با باتری حداقل ۵۰۰۰ mAh و بودجه حداکثر ده میلیون تومان', 5000),
            ('گوشی با بودجه حداکثر ده میلیون تومان و باتری حداقل ۵۰۰۰ mAh', 5000),
            ('گوشی با باتری حداقل پنج هزار و پانصد میلی‌آمپرساعت و بودجه حداکثر ده میلیون تومان', 5500),
            ('گوشی با باتری حداقل ۵٬۰۰۰ mAh، دوربین مهم نیست', 5000),
        ]:
            with self.subTest(text=text):
                self.assertEqual(capacity_update(text, BatteryRequirement()).minimum_mah, minimum)

    def test_contradictory_capacity_edits_clarify_instead_of_silently_clearing(self):
        current = BatteryRequirement(status='minimum', minimum_mah=5000)
        for text in ['فیلتر ظرفیت باتری را حذف کن اما حداقل ۶۰۰۰ mAh میخواهم',
                     'فیلتر ظرفیت باتری را حذف کن حداقل ۶۰۰۰ mAh میخواهم',
                     'فیلتر ظرفیت باتری را حذف نکن حداقل ۶۰۰۰ mAh میخواهم']:
            with self.subTest(text=text):
                self.assertEqual(capacity_update(text, current).status, 'awaiting_minimum')

    def test_capacity_question_answer_can_accompany_an_explicit_budget_edit(self):
        waiting = BatteryRequirement(status='awaiting_minimum')
        for text, status, value in [('بدون حداقل، بودجه را هشت میلیون کن', 'no_minimum', None),
                                    ('۵۰۰۰، بودجه را هشت میلیون کن', 'minimum', 5000)]:
            with self.subTest(text=text):
                self.assertEqual(capacity_update(text, waiting), BatteryRequirement(status=status, minimum_mah=value))
        self.assertEqual(capacity_update('بودجه را هشت میلیون کن', waiting), waiting)

    def test_be002_signed_explicit_budget_is_invalid_even_without_a_model_quote(self):
        plan = IntentPlan(**test_assistant.proposal())
        for text in ['گوشی تا -۱۰ میلیون تومان', 'گوشی با بودجه منفی ده میلیون تومان',
                     'گوشی تا −١٠ میلیون تومن', 'بودجه را منفی ده میلیون کن']:
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    explicit_budget(text)
                request = AssistantRequest.model_validate(test_assistant.body(text))
                with self.assertRaises(ValueError):
                    proposed_budget(plan, request)
        self.assertIsNone(explicit_budget('گوشی با باتری حداقل -۵۰۰۰ mAh'))
        self.assertIsNone(explicit_budget('گوشی میخواهم'))

    def test_be003_fractional_toman_cannot_round_into_an_integer(self):
        for quote in ['0.99999999999999999999999999999 تومان',
                      '733518940747298943.99999999999999999999999999999 تومان',
                      '0.' + '0' * 40 + '1 میلیون تومان']:
            with self.subTest(quote=quote), self.assertRaises(ValueError):
                parse_toman(quote)

    def test_exact_money_is_independent_of_decimal_context(self):
        with localcontext() as context:
            context.prec = 6
            for quote, expected in [('0 تومان', 0), ('۰٫۵ میلیون تومان', 500000),
                                    ('۱۲٫۵ میلیون تومان', 12500000),
                                    ('733518940747298944 تومان', 733518940747298944),
                                    ('9223372036854775807.000000000000000000000 تومان', 2**63 - 1)]:
                with self.subTest(quote=quote):
                    self.assertEqual(parse_toman(quote), expected)


class ConstraintApiTests(unittest.TestCase):
    def setUp(self):
        test_assistant.AssistantApiTests.setUp(self)
        with closing(sqlite3.connect(self.database)) as connection:
            for pid, capacity in [('product_one', 3000), ('product_two', 6000)]:
                connection.execute('UPDATE products SET specs=? WHERE product_id=?', (
                    json.dumps([{'section': 'باتری', 'key': 'ظرفیت باتری', 'value': f'{capacity} mAh'}]), pid))
            connection.commit()

    def turn(self, text, *, budget='10000000', minimum=5000):
        changes = {'context_query': 'گوشی', 'context_category': 'گوشی موبایل', 'max_price_toman': budget}
        if minimum is not None:
            changes['context_battery_requirement'] = {'status': 'minimum', 'minimum_mah': minimum}
        body = test_assistant.body(text, **changes)
        choices = query_choices(AssistantRequest.model_validate(body))
        self.response = test_assistant.completion(test_assistant.proposal(query='گوشی' if 'گوشی' in choices else choices[0]))
        response = self.agent_client.post('/api/assistant/turn', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def assert_filtered(self, result, budget, minimum=5000):
        self.assertEqual(result['status'], 'results', result)
        self.assertEqual(result['max_price_toman'], budget)
        self.assertEqual(result['battery_requirement'], {'status': 'minimum', 'minimum_mah': minimum})
        self.assertEqual(result['products']['min_battery_capacity_mah'], minimum)
        self.assertEqual([p['product_id'] for p in result['products']['items']], ['product_two'])

    def test_be001_negated_removal_changes_only_budget(self):
        result = self.turn('فیلتر ظرفیت باتری را حذف نکن، فقط بودجه را هشت میلیون کن')
        self.assert_filtered(result, '8000000')
        self.assertEqual(len(self.calls), 1)

    def test_be001_camera_negation_does_not_remove_capacity(self):
        self.assert_filtered(self.turn('گوشی با باتری حداقل ۵۰۰۰ mAh، دوربین مهم نیست'), '10000000')

    def test_be001_explicit_capacity_and_budget_apply_together(self):
        result = self.turn('گوشی با باتری حداقل ۵۰۰۰ mAh و بودجه حداکثر ده میلیون تومان', budget=None, minimum=None)
        self.assert_filtered(result, '10000000')

    def test_healthy_budget_edit_and_explicit_removal(self):
        self.assert_filtered(self.turn('بودجه را هشت میلیون کن'), '8000000')
        removed = self.turn('فیلتر ظرفیت باتری را حذف کن')
        self.assertEqual(removed['status'], 'results')
        self.assertIsNone(removed['products']['min_battery_capacity_mah'])
        self.assertEqual({p['product_id'] for p in removed['products']['items']}, {'product_one', 'product_two'})

    def test_be002_negative_budget_never_searches_without_a_ceiling(self):
        for text, active in [('گوشی تا -۱۰ میلیون تومان', None), ('گوشی با بودجه منفی ده میلیون تومان', '10000000')]:
            with self.subTest(text=text), patch.object(self.service.catalogue, 'search', side_effect=AssertionError('invalid budget must not retrieve')):
                result = self.turn(text, budget=active)
                self.assertEqual(result['status'], 'needs_input')
                self.assertEqual(result['question'], QUESTIONS['budget'])
                self.assertIsNone(result['products'])
                self.assertEqual(result['max_price_toman'], active)

    def test_be003_fractional_budget_asks_instead_of_rounding(self):
        with patch.object(self.service.catalogue, 'search', side_effect=AssertionError('fractional budget must not retrieve')):
            result = self.turn('گوشی تا 0.99999999999999999999999999999 تومان')
        self.assertEqual(result['status'], 'needs_input')
        self.assertEqual(result['question'], QUESTIONS['budget'])
        self.assertEqual(result['max_price_toman'], '10000000')
        self.assertIsNone(result['products'])

    def test_capacity_conflict_does_not_search_after_removal(self):
        with patch.object(self.service.catalogue, 'search', side_effect=AssertionError('ambiguous capacity must not retrieve')):
            result = self.turn('فیلتر ظرفیت باتری را حذف کن اما حداقل ۶۰۰۰ mAh میخواهم')
        self.assertEqual(result['status'], 'needs_input')
        self.assertEqual(result['question'], QUESTIONS['battery_capacity'])

    def test_missing_budget_zero_and_valid_decimal_controls(self):
        unrestricted = self.turn('گوشی میخواهم', budget=None, minimum=None)
        self.assertEqual(unrestricted['status'], 'results')
        self.assertIsNone(unrestricted['max_price_toman'])
        zero = self.turn('گوشی تا صفر تومان', minimum=None)
        self.assertEqual(zero['status'], 'no_evidence')
        self.assertEqual(zero['max_price_toman'], '0')
        self.assert_filtered(self.turn('گوشی تا ۰٫۵ میلیون تومان'), '500000')
