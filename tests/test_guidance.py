import csv
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from apps.api.main import create_app
from tools.prepare_data import SCHEMAS, prepare


class GuidanceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        source = self.root / 'source'
        source.mkdir()
        rows = {
            'shops': [{'shop_id': 's1', 'name': 'فروشگاه آزمون'}],
            'products': [{'product_id': f'p{i}', 'persian_title': f'گوشی آزمون {i}',
                          'category_name': 'گوشی موبایل', 'brand_name': 'برند آزمون'} for i in range(4)] +
                        [{'product_id': 'no_offer', 'persian_title': 'بدون آفر', 'category_name': 'بدون شاهد'}],
            'offers': [{'offer_id': f'o{i}', 'shop_id': 's1', 'product_id': f'p{i}', 'price_toman': price}
                       for i, price in enumerate(('0', '1000000', '9007199254740993', 'null'))],
        }
        for table, schema in SCHEMAS.items():
            with (source / f'{table}.csv').open('w', encoding='utf-8', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=list(schema))
                writer.writeheader()
                writer.writerows({key: row.get(key, 'null') for key in schema} for row in rows[table])
        self.database = self.root / 'catalogue.sqlite3'
        prepare(source, self.database, self.root / 'profile.json')
        self.client = TestClient(create_app(self.database))

    @patch('apps.api.assistant.BoxProvider.complete')
    def test_starters_have_source_offers_and_no_model_call(self, complete):
        response = self.client.get('/api/assistant/guidance')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['starters'], ['گوشی موبایل'])
        self.assertEqual(response.json()['provenance']['inventory_status'], 'unconfirmed')
        complete.assert_not_called()

    def test_budget_samples_preserve_zero_null_and_large_integer(self):
        response = self.client.get('/api/assistant/guidance', params={'q': 'گوشی'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['budget_samples'], ['0', '1000000', '9007199254740993'])
        self.assertEqual(response.json()['sample_size'], 4)
        self.assertEqual(response.json()['query'], 'گوشی')
        self.assertEqual(response.json()['brands'], ['برند آزمون'])

    def test_unmatched_query_does_not_invent_a_budget(self):
        data = self.client.get('/api/assistant/guidance', params={'q': 'پیدانشدنی'}).json()
        self.assertEqual(data['budget_samples'], [])
        self.assertEqual(data['sample_size'], 0)

    def test_invalid_queries_are_explicit_422(self):
        for query in ('!!!', ' '.join(['گوشی'] * 13), ''):
            self.assertEqual(self.client.get('/api/assistant/guidance', params={'q': query}).status_code, 422)

    def test_missing_catalogue_is_not_empty_success(self):
        missing = self.root / 'missing.sqlite3'
        self.assertEqual(TestClient(create_app(missing)).get('/api/assistant/guidance').status_code, 503)
        self.assertFalse(missing.exists())
