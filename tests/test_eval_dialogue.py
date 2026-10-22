"""Oracle/harness tests with synthetic API envelopes; no provider calls."""

from contextlib import closing
import copy
import sqlite3
import unittest

from tools.eval_dialogue import CASES, check_result, request_body


class DialogueOracleTests(unittest.TestCase):
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
