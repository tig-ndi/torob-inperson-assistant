"""Regression checks for judged conversations; no billable provider calls."""
import unittest
import sqlite3
from contextlib import closing
from apps.api.source_filters import SourceFilters, edited_filters
from apps.api.purchase_context import retained_identity
from apps.api.intent import multiple_topic_heads
import test_assistant


class SelectiveEditTests(unittest.TestCase):
    def test_departure_clock_is_not_a_second_purchase_of_a_watch(self):
        categories=['شارژر گوشی','گوشی موبایل','ساعت هوشمند']
        self.assertFalse(multiple_topic_heads('شارژر تایپ سی برای گوشی لازم دارم، ساعت ۲۳:۳۰ امشب', categories))
        self.assertTrue(multiple_topic_heads('گوشی و ساعت هوشمند میخوام', categories))

    def test_natural_possessive_waivers_keep_the_other_source_fields(self):
        old = SourceFilters(colour='سفید', size='38')
        for text in ['رنگش مهم نیست ولی سایز همون ۳۸ بمونه', 'رنگ دیگه مهم نیست',
                     'رنگش برام مهم نیست', 'رنگش فرقی نداره', 'رنگ رو حذف کن']:
            with self.subTest(text=text):
                result = edited_filters(old, text, lambda field: True)
                self.assertIsNone(result.colour)
                self.assertEqual(result.size, '38')
        self.assertEqual(edited_filters(old, 'رنگ را حذف نکن', lambda field: True), old)

    def test_budget_edits_keep_identity_but_explicit_identity_changes_are_allowed(self):
        self.assertEqual(retained_identity('بودجه رو ببر پنج میلیون؛ کفش سفید سایز ۳۸', 'کفش زنانه', 'کفش'), 'کفش زنانه')
        self.assertEqual(retained_identity('کفش مردانه میخوام', 'کفش زنانه', 'کفش مردانه'), 'کفش مردانه')
        self.assertEqual(retained_identity('حالا شارژر میخوام', 'گوشی سامسونگ', 'شارژر'), 'شارژر')


class ConversationRepairsTests(unittest.TestCase):
    setUp = test_assistant.AssistantApiTests.setUp
    post = test_assistant.AssistantApiTests.post

    def test_possessive_field_edits_are_not_new_colour_products(self):
        # The real catalogue contains heads such as «سفید». Reproduce that
        # collision instead of relying on the fixture's smaller vocabulary.
        with closing(sqlite3.connect(self.database)) as db:
            db.execute("UPDATE products SET persian_title='سفید',category_name='سفید' WHERE product_id='product_case'")
            db.execute("UPDATE product_search SET text='سفید' WHERE product_id='product_case'")
            db.commit()
        for text in ['رنگش سفید باشه ولی سایز همون ۳۸', 'سایزش ۳۸ باشه']:
            self.response = test_assistant.completion(test_assistant.proposal(query='سفید'))
            response = self.post(test_assistant.body(text, context_need_state={
                'topic_query':'کفش زنانه', 'max_price_toman':'5000000',
                'source_filters':{'colour':None,'size':'38','connector':None}}))
            self.assertEqual(response.status_code, 200, response.text)
            state = response.json()['need_state']
            self.assertEqual(state['topic_query'], 'کفش زنانه')
            self.assertEqual(state['source_filters']['size'], '38')

    def test_explanatory_questions_retain_the_phone_or_accessory_topic(self):
        for text, topic, category in [
            ('چرا همین فروشگاه رو انتخاب کردی؟', 'گوشی', 'گوشی موبایل'),
            ('این مدل به A54 من میخوره؟', 'شارژر گوشی', 'شارژر گوشی'),
        ]:
            self.response = test_assistant.completion(test_assistant.proposal(query=topic))
            response = self.post(test_assistant.body(text, context_query=topic, context_category=category))
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['need_state']['topic_query'], topic)

    def test_a_device_in_the_latest_charger_request_prevents_a_duplicate_device_question(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='شارژر'))
        for text in ['شارژر تایپ سی برای گوشی میخوام، ساعت ۲۳:۳۰ امشب',
                     'شارژر برای گوشی سامسونگ A54 میخوام، زیر یک میلیون، تایپ سی']:
            response = self.post(test_assistant.body(text))
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()
            self.assertNotEqual(result['question_code'], 'product_kind', result)
            self.assertEqual(result['need_state']['category_name'], 'شارژر گوشی')

    def test_a_shorter_head_in_a_budget_edit_does_not_remove_gender(self):
        self.response = test_assistant.completion(test_assistant.proposal(query='کفش'))
        response = self.post(test_assistant.body('بودجه رو ببر تا پنج میلیون ولی فقط کفش سفید سایز ۳۸',
            context_query='کفش زنانه', max_price_toman='3000000'))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['need_state']['topic_query'], 'کفش زنانه')
        self.assertEqual(response.json()['max_price_toman'], '5000000')
