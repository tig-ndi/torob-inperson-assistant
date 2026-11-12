"""Controlled fixture regressions for the 2026-11 shopping audit."""

import json
from pathlib import Path
import tempfile
import unittest
from uuid import uuid4

from fastapi.testclient import TestClient
import httpx

from apps.api.agent_usage import UsageLedger
from apps.api.assistant import AgentSettings, AssistantService, BoxProvider
from apps.api.catalogue import Catalogue
from apps.api.intent import explicit_budget, query_choices, AssistantRequest
from apps.api.main import create_app
from apps.api.model_comparison import revised_comparison_queries
from apps.api.ram import recorded_ram_gb


SNAPSHOT = Path(__file__).resolve().parents[1] / '.local/catalogue.sqlite3'


class ShoppingAuditTests(unittest.TestCase):
    def test_half_million_is_exact(self):
        self.assertEqual(explicit_budget('گوشی تا دوازده و نیم میلیون میخوام'), '12500000')

    def test_comparison_edit_keeps_unchanged_model(self):
        for text in [
            'A54 را حذف کن و Redmi Note 10 را جایش بگذار؛ A34 بماند',
            'A54 رو حذف کن و Redmi Note 10 رو جاش بذار',
            'به جای A54، Redmi Note 10 رو بذار',
            'سامسونگ A54 رو با Redmi Note 10 عوض کن',
        ]:
            with self.subTest(text=text):
                self.assertEqual(revised_comparison_queries(text,
                    ['سامسونگ a54', 'سامسونگ a34']), ['redmi note 10', 'سامسونگ a34'])
        self.assertEqual(revised_comparison_queries('A54 رو با A34 عوض کن',
            ['سامسونگ a54', 'سامسونگ a34']), [])
        self.assertEqual(revised_comparison_queries('A54 رو با A55 عوض کن',
            ['سامسونگ a54', 'شیائومی a54']), [])

    def test_ram_source_ignores_upgrade_and_conflict(self):
        category = 'لپ تاپ و نوت بوک'
        self.assertEqual(recorded_ram_gb(category, [
            {'key': 'مقدار حافظه رم', 'value': '16GB'},
            {'key': 'قابلیت ارتقاء رم', 'value': 'Up to 32GB'}]), 16)
        self.assertIsNone(recorded_ram_gb(category, [
            {'key': 'مقدار حافظه رم', 'value': '8GB'},
            {'key': 'ظرفیت حافظه RAM', 'value': '16GB'}]))
        self.assertIsNone(recorded_ram_gb(category, [{'key': 'نوع رم', 'value': 'DDR5'}]))


@unittest.skipUnless(SNAPSHOT.exists(), 'local catalogue snapshot not available')
class ShoppingAuditSourceTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.catalogue = Catalogue(SNAPSHOT)
        self.calls = []

        def handler(request):
            prompt = json.loads(json.loads(request.content)['messages'][1]['content'])
            choices = prompt['query_choices']
            query = prompt['context_query'] if prompt['context_query'] in choices else choices[0] if choices else None
            plan = {'action': 'search' if query else 'clarify', 'query': query,
                    'budget_text': None, 'question': None if query else 'product_kind'}
            self.calls.append(plan)
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop',
                'message': {'content': json.dumps(plan, ensure_ascii=False)}}],
                'usage': {'prompt_tokens': 20, 'completion_tokens': 10}})

        settings = AgentSettings(True, 'synthetic', model='gpt-5-mini', attempt_limit=12)
        service = AssistantService(self.catalogue, settings,
                                   UsageLedger(Path(temp.name) / 'usage.sqlite3'),
                                   BoxProvider(settings, httpx.MockTransport(handler)))
        self.client = TestClient(create_app(SNAPSHOT, assistant=service))
        self.addCleanup(self.client.close)

    def turn(self, text, prior=None, first=None):
        messages = [{'role': 'user', 'content': first},
                    {'role': 'assistant', 'content': prior['question'] or 'نتایج قبلی برای همین خرید محفوظ است.'},
                    {'role': 'user', 'content': text}] if prior else [{'role': 'user', 'content': text}]
        body = {'request_id': str(uuid4()), 'messages': messages}
        if prior:
            body['context_need_state'] = prior['need_state']
        response = self.client.post('/api/assistant/turn', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_laptop_alias_and_ram_are_grounded(self):
        self.assertEqual([p['product_id'] for p in self.catalogue.search('لپتاپ', 12, 0, 40000000)['items']],
                         [p['product_id'] for p in self.catalogue.search('لپ تاپ', 12, 0, 40000000)['items']])
        first = 'لپ تاپ برای برنامه نویسی تا چهل میلیون تومان میخوام، رم حداقل ۱۶ گیگ لازم دارم'
        result = self.turn(first)
        self.assertEqual(result['need_state']['topic_query'], 'لپ تاپ')
        self.assertEqual(result['need_state']['minimum_ram_gb'], 16)
        self.assertEqual(result['need_state']['pending_requirements'], [])
        later = self.turn('مدل خاصی نمیشناسم؛ خودت از همین داده‌ها پیشنهاد بده، رم ۱۶ بماند', result, first)
        self.assertEqual(later['need_state']['topic_query'], 'لپ تاپ')
        self.assertEqual(later['need_state']['minimum_ram_gb'], 16)
        self.assertEqual(later['need_state']['max_price_toman'], '40000000')

    def test_charger_followup_keeps_product_and_power_requirement(self):
        first = 'شارژر برای گوشی سامسونگ A54 تا یک میلیون تومان میخوام'
        result = self.turn(first)
        later = self.turn('تایپ سی و ۲۵ وات لازم دارم؛ کابل نمیخوام', result, first)
        self.assertTrue((later['need_state']['topic_query'] or '').startswith('شارژر'))
        self.assertEqual(later['need_state']['source_filters']['connector'], 'usb-c')
        self.assertIn('توان', [item['key'] for item in later['need_state']['pending_requirements']])

    def test_catalogue_refresh_and_destinations_keep_ram_filter(self):
        response = self.client.get('/api/products', params={
            'q': 'لپ تاپ', 'minimum_ram_gb': 16, 'limit': 50})
        self.assertEqual(response.status_code, 200, response.text)
        products = response.json()['items']
        self.assertTrue(products)
        for product in products:
            self.assertGreaterEqual(recorded_ram_gb(product['category_name'], product['specs']), 16)
        destinations = self.client.post('/api/local/destinations', json={
            'query': 'لپ تاپ', 'minimum_ram_gb': 16, 'lat': 35.7, 'lon': 51.4,
            'search_km': 1000})
        self.assertEqual(destinations.status_code, 200, destinations.text)
        self.assertGreater(destinations.json()['matched_models'], 0)
        for product_id in destinations.json()['product_ids']:
            product = self.catalogue.detail(product_id)['product']
            self.assertGreaterEqual(recorded_ram_gb(product['category_name'], product['specs']), 16)

    def test_negated_spare_parts_do_not_block_powerbank_search(self):
        result = self.turn('پاوربانک تا دو میلیون تومان میخوام، نه ماژول و نه باتری یدکی')
        self.assertEqual(result['need_state']['topic_query'], 'پاوربانک')
        self.assertNotEqual(result['question_code'], 'product_kind')

    def test_half_million_budget_replaces_previous_budget(self):
        first = 'لپ تاپ تا سی و پنج میلیون تومان میخوام'
        result = self.turn(first)
        later = self.turn('حالا گوشی تا دوازده و نیم میلیون میخوام', result, first)
        self.assertEqual(later['need_state']['topic_query'], 'گوشی')
        self.assertEqual(later['max_price_toman'], '12500000')
        self.assertNotEqual(later['question_code'], 'budget')

    def test_comparison_replace_keeps_other_side_and_budget(self):
        first = 'بین سامسونگ A54 و A34 برای عکاسی تا بیست میلیون تومان مقایسه کن'
        result = self.turn(first)
        later = self.turn('A54 را حذف کن و Redmi Note 10 را جایش بگذار؛ A34 بماند', result, first)
        self.assertEqual(later['need_state']['comparison_queries'], ['redmi note 10', 'سامسونگ a34'])
        self.assertEqual(later['need_state']['max_price_toman'], '20000000')
