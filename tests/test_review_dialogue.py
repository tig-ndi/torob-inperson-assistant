"""Judge-reported dialogue transitions, with independent model/transport fixtures."""
import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
from apps.api.assistant import AgentSettings, BoxProvider
from apps.api.intent import AssistantRequest, query_choices, explicit_budget
from apps.api.purchase_language import affirmative_purchase_text
from apps.api.purchase_context import released_brand_topic
import test_assistant as fixtures


@unittest.skipUnless(fixtures.SNAPSHOT.exists(), 'local snapshot not present')
class ReviewDialogueTests(unittest.TestCase):
    def setUp(self):
        fixtures.SnapshotAssistantApiTests.setUp(self)

    def turn(self, text, state=None, **plan):
        return fixtures.SnapshotAssistantApiTests.post_turn(self, text, state,
            fixtures.proposal(action='clarify', query=None, question='product_kind', **plan))

    def test_charger_answer_preserves_accessory_budget_and_applies_recorded_connector(self):
        first = self.turn('شارژر سامسونگ تا یک میلیون تومان میخواهم')
        self.assertEqual(first['question_code'], 'product_kind')
        self.assertIn('شارژر', first['need_state']['topic_query'])
        second = self.turn('برای گوشی سامسونگ A54، تایپ سی', first['need_state'])
        self.assertTrue(second['query'].startswith('شارژر'), second)
        self.assertEqual(second['max_price_toman'], '1000000')
        self.assertEqual(second['category_name'], 'شارژر گوشی')
        self.assertEqual(second['need_state']['source_filters']['connector'], 'usb-c')
        self.assertNotIn('درگاه', [r['key'] for r in second['need_state']['pending_requirements']])

    def test_brand_release_and_spoken_budget_keep_independent_conditions(self):
        state = fixtures.phone_battery_state(topic_query='گوشی سامسونگ', max_price_toman='10000000')
        result = self.turn('سامسونگ مهم نیست، هر برندی باشه', state)
        self.assertEqual(result['query'], 'گوشی')
        self.assertEqual(result['battery_requirement']['minimum_mah'], 5000)
        self.assertEqual(result['max_price_toman'], '10000000')
        result = self.turn('نه منظورم پونزده میلیون بود', result['need_state'])
        self.assertEqual(result['max_price_toman'], '15000000')
        self.assertEqual(result['query'], 'گوشی')

    def test_credit_followup_keeps_phone_and_budget_without_financing_claim(self):
        first = self.turn('گوشی تا پانزده میلیون تومان میخوام، قسطی باشه')
        second = self.turn('فقط فروشگاهیه که ترب پی حضوری داره', first['need_state'])
        self.assertEqual(second['query'], 'گوشی')
        self.assertEqual(second['max_price_toman'], '15000000')
        self.assertEqual(second['need_state']['pending_requirements'], [])
        self.assertNotIn('تأیید اعتبار', second['explanation']['summary'])

    def test_contact_execution_status_is_visible_in_the_first_answer(self):
        result = self.turn('گوشی تا ده میلیون میخوام؛ به فروشنده زنگ بزن بپرس موجوده')
        self.assertIn('تماس واقعی با فروشنده انجام نشده', result['explanation']['summary'])
        self.assertEqual(result['max_price_toman'], '10000000')


class ReviewProtocolTests(unittest.TestCase):
    def test_replacement_and_negation_are_not_purchase_lists(self):
        self.assertNotIn('هدفون', affirmative_purchase_text('به جای هدفون یک پاوربانک میخوام'))
        self.assertNotIn('گوشی', affirmative_purchase_text('فقط شارژر میخوام، نه خود گوشی'))
        self.assertIn('کابل', affirmative_purchase_text('شارژر و کابل میخوام'))
        self.assertEqual(explicit_budget('نه منظورم پونزده میلیون بود'), '15000000')
        self.assertIsNone(released_brand_topic('رنگ مهم نیست', 'گوشی سامسونگ'))

    def test_configured_sol_model_receives_reasoning_room_and_strict_schema(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict('os.environ', {
            'TOROB_ASSISTANT_MODEL': 'gpt-6.1-sol', 'TOROB_ASSISTANT_ENABLED': '1',
            'TOROB_ASSISTANT_ATTEMPT_LIMIT': '3', 'BOXAPI_API_KEY': 'synthetic-test-key'}):
            settings = AgentSettings.load(Path(directory))
        calls = []
        def respond(request):
            calls.append(json.loads(request.content))
            return httpx.Response(200, json={})
        request = AssistantRequest.model_validate(fixtures.body('گوشی میخواهم'))
        asyncio.run(BoxProvider(settings, httpx.MockTransport(respond)).complete(request))
        self.assertEqual(calls[0]['model'], 'gpt-6.1-sol')
        self.assertEqual(calls[0]['reasoning_effort'], 'medium')
        self.assertGreaterEqual(calls[0]['max_completion_tokens'], 4096)
        self.assertTrue(calls[0]['response_format']['json_schema']['strict'])
        self.assertFalse(calls[0]['store'])
