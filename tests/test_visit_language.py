"""Replay judge findings using mocked model output, never provider credit."""
import unittest
import test_assistant as fixtures
from apps.api.intent import AssistantRequest, product_span, query_choices, question_prompt, matches_question


class VisitLanguageTests(unittest.TestCase):
    def test_budget_and_inperson_words_are_not_product_identity(self):
        message = 'هدفون سیمی زیر دو میلیون تومان می‌خواهم، برای خرید حضوری.'
        request = AssistantRequest.model_validate(fixtures.body(message))
        self.assertEqual(product_span(message, ['هدفون، هدست و هندزفری'], set()), 'هدفون سیمی')
        choices = query_choices(request)
        self.assertIn('هدفون سیمی', choices)
        self.assertFalse(any('زیر' in c or 'حضوری' in c for c in choices))

    def test_ambiguous_branded_charger_gets_device_question(self):
        question = question_prompt('product_kind', topic='شارژر سامسونگ')
        self.assertIn('چه دستگاهی', question)
        self.assertTrue(matches_question(question, 'product_kind'))
        self.assertTrue(matches_question(question_prompt('product_kind', True, 'شارژر سامسونگ'), 'product_kind'))


class VisitLanguageReplayTests(unittest.TestCase):
    setUp = fixtures.AssistantApiTests.setUp
    post = fixtures.AssistantApiTests.post

    def test_clean_headphone_query_and_exact_budget_survive_model_boundary(self):
        self.response = fixtures.completion(fixtures.proposal(query='هدفون سیمی', budget_text='دو میلیون تومان'))
        response = self.post(fixtures.body('هدفون سیمی زیر دو میلیون تومان می‌خواهم، برای خرید حضوری.'))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['query'], 'هدفون سیمی')
        self.assertEqual(response.json()['max_price_toman'], '2000000')
        self.assertEqual(len(self.calls), 1)

    def test_old_polluted_model_query_is_rejected_before_catalogue_search(self):
        self.response = fixtures.completion(fixtures.proposal(query='هدفون سیمی زیر', budget_text='دو میلیون تومان'))
        response = self.post(fixtures.body('هدفون سیمی زیر دو میلیون تومان می‌خواهم، برای خرید حضوری.'))
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()['code'], 'invalid_output')


if __name__ == '__main__':
    unittest.main()
