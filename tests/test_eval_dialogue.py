"""Oracle/harness tests with synthetic API envelopes; no provider calls."""

from contextlib import closing
import copy
import sqlite3
import unittest
from pathlib import Path
from datetime import datetime, timedelta, time as clock_time
from zoneinfo import ZoneInfo

from tools.eval_dialogue import CASES, check_result, request_body


class DialogueOracleTests(unittest.TestCase):
    def test_clarification_may_preserve_active_category_but_not_invent_another(self):
        from apps.api.intent import QUESTIONS
        case = next(c for c in CASES if c.id == 'cheaper_unclear')
        result = {'model': 'gpt-6.1-sol', 'status': 'needs_input', 'query': 'گوشی',
                  'category_name': 'گوشی موبایل', 'max_price_toman': '12000000',
                  'question': QUESTIONS['budget'], 'products': None}
        with closing(sqlite3.connect(':memory:')) as source:
            self.assertEqual(check_result(result, case, source, 'gpt-6.1-sol'), 0)
            result['category_name'] = 'لپ تاپ و نوت بوک'
            with self.assertRaises(AssertionError):
                check_result(result, case, source, 'gpt-6.1-sol')
    def test_oracle_accepts_only_the_explicitly_expected_configured_model(self):
        from apps.api.intent import QUESTIONS
        case = next(c for c in CASES if c.id == 'kind_unknown')
        result = {'model': 'gpt-6.1-sol', 'status': 'needs_input', 'query': None,
                  'max_price_toman': None, 'category_name': None,
                  'question': QUESTIONS['product_kind'], 'products': None}
        with closing(sqlite3.connect(':memory:')) as connection:
            self.assertEqual(check_result(result, case, connection, 'gpt-6.1-sol'), 0)
            with self.assertRaisesRegex(AssertionError, 'wrong model'):
                check_result(result, case, connection, 'gpt-5.6-luna')

    def test_followup_uses_previous_result_but_has_an_independent_budget_expectation(self):
        case = next(c for c in CASES if c.id == 'budget_followup')
        previous = {'query': 'گوشی', 'category_name': 'گوشی موبایل', 'max_price_toman': '12000000'}
        request = request_body(case, {'phone_initial': previous})
        self.assertEqual(request['max_price_toman'], '12000000')
        self.assertEqual(case.budget, '8000000')
        self.assertEqual(request['context_query'], 'گوشی')
        self.assertEqual(request['messages'][-1]['content'], case.text)

    def test_oracle_rejects_wrong_source_category_price_stock_and_empty_results(self):
        case = next(c for c in CASES if c.id == 'phone_initial')
        with closing(sqlite3.connect(':memory:')) as connection:
            connection.executescript("CREATE TABLE products(product_id,persian_title,category_name,specs); CREATE TABLE offers(product_id,price_toman INTEGER); INSERT INTO products VALUES ('p','منبع','گوشی موبایل','[]'); INSERT INTO offers VALUES ('p',13000000);")
            result = {'model': 'gpt-5.6-luna', 'status': 'results', 'max_price_toman': '12000000', 'category_name': 'گوشی موبایل', 'query': 'گوشی', 'question': None,
                      'products': {'category_name': 'گوشی موبایل', 'provenance': {'currency': 'toman', 'inventory_status': 'unconfirmed'}, 'items': [{'product_id': 'p', 'persian_title': 'منبع', 'specs': []}]}}
            with self.assertRaisesRegex(AssertionError, 'budget'):
                check_result(result, case, connection)
            connection.execute('UPDATE offers SET price_toman=10000000')
            self.assertEqual(check_result(result, case, connection), 1)
            for mutate in ('source', 'stock', 'category', 'empty'):
                bad = copy.deepcopy(result)
                if mutate == 'source':
                    bad['products']['items'][0]['persian_title'] = 'ساختگی'
                elif mutate == 'stock':
                    bad['products']['provenance']['inventory_status'] = 'confirmed'
                elif mutate == 'category':
                    bad['category_name'] = 'کیف و کاور گوشی'
                else:
                    bad['products']['items'] = []
                with self.subTest(mutate=mutate), self.assertRaises(AssertionError):
                    check_result(bad, case, connection)


@unittest.skipUnless((Path(__file__).resolve().parents[1] / '.local/catalogue.sqlite3').is_file(), 'Local source snapshot is not distributed')
class SnapshotIntelligenceEdgeTests(unittest.TestCase):
    def setUp(self):
        from apps.api.catalogue import Catalogue
        self.catalogue = Catalogue(Path(__file__).resolve().parents[1] / '.local/catalogue.sqlite3')

    def test_single_shop_product_has_no_other_shop_even_if_category_has_many_shops(self):
        with self.catalogue.connect() as source:
            row = source.execute('SELECT product_id,MIN(shop_id) FROM offers GROUP BY product_id HAVING COUNT(DISTINCT shop_id)=1 ORDER BY product_id LIMIT 1').fetchone()
        self.assertIsNotNone(row)
        alternatives = self.catalogue.offers(row[0], 50, 0, None, exclude_shop_id=row[1])
        self.assertEqual(alternatives['items'], [])

    def test_actual_missing_prices_and_timestamps_stay_unknown_in_followup(self):
        from apps.api.followup import draft_text
        with self.catalogue.connect() as source:
            for column in ('price_toman', 'last_price_changed_at'):
                row = source.execute(f'SELECT product_id,offer_id,shop_id FROM offers WHERE {column} IS NULL ORDER BY offer_id LIMIT 1').fetchone()
                self.assertIsNotNone(row)
                selection = self.catalogue.followup_selection(*row)
                self.assertIsNone(selection['offer'][column])
                text = draft_text(selection['product'], selection['offer'])
                self.assertIn('قیمت ثبت‌شده‌ای ندارد' if column == 'price_toman' else 'نامشخص', text)

    def test_actual_hours_at_tehran_boundaries_and_unknown_days(self):
        import json
        from apps.api.hours import evaluate_hours
        days = ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
        monday = datetime(2026, 11, 2, tzinfo=ZoneInfo('Asia/Tehran'))
        checked = 0
        with self.catalogue.connect() as source:
            schedules = source.execute('SELECT weekly_hours FROM shops ORDER BY shop_id LIMIT 100').fetchall()
        for (raw,) in schedules:
            weekly = json.loads(raw) if raw else {}
            for offset, day in enumerate(days):
                today = weekly.get(day) or {}
                for shift in today.get('shifts', []):
                    start, end = shift['start_time'], shift['end_time']
                    if today.get('status') != 'declared' or not start < end:
                        continue
                    date = (monday + timedelta(days=offset)).date()
                    instant = datetime.combine(date, clock_time.fromisoformat(start), monday.tzinfo)
                    self.assertEqual(evaluate_hours(raw, instant).status, 'declared_open')
                    checked += 1
                    # Closing is exclusive unless another source interval covers it.
                    closing = datetime.combine(date, clock_time.fromisoformat(end), monday.tzinfo)
                    covered = any(s['start_time'] <= end < s['end_time'] for s in today['shifts'] if s['start_time'] < s['end_time'])
                    previous = weekly.get(days[(offset - 1) % 7]) or {}
                    carryover = any(s['end_time'] < s['start_time'] and end < s['end_time'] for s in previous.get('shifts', []))
                    if not covered and not carryover:
                        self.assertNotEqual(evaluate_hours(raw, closing).status, 'declared_open')
                if today.get('status') == 'unsupported' and not any(s['end_time'] < s['start_time'] for s in (weekly.get(days[(offset-1)%7]) or {}).get('shifts', [])):
                    self.assertEqual(evaluate_hours(raw, monday + timedelta(days=offset, hours=12)).status, 'unknown')
        self.assertGreater(checked, 0)
