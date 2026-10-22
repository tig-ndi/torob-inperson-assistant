"""Synthetic protocol/host tests. These are NOT real-model semantic evidence."""

import asyncio
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
import httpx
from pydantic import ValidationError

from apps.api.agent_usage import AgentError, UsageLedger, reported_cost
from apps.api.assistant import AgentSettings, AssistantService, BoxProvider, ENDPOINT
from apps.api.catalogue import Catalogue, CatalogueUnavailable
from apps.api.intent import AssistantRequest, IntentPlan, QUESTIONS, parse_toman, proposed_budget, explicit_budget, query_choices
from apps.api.main import create_app
import test_api


def body(text='گوشی با بودجه ده میلیون تومان می‌خواهم', **changes):
    return {'request_id': str(uuid4()), 'messages': [{'role': 'user', 'content': text}], 'max_price_toman': None, **changes}


def proposal(**changes):
    return {'action': 'search', 'query': 'گوشی', 'budget_text': None, 'question': None, **changes}


def completion(plan, **changes):
    return {'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(plan, ensure_ascii=False)}}],
            'usage': {'prompt_tokens': 410, 'completion_tokens': 120}, 'cost': 0.0002, **changes}


class IntentTests(unittest.TestCase):
    def test_colloquial_possessive_budget_keeps_decimal_amount_and_clean_product_query(self):
        for message in ['یه گوشی میخوام؛ سقف بودجه‌م ۱۲٫۵ میلیون تومنه.',
                        'گوشی می‌خواهم؛ بودجه م ١٢٫٥ میلیون تومن است.']:
            with self.subTest(message=message):
                self.assertEqual(explicit_budget(message), '12500000')
                self.assertEqual(query_choices(AssistantRequest.model_validate(body(message))), ['گوشی'])

    def test_colloquial_preposition_is_not_a_literal_product_or_accessory_term(self):
        self.assertEqual(query_choices(AssistantRequest.model_validate(body('یه موبایل واسه کار روزمره میخوام؛ بودجه م ٩٫٥ میلیون تومنه.'))), ['موبایل'])
        choices = query_choices(AssistantRequest.model_validate(body('شارژر واسه لپ‌تاپ می‌خوام')))
        self.assertTrue(any('شارژر' in q for q in choices))
        self.assertTrue(any('لپ' in q for q in choices))
        self.assertFalse(any('واسه' in q for q in choices))

    def test_money_quotes_keep_exact_units_null_zero_and_large_integers(self):
        for quote, expected in [('۱۰٬۰۰۰٬۰۰۰ تومان', 10000000), ('ده میلیون تومان', 10000000),
                                ('بيست و پنج میلیون تومن', 25000000), ('١٠٫٥ میلیون تومان', 10500000),
                                ('یک میلیارد و دویست میلیون تومان', 1200000000),
                                ('733518940747298944 تومان', 733518940747298944), ('صفر تومان', 0)]:
            with self.subTest(quote=quote):
                self.assertEqual(parse_toman(quote), expected)
        for quote in ['ده میلیون ریال', 'حدود ده میلیون', '1.1 تومان', 'یک میلیون میلیون', 'و ده', 'ده و', '-1', '9223372036854775808', '12,34 تومان', 'ده و بیست تومان', 'دو و سه تومان']:
            with self.subTest(quote=quote), self.assertRaises(ValueError):
                parse_toman(quote)

    def test_only_the_latest_verbatim_human_quote_can_change_a_budget(self):
        request = AssistantRequest.model_validate(body('گوشی می‌خواهم؛ ده میلیون تومان کنار گذاشته‌ام.', max_price_toman='25000000'))
        self.assertEqual(proposed_budget(IntentPlan(**proposal()), request), '25000000')
        self.assertEqual(proposed_budget(IntentPlan(**proposal(budget_text='ده میلیون تومان')), request), '10000000')
        # No explicit upper-bound phrase here: an invented quote must fail.
        with self.assertRaises(ValueError):
            proposed_budget(IntentPlan(**proposal(budget_text='بیست میلیون تومان')), request)

    def test_explicit_budget_in_a_sentence_is_independent_of_model_quoting(self):
        cases = [('کفش برای دویدن تا ۳٫۵ میلیون تومان می‌خواهم.', '3500000'),
                 ('حداکثر ده میلیون تومان.', '10000000'), ('سقف بودجه‌ام پانزده میلیون تومان است.', '15000000'),
                 ('بودجه من: بیست و پنج میلیون تومان است', '25000000'), ('تا صفر تومان', '0')]
        cases += [('بودجه را هشت میلیون کن', '8000000'), ('بودجه رو به ۱۲٫۵ میلیون تغییر بده', '12500000'),
                  ('بودجه‌ام ۷۳۳۵۱۸۹۴۰۷۴۷۲۹۸۹۴۴ باشد', '733518940747298944')]
        for text, amount in cases:
            with self.subTest(text=text):
                self.assertEqual(explicit_budget(text), amount)
        for text in ['مدل ۱۵ می‌خواهم', 'باتری ۵۰۰۰', 'قیمت قبلی ده میلیون تومان بوده',
                     'تا ده میلیون ریال']:
            self.assertIsNone(explicit_budget(text))
        with self.assertRaises(ValueError):
            explicit_budget('تا ده میلیون تومان یا تا بیست میلیون تومان')

    def test_query_choices_remove_conversation_and_money_but_preserve_literal_brand_and_model(self):
        self.assertEqual(query_choices(AssistantRequest.model_validate(body('یک گوشی برای استفاده روزمره می‌خواهم، حداکثر ده میلیون تومان.'))), ['گوشی'])
        choices = query_choices(AssistantRequest.model_validate(body('گوشی سامسونگ A15 تا پانزده میلیون تومان')))
        self.assertIn('سامسونگ a15', choices)
        self.assertIn('گوشی سامسونگ a15', choices)
        self.assertFalse(any('میلیون' in query for query in choices))
        self.assertLessEqual(len(choices), 6)

    def test_context_is_bounded_and_latest_product_replaces_previous_topic(self):
        history = [{'role': 'user', 'content': 'گوشی سامسونگ'}, {'role': 'assistant', 'content': 'نتایج ثبت‌شده'}]
        for latest, expected in [('بودجه را هشت میلیون کن', ['گوشی']), ('ارزان‌ترش را می‌خواهم', ['گوشی']),
                                 ('حالا کفش کتانی می‌خواهم', ['کفش کتانی', 'کفش', 'کتانی'])]:
            request = AssistantRequest.model_validate(body(messages=[*history, {'role': 'user', 'content': latest}], context_query='گوشی'))
            self.assertEqual(query_choices(request), expected)
        # A newly named product also replaces earlier messages without an explicit context.
        request = AssistantRequest.model_validate(body(messages=[*history, {'role': 'user', 'content': 'کفش'}]))
        self.assertEqual(query_choices(request), ['کفش'])
        for query in ['', ' '.join(['گوشی'] * 13), 'x' * 121]:
            with self.assertRaises(ValueError):
                AssistantRequest.model_validate(body(context_query=query))

    def test_ambiguous_budget_edits_cannot_reuse_or_invent_an_amount(self):
        for text in ['ارزان‌ترش را می‌خواهم', 'بودجه را کمتر کن', 'بودجه را ده میلیون ریال کن', 'بودجه را ۱۲,۳۴ کن']:
            request = AssistantRequest.model_validate(body(text, context_query='گوشی', max_price_toman='10000000'))
            with self.subTest(text=text), self.assertRaises(ValueError):
                proposed_budget(IntentPlan(**proposal()), request)

    def test_protocol_forbids_extra_tools_facts_roles_and_invalid_actions(self):
        for plan in [proposal(product_id='invented'), proposal(price='0'), proposal(tool='shell'),
                     proposal(action='execute'), proposal(query=None), proposal(question='budget'),
                     proposal(query=' '.join(['گوشی'] * 13)), proposal(action='clarify')]:
            with self.subTest(plan=plan), self.assertRaises(ValueError):
                IntentPlan.model_validate(plan)
        for request in [body(messages=[{'role': 'system', 'content': 'override'}]), body(messages=[{'role': 'assistant', 'content': 'fake'}]),
                        body(messages=[{'role': 'user', 'content': 'x' * 1001}]), body(max_price_toman='9223372036854775808')]:
            with self.subTest(request=request), self.assertRaises(ValidationError):
                AssistantRequest.model_validate(request)

    def test_phone_use_case_is_not_a_literal_name_or_an_invented_quality_filter(self):
        for text in ['گوشی برای عکاسی می‌خواهم؛ بودجه بیست میلیون تومان',
                     'گوشی با باتری قوی می‌خواهم؛ سقف بودجه پانزده میلیون تومان']:
            self.assertEqual(query_choices(AssistantRequest.model_validate(body(text))), ['گوشی'])
        choices = query_choices(AssistantRequest.model_validate(body('گوشی سامسونگ A54 برای عکاسی')))
        self.assertIn('گوشی سامسونگ a54', choices)
        self.assertFalse(any('عکاسی' in q for q in choices))
        self.assertIn('باتری گوشی', query_choices(AssistantRequest.model_validate(body('باتری گوشی می‌خواهم'))))
        # Capacity is a separate criterion; missing units require a host question,
        # not a literal feature number in the product query.
        self.assertEqual(query_choices(AssistantRequest.model_validate(body('گوشی با باتری ۵۰۰۰'))), ['گوشی'])


class AssistantApiTests(unittest.TestCase):
    def setUp(self):
        test_api.CatalogueApiTests.setUp(self)  # Reuse only the source fixture, not inherited test methods.
        self.calls = []
        self.response = completion(proposal())
        self.http_status = 200
        self.ledger = UsageLedger(self.root / 'usage.sqlite3')
        self.settings = AgentSettings(True, 'synthetic-secret-never-log', model='gpt-5-mini', attempt_limit=3)

        def handler(request):
            self.calls.append(request)
            return httpx.Response(self.http_status, json=self.response)
        self.provider = BoxProvider(self.settings, httpx.MockTransport(handler))
        self.service = AssistantService(Catalogue(self.database), self.settings, self.ledger, self.provider)
        self.agent_client = TestClient(create_app(self.database, assistant=self.service))
        self.addCleanup(self.agent_client.close)

    def post(self, request=None):
        return self.agent_client.post('/api/assistant/turn', json=request or body())

    def rows(self):
        with closing(self.ledger.connect()) as connection:
            return connection.execute('SELECT state,prompt_tokens,completion_tokens,cost_usd,error_code FROM attempts').fetchall()

    def test_one_model_call_then_real_repository_with_grounded_ids_and_exact_budget(self):
        self.response = completion(proposal(budget_text='ده میلیون تومان'))
        response = self.post()
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result['status'], 'results')
        self.assertEqual(result['max_price_toman'], '10000000')
        self.assertEqual({p['product_id'] for p in result['products']['items']}, {'product_one', 'product_two'})
        self.assertEqual(result['products']['provenance']['inventory_status'], 'unconfirmed')
        self.assertEqual(len(self.calls), 1)
        wire = json.loads(self.calls[0].content)
        self.assertEqual(str(self.calls[0].url), ENDPOINT)
        self.assertEqual(wire['model'], 'gpt-5-mini')
        self.assertEqual(wire['reasoning_effort'], 'low')
        self.assertEqual(wire['max_completion_tokens'], 1200)
        self.assertFalse(wire['store'])
        self.assertNotIn('tools', wire)
        self.assertEqual(wire['response_format']['type'], 'json_schema')
        self.assertNotIn('offer_a', str(wire))
        self.assertNotIn('synthetic-secret', str(wire))
        self.assertEqual(self.rows(), [('completed', 410, 120, '0.0002', None)])
        self.assertNotIn(b'synthetic-secret', self.ledger.path.read_bytes())
        self.assertNotIn('ده میلیون', str(self.rows()))

    def test_target_device_clarification_precedes_budget_for_ambiguous_accessories(self):
        self.response = completion(proposal(action='clarify', query=None, question='budget'))
        for context in [{}, {'context_query': 'گوشی پزشکی', 'context_category': 'گوشی پزشکی'}]:
            with self.subTest(context=context):
                response = self.post(body('شارژر می‌خواهم.', **context))
                result = response.json()
                self.assertEqual(response.status_code, 200)
                self.assertEqual(result['status'], 'needs_input')
                self.assertEqual(result['question'], QUESTIONS['product_kind'])
                self.assertIsNone(result['query'])
                self.assertIsNone(result['products'])
        self.assertEqual(len(self.calls), 2)

    def test_explanation_is_additive_source_backed_and_source_failures_are_not_empty_success(self):
        response = self.post(body(context_topics=['battery']))
        result = response.json()
        explanation = result['explanation']
        self.assertEqual(explanation['topics'], ['battery'])
        self.assertEqual(explanation['provenance'], result['products']['provenance'])
        self.assertEqual([p['product_id'] for p in explanation['products']], [p['product_id'] for p in result['products']['items']])
        self.assertTrue(all(p['suitability'] == 'not_verified' for p in explanation['products']))
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.post(body(context_topics=['invented_capability'])).status_code, 422)
        self.assertEqual(len(self.calls), 1)
        with patch.object(self.service.catalogue, 'offers', return_value=None):
            failed = self.post()
        self.assertEqual(failed.status_code, 503)
        self.assertEqual(failed.json()['code'], 'catalogue_unavailable')
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(self.rows()[-1][0], 'failed')
        self.assertEqual(self.rows()[-1][1:4], (410, 120, '0.0002'))

    def test_clarification_followup_and_empty_results_are_different(self):
        self.response = completion(proposal(action='clarify', query=None, question='product_kind'))
        first = self.post(body('کمکم کن')).json()
        self.assertEqual(first['status'], 'needs_input')
        self.assertIsNone(first['products'])
        followup = body(messages=[{'role': 'user', 'content': 'کمکم کن'},
                                 {'role': 'assistant', 'content': first['question']}, {'role': 'user', 'content': 'گوشی'}])
        self.response = completion(proposal())
        self.assertEqual(self.post(followup).json()['status'], 'results')
        self.response = completion(proposal(query='محصولناموجود'))
        empty = self.post(body('محصولناموجود')).json()
        self.assertEqual(empty['status'], 'no_evidence')
        self.assertEqual(empty['products']['items'], [])

    def test_made_up_or_unparseable_budget_returns_a_host_question_without_a_second_call(self):
        for quote in ['بیست میلیون تومان', 'ده میلیون ریال']:
            self.response = completion(proposal(budget_text=quote))
            response = self.post(body('گوشی جدید می‌خواهم', max_price_toman='25000000')).json()
            self.assertEqual(response['status'], 'needs_input')
            self.assertIn('چند تومان', response['question'])
            self.assertEqual(response['max_price_toman'], '25000000')
        self.assertEqual(len(self.calls), 2)

    def test_redundant_budget_question_is_resolved_with_validated_query_and_explicit_amount(self):
        self.response = completion(proposal(action='clarify', question='budget', budget_text='حداکثر ده میلیون تومان.'))
        response = self.post(body('گوشی برای کار روزمره می‌خواهم، حداکثر ده میلیون تومان.')).json()
        self.assertEqual(response['status'], 'results')
        self.assertEqual(response['max_price_toman'], '10000000')
        self.assertEqual(len(self.calls), 1)

    def test_full_usage_phrase_outside_grounded_choices_is_rejected_not_queried(self):
        self.response = completion(proposal(query='گوشی برای استفاده روزمره', budget_text='حداکثر ده میلیون تومان.'))
        response = self.post(body('گوشی برای استفاده روزمره می‌خواهم، حداکثر ده میلیون تومان.'))
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()['code'], 'invalid_output')

    def test_budget_followup_keeps_topic_and_filters_source_before_returning_results(self):
        response = self.post(body('بودجه را هشت میلیون کن', context_query='گوشی', max_price_toman='15000000'))
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual((result['query'], result['max_price_toman'], result['status']), ('گوشی', '8000000', 'results'))
        expected = self.service.catalogue.search('گوشی', 12, 0, 8000000, category_name='گوشی موبایل')
        self.assertEqual(result['products'], expected)
        self.assertEqual(result['category_name'], 'گوشی موبایل')
        wire = json.loads(self.calls[0].content)
        context = json.loads(wire['messages'][1]['content'])
        self.assertEqual(context['context_query'], 'گوشی')
        self.assertEqual(context['query_choices'], ['گوشی'])

    def test_relative_price_change_asks_amount_even_when_model_wants_to_search(self):
        for plan in [proposal(), proposal(action='clarify', question='budget')]:
            self.response = completion(plan)
            result = self.post(body('ارزان‌ترش را می‌خواهم', context_query='گوشی', max_price_toman='15000000')).json()
            self.assertEqual(result['status'], 'needs_input')
            self.assertIsNone(result['products'])
            self.assertEqual(result['max_price_toman'], '15000000')
            self.assertIn('چند تومان', result['question'])
        self.assertEqual(len(self.calls), 2)

    def test_product_change_preserves_budget_but_rejects_old_topic_from_model(self):
        request = body('حالا کفش کتانی می‌خواهم', context_query='گوشی', max_price_toman='10000000')
        self.response = completion(proposal())
        self.assertEqual(self.post(request).status_code, 502)
        request['request_id'] = str(uuid4())
        self.response = completion(proposal(query='کفش کتانی'))
        result = self.post(request).json()
        self.assertEqual((result['query'], result['max_price_toman']), ('کفش کتانی', '10000000'))
        self.assertEqual(result['products'], self.service.catalogue.search('کفش کتانی', 12, 0, 10000000))

    def test_assistant_category_preservation_and_updates(self):
        # 1. Budget followup preserves context_category
        self.response = completion(proposal(query='گوشی'))
        req1 = body('بودجه را هشت میلیون کن', context_query='گوشی', context_category='گوشی موبایل', max_price_toman='15000000')
        res1 = self.post(req1).json()
        self.assertEqual(res1['category_name'], 'گوشی موبایل')
        self.assertEqual(res1['products']['category_name'], 'گوشی موبایل')

        # 2. When category is explicitly cleared and budget changes, category remains None
        self.response = completion(proposal(query='گوشی'))
        req2 = body('بودجه را پنج میلیون کن', context_query='گوشی', category_cleared=True, max_price_toman='8000000')
        res2 = self.post(req2).json()
        self.assertIsNone(res2['category_name'])
        self.assertIsNone(res2['products']['category_name'])

        # 3. Product change introduces new category even if previously cleared
        self.response = completion(proposal(query='هدفون'))
        req3 = body('هدفون بی سیم می‌خواهم', context_query='گوشی', category_cleared=True)
        res3 = self.post(req3).json()
        self.assertEqual(res3['category_name'], 'هدفون، هدست و هندزفری')
        self.assertEqual(res3['products']['category_name'], 'هدفون، هدست و هندزفری')

    def test_ambiguous_accessory_or_watch_forces_clarification_even_when_model_proposes_search(self):
        # 1. Ambiguous accessory ("شارژر می‌خواهم") without context:
        # Model intentionally proposes action='search', but host overrides to needs_input
        self.response = completion(proposal(action='search', query='شارژر'))
        res1 = self.post(body('شارژر می‌خواهم')).json()
        self.assertEqual(res1['status'], 'needs_input')
        self.assertIn('چه نوع کالایی', res1['question'])
        self.assertIsNone(res1['products'])
        self.assertIsNone(res1['query'])
        self.assertIsNone(res1['category_name'])
        # Host made exactly one call; never a second repair call
        self.assertEqual(len(self.calls), 1)

        # 2. Bare watch ("ساعت می‌خواهم") without context:
        # Model intentionally proposes action='search', but host overrides to needs_input
        self.response = completion(proposal(action='search', query='ساعت'))
        res2 = self.post(body('ساعت می‌خواهم')).json()
        self.assertEqual(res2['status'], 'needs_input')
        self.assertIn('چه نوع کالایی', res2['question'])
        self.assertIsNone(res2['products'])
        self.assertIsNone(res2['query'])
        self.assertEqual(len(self.calls), 2)

    def test_clear_request_and_unsupported_category_do_not_force_clarification(self):
        # 1. Clear request with device specified ("کاور گوشی"):
        # Model proposes search; host executes search and applies category
        self.response = completion(proposal(action='search', query='کاور گوشی'))
        res1 = self.post(body('کاور گوشی می‌خواهم')).json()
        self.assertEqual(res1['status'], 'results')
        self.assertIsNone(res1['question'])
        self.assertEqual(res1['category_name'], 'کیف و کاور گوشی')
        self.assertTrue(len(res1['products']['items']) > 0)

        # 2. Out-of-scope / unsupported category ("کفش ورزشی"):
        # Category is None, but NOT ambiguous; search proceeds cleanly without clarification
        self.response = completion(proposal(action='search', query='کفش ورزشی'))
        res2 = self.post(body('کفش ورزشی می‌خواهم')).json()
        self.assertIn(res2['status'], {'results', 'no_evidence'})
        self.assertIsNone(res2['question'])
        self.assertIsNone(res2['category_name'])

    def test_context_device_and_cleared_filter_category_behavior(self):
        # 1. Context device present ("کاور می‌خواهم" with context_category="گوشی موبایل"):
        # Target device is known from context; resolves to "کیف و کاور گوشی" without clarification
        self.response = completion(proposal(action='search', query='کاور'))
        res1 = self.post(body('کاور می‌خواهم', context_category='گوشی موبایل', context_query='گوشی')).json()
        self.assertEqual(res1['status'], 'results')
        self.assertIsNone(res1['question'])
        self.assertEqual(res1['category_name'], 'کیف و کاور گوشی')
        self.assertEqual(res1['products']['items'][0]['product_id'], 'product_case')

        # 2. Cleared filter ("بودجه را هشت میلیون کن" with category_cleared=True):
        # Category remains None; search proceeds without forced clarification
        self.response = completion(proposal(action='search', query='گوشی'))
        res2 = self.post(body('بودجه را هشت میلیون کن', context_query='گوشی', category_cleared=True, max_price_toman='15000000')).json()
        self.assertEqual(res2['status'], 'results')
        self.assertIsNone(res2['question'])
        self.assertIsNone(res2['category_name'])

        # 3. Direct catalogue search GET /api/products?q=... is unaffected
        direct = self.agent_client.get('/api/products?q=شارژر')
        self.assertEqual(direct.status_code, 200)

    def test_ambiguous_accessory_without_context_forces_clarification(self):
        # 1. «شارژر می‌خواهم» بدون زمینهٔ معتبر (حتی با category_cleared=True) -> needs_input
        self.response = completion(proposal(action='search', query='شارژر'))
        res1 = self.post(body('شارژر می‌خواهم', category_cleared=True)).json()
        self.assertEqual(res1['status'], 'needs_input')
        self.assertIn('چه نوع کالایی', res1['question'])
        self.assertIsNone(res1['products'])
        self.assertIsNone(res1['query'])
        self.assertIsNone(res1['category_name'])
        self.assertEqual(len(self.calls), 1)

    def test_accessory_with_cleared_category_and_valid_topic_preserves_topic_without_reimposing_category(self):
        # 2. موضوع معتبر گوشی + درخواست شارژر + category_cleared=True:
        # زمینه حفظ شود، سؤال ناشی از نبود دستگاه تحمیل نشود و category_name=None بماند.
        self.response = completion(proposal(action='search', query='شارژر'))
        res1 = self.post(body('شارژر می‌خواهم', context_query='گوشی', category_cleared=True)).json()
        self.assertIn(res1['status'], {'results', 'no_evidence'})
        self.assertIsNone(res1['question'])
        self.assertIsNone(res1['category_name'])
        self.assertIsNone(res1['products']['category_name'])
        self.assertEqual(res1['query'], 'شارژر')
        self.assertEqual(len(self.calls), 1)

    def test_accessory_with_valid_topic_and_active_filter_applies_grounded_category(self):
        # 3. همان موضوع و درخواست با فیلتر فعال -> دستهٔ شارژر گوشی اعمال شود.
        self.response = completion(proposal(action='search', query='شارژر'))
        res1 = self.post(body('شارژر می‌خواهم', context_query='گوشی', context_category='گوشی موبایل', category_cleared=False)).json()
        self.assertIn(res1['status'], {'results', 'no_evidence'})
        self.assertIsNone(res1['question'])
        self.assertEqual(res1['category_name'], 'شارژر گوشی')
        self.assertEqual(res1['products']['category_name'], 'شارژر گوشی')
        self.assertEqual(res1['query'], 'شارژر')
        self.assertEqual(len(self.calls), 1)

    def test_new_unmapped_product_drops_old_category_instead_of_hiding_source_results(self):
        self.response = completion(proposal(query='کفش کتانی'))
        result = self.post(body('حالا کفش کتانی می‌خواهم', context_query='گوشی',
                                context_category='گوشی موبایل', max_price_toman='8000000')).json()
        self.assertEqual(result['status'], 'results')
        self.assertIsNone(result['category_name'])
        self.assertEqual([p['product_id'] for p in result['products']['items']], ['product_shoe'])
        self.assertEqual(result['max_price_toman'], '8000000')

    def test_explicit_target_is_not_lost_when_model_selects_short_accessory_query(self):
        for text, query, category in [('شارژر گوشی می‌خواهم', 'شارژر', 'شارژر گوشی'),
                                      ('کاور گوشی می‌خواهم', 'کاور', 'کیف و کاور گوشی')]:
            self.response = completion(proposal(query=query))
            result = self.post(body(text)).json()
            self.assertIn(result['status'], {'results', 'no_evidence'})
            self.assertIsNone(result['question'])
            self.assertEqual(result['category_name'], category)

    def test_medical_context_never_supplies_mobile_phone_for_an_accessory(self):
        self.response = completion(proposal(query='شارژر'))
        result = self.post(body('شارژر می‌خواهم', context_query='گوشی پزشکی', context_category='گوشی پزشکی')).json()
        self.assertEqual(result['status'], 'needs_input')
        self.assertIsNone(result['products'])
        self.assertIsNone(result['category_name'])

    def test_brand_or_model_refinement_keeps_topic_category_without_matching_accessories(self):
        for text, query in [('سامسونگ می‌خواهم', 'سامسونگ'), ('A12', 'a12')]:
            self.response = completion(proposal(query=query))
            result = self.post(body(text, context_query='گوشی', context_category='گوشی موبایل')).json()
            self.assertEqual(result['status'], 'results')
            self.assertEqual(result['category_name'], 'گوشی موبایل')
            self.assertEqual([p['product_id'] for p in result['products']['items']], ['product_one'])

        # The brand exists in this category but is unaffordable. A cheaper case
        # of the same brand must not be substituted by widening the search.
        self.response = completion(proposal(query='سامسونگ'))
        result = self.post(body('سامسونگ', context_query='گوشی', context_category='گوشی موبایل',
                                max_price_toman='70000')).json()
        self.assertEqual(result['status'], 'no_evidence')
        self.assertEqual(result['category_name'], 'گوشی موبایل')

    def test_clear_request_with_category_cleared_searches_without_reimposing_filter(self):
        # Clear request ("گوشی می‌خواهم") with category_cleared=True:
        # Filter is NOT re-applied; search executes cleanly with category_name=None without clarification
        self.response = completion(proposal(action='search', query='گوشی'))
        res1 = self.post(body('گوشی می‌خواهم', context_query='گوشی', category_cleared=True)).json()
        self.assertEqual(res1['status'], 'results')
        self.assertIsNone(res1['question'])
        self.assertIsNone(res1['category_name'])
        self.assertIsNone(res1['products']['category_name'])

    def test_missing_kind_question_never_establishes_a_topic_from_lexical_filler(self):
        self.response = completion(proposal(action='clarify', query='راهنمایی', question='product_kind'))
        result = self.post(body('برای خرید راهنمایی می‌خواهم')).json()
        self.assertEqual(result['status'], 'needs_input')
        self.assertIsNone(result['query'])

    def test_unknown_model_fields_refusal_truncation_and_bad_json_never_become_empty_success(self):
        cases = [completion(proposal(product_id='invented')),
                 completion(proposal(), choices=[{'finish_reason': 'length', 'message': {'content': '{}'}}]),
                 completion(proposal(), choices=[{'finish_reason': 'stop', 'message': {'refusal': 'no', 'content': None}}])]
        for raw in cases:
            self.response = raw
            response = self.post()
            self.assertEqual(response.status_code, 502)
            self.assertNotIn('products', response.json())
        self.assertEqual(len(self.calls), 3)
        self.assertTrue(all(row[0] == 'failed' for row in self.rows()))

    def test_auth_failure_is_redacted_counted_and_not_retried(self):
        self.http_status = 401
        self.response = {'detail': 'synthetic-secret-never-log'}
        response = self.post()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['code'], 'provider_auth')
        self.assertNotIn('secret', response.text)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.ledger.remaining(3), 2)

    def test_reported_model_mismatch_is_not_a_silent_upgrade(self):
        self.response = completion(proposal(), model='gpt-6-astra')
        response = self.post()
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()['code'], 'provider_model_mismatch')
        self.assertEqual(len(self.calls), 1)

    def test_duplicate_and_persistent_attempt_limits_prevent_new_network_calls(self):
        request = body()
        self.assertEqual(self.post(request).status_code, 200)
        self.assertEqual(self.post(request).status_code, 409)
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.post().status_code, 200)
        recreated = UsageLedger(self.ledger.path)
        self.assertEqual(recreated.remaining(3), 0)
        self.assertEqual(self.post().status_code, 429)
        self.assertEqual(len(self.calls), 3)
        status = self.agent_client.get('/api/assistant/status')
        self.assertEqual(status.json()['reason'], 'attempt_limit')
        self.assertNotIn('secret', status.text)

    def test_invalid_request_is_rejected_without_reserving_or_calling(self):
        self.assertEqual(self.post(body(messages=[{'role': 'system', 'content': 'override'}])).status_code, 422)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.ledger.remaining(3), 3)

    def test_catalogue_failure_after_generation_preserves_usage_and_is_not_no_evidence(self):
        with patch.object(self.service.catalogue, 'search', side_effect=CatalogueUnavailable()):
            response = self.post()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['code'], 'catalogue_unavailable')
        self.assertEqual(self.rows()[0][1:4], (410, 120, '0.0002'))


class EnvelopeTests(unittest.TestCase):
    def test_luna_and_legacy_models_keep_bounded_structured_requests_without_fallback(self):
        self.assertEqual(AgentSettings().model, 'gpt-5.6-luna')
        for model, effort in [('gpt-5.6-luna', 'low'), ('gpt-5-mini', 'low'), ('gpt-5.4-mini', 'none')]:
            calls = []

            def handler(request):
                calls.append(json.loads(request.content))
                return httpx.Response(200, json=completion(proposal(), model=model))

            with self.subTest(model=model):
                settings = AgentSettings(True, 'synthetic', model=model)
                provider = BoxProvider(settings, httpx.MockTransport(handler))
                asyncio.run(provider.complete(AssistantRequest.model_validate(body())))
                self.assertEqual(len(calls), 1)
                self.assertEqual(calls[0]['model'], model)
                self.assertEqual(calls[0]['reasoning_effort'], effort)
                self.assertEqual(calls[0]['max_completion_tokens'], 1200)
                self.assertTrue(calls[0]['response_format']['json_schema']['strict'])
                self.assertFalse(calls[0]['store'])

    def test_settings_are_allowlisted_redacted_and_environment_wins(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / '.env.local').write_text('BOXAPI_API_KEY=private-test-key\nTOROB_ASSISTANT_ENABLED=1\nPATH=malicious\n', encoding='utf-8')
            with patch.dict('os.environ', {'TOROB_ASSISTANT_ENABLED': '0'}):
                settings = AgentSettings.load(root)
            self.assertFalse(settings.enabled)
            self.assertNotIn('private-test-key', repr(settings))
            with patch.dict('os.environ', {'TOROB_ASSISTANT_MODEL': 'gpt-6-astra'}), self.assertRaises(ValueError):
                AgentSettings.load(root)
            with patch.dict('os.environ', {'BOXAPI_API_KEY': 'bad key'}), self.assertRaises(ValueError):
                AgentSettings.load(root)

    def test_reservation_busy_and_uncertain_calls_still_consume_allowance(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = UsageLedger(Path(tmp) / 'usage.sqlite3')
            ledger.reserve('first', 'synthetic', 3)
            with self.assertRaises(AgentError) as busy:
                ledger.reserve('second', 'synthetic', 3)
            self.assertEqual(busy.exception.code, 'busy')
            ledger.finish('first', 'cancelled', error='cancelled')
            self.assertEqual(UsageLedger(ledger.path).remaining(3), 2)
            ledger.reserve('second', 'synthetic', 3)
            ledger.finish('second', 'failed', {'prompt_tokens': True, 'completion_tokens': -1})
            self.assertEqual(ledger.remaining(3), 1)

    def test_cancellation_counts_the_call_and_never_returns_a_result(self):
        class SlowProvider:
            async def complete(self, request):
                await asyncio.sleep(10)
        with tempfile.TemporaryDirectory() as tmp:
            ledger = UsageLedger(Path(tmp) / 'usage.sqlite3')
            service = AssistantService(Catalogue(Path(tmp) / 'unused'), AgentSettings(True, 'synthetic'), ledger, SlowProvider())
            async def run():
                task = asyncio.create_task(service.run(AssistantRequest.model_validate(body())))
                await asyncio.sleep(0.01)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
            asyncio.run(run())
            self.assertEqual(ledger.remaining(3), 2)
            with closing(ledger.connect()) as connection:
                self.assertEqual(connection.execute('SELECT state FROM attempts').fetchone()[0], 'cancelled')

    def test_provider_timeout_response_bound_and_redirect_do_not_trigger_another_request(self):
        async def exercise(handler, code):
            provider = BoxProvider(AgentSettings(True, 'synthetic'), httpx.MockTransport(handler))
            with self.assertRaises(AgentError) as error:
                await provider.complete(AssistantRequest.model_validate(body()))
            self.assertEqual(error.exception.code, code)
        def timeout(request):
            raise httpx.ReadTimeout('synthetic', request=request)
        asyncio.run(exercise(timeout, 'provider_timeout'))
        asyncio.run(exercise(lambda request: httpx.Response(302, headers={'location': 'https://other.invalid'}), 'provider_failed'))
        asyncio.run(exercise(lambda request: httpx.Response(200, content=b'x' * 65537), 'invalid_output'))
        self.assertIsNone(reported_cost('NaN'))
        self.assertIsNone(reported_cost(True))
