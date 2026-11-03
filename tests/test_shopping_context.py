"""Regression cases for ordinary follow-ups; providers are always synthetic."""
import json
from contextlib import closing
import sqlite3
import unittest
import test_assistant as fixtures
from apps.api.shopping_intent import matches_product_kind, recorded_operating_system, model_edition_matches
from tools.prepare_data import normalize_text


class ShoppingContextTests(unittest.TestCase):
    def setUp(self):
        fixtures.AssistantApiTests.setUp(self)

    def post(self, value):
        if value.get('context_need_state') and value.get('max_price_toman') is None:
            value.pop('max_price_toman', None)
        result = self.agent_client.post('/api/assistant/turn', json=value)
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()

    def add_product(self, identity, title, category, specs=(), model=None):
        with closing(sqlite3.connect(self.database)) as db:
            db.execute('INSERT INTO products(product_id,persian_title,category_name,model,specs,image_urls) VALUES(?,?,?,?,?,?)',
                       (identity,title,category,model,json.dumps(specs,ensure_ascii=False),'[]'))
            db.execute('INSERT INTO product_search VALUES(?,?)',(identity,normalize_text(title+' '+(model or '')+' '+category)))
            db.execute('INSERT INTO offers(offer_id,product_id,shop_id,price_toman) VALUES(?,?,?,?)',('offer_'+identity,identity,'shop_one',150000))
            db.commit()

    def test_referenced_colour_and_size_keep_the_purchase_even_when_model_asks_product_kind(self):
        self.add_product('hair_dye','رنگ مو آزمایشی','رنگ مو')
        for text,field in [('همین اولی رنگ سفیدش را می‌خواهم.','رنگ'),('همون دومی سایز ۳۸ می‌خوام','سایز'),('رنگ سفیدش را می‌خواهم','رنگ')]:
            with self.subTest(text=text):
                self.response=fixtures.completion(fixtures.proposal(action='clarify',query=None,question='product_kind'))
                result=self.post(fixtures.body(text,context_need_state=fixtures.phone_battery_state(topic_query='کفش',category_name=None,max_price_toman='3000000',battery_requirement={'status':'unspecified','minimum_mah':None},review_topics=[])))
                self.assertEqual(result['need_state']['topic_query'],'کفش')
                self.assertEqual(result['question_code'],'unsupported_filter')
                self.assertEqual(result['max_price_toman'],'3000000')
                self.assertIn(field,[p['key'] for p in result['need_state']['pending_requirements']])
        self.assertEqual(len(self.calls),3)

    def test_bilingual_model_refinement_keeps_device_category_and_excludes_parts(self):
        self.add_product('phone_redmi','گوشی موبایل شیائومی مدل Redmi Note 10','گوشی موبایل',model='Redmi Note 10')
        self.add_product('battery_redmi','باتری شیائومی ردمی نوت 10','باتری گوشی موبایل')
        self.response=fixtures.completion(fixtures.proposal(query='ردمی نوت 10'))
        result=self.post(fixtures.body('ردمی نوت ۱۰ شیائومی چطور؟ بودجه همان باشد.',context_query='گوشی',context_category='گوشی موبایل',max_price_toman='3000000'))
        self.assertEqual(result['category_name'],'گوشی موبایل')
        self.assertEqual([p['product_id'] for p in result['products']['items']],['phone_redmi'])
        self.assertEqual(result['need_state']['category_name'],'گوشی موبایل')

    def test_explicit_accessory_switch_does_not_inherit_phone_category(self):
        self.add_product('battery_redmi','باتری گوشی ردمی نوت 10','باتری گوشی موبایل')
        self.response=fixtures.completion(fixtures.proposal(query='باتری ردمی نوت'))
        result=self.post(fixtures.body('حالا باتری ردمی نوت ۱۰ می‌خواهم',context_query='گوشی',context_category='گوشی موبایل'))
        self.assertEqual(result['category_name'],'باتری گوشی موبایل')
        self.assertNotEqual(result['need_state']['category_name'],'گوشی موبایل')

    def test_android_is_a_recorded_predicate_not_an_ignored_use_case(self):
        self.add_product('android_phone','گوشی مدل Droid','گوشی موبایل',[{'section':'کلی','key':'سیستم عامل','value':'Android 12'}])
        self.add_product('ios_phone','گوشی مدل Fruit','گوشی موبایل',[{'section':'کلی','key':'سیستم عامل','value':'iOS 18'}])
        self.response=fixtures.completion(fixtures.proposal())
        result=self.post(fixtures.body('گوشی با سیستم عامل اندروید تا سه میلیون تومان می‌خواهم'))
        self.assertIn('اندروید',result['need_state']['topic_query'])
        self.assertEqual([p['product_id'] for p in result['products']['items']],['android_phone'])
        self.response=fixtures.completion(fixtures.proposal(query=result['need_state']['topic_query']))
        followup=self.post(fixtures.body('بودجه را دو میلیون کن',context_need_state=result['need_state']))
        self.assertIn('اندروید',followup['need_state']['topic_query'])
        self.assertEqual([p['product_id'] for p in followup['products']['items']],['android_phone'])
        self.response=fixtures.completion(fixtures.proposal(query=followup['need_state']['topic_query']))
        removed=self.post(fixtures.body('فیلتر اندروید را بردار',context_need_state=followup['need_state']))
        self.assertNotIn('اندروید',removed['need_state']['topic_query'])
        self.assertIn('ios_phone',[p['product_id'] for p in removed['products']['items']])

    def test_os_source_unknown_and_android_imitating_ios_are_not_ios_matches(self):
        specs=json.dumps([{'key':'سیستم عامل','value':'اندروید (شبیه ios)'}],ensure_ascii=False)
        self.assertEqual(matches_product_kind('گوشی ios','گوشی موبایل','آیفون طرح',specs),0)
        self.assertEqual(matches_product_kind('گوشی اندروید','گوشی موبایل','آیفون طرح',specs),1)
        self.assertEqual(matches_product_kind('گوشی اندروید','گوشی موبایل','گوشی','[]'),0)
        self.assertEqual(recorded_operating_system([{'key':'سیستم عامل','value':'ندارد'}]),None)

    def test_named_model_editions_do_not_silently_change(self):
        self.assertFalse(model_edition_matches('باتری ردمی نوت 10','Redmi Note 10 Pro / 10 Pro Max → BN53'))
        self.assertTrue(model_edition_matches('باتری ردمی نوت 10','باتری Redmi Note 10 مدل BN5A'))
        self.assertFalse(model_edition_matches('گوشی iPhone 14 pro','گوشی iPhone 14 Pro Max'))
        self.assertTrue(model_edition_matches('گوشی ردمی','Redmi Note 10 Pro'))
        self.assertTrue(model_edition_matches('باتری ردمی نوت 10','Redmi Note 10 / Note 10 Pro'))

    def test_natural_release_keeps_the_same_purchase_and_budget(self):
        self.response=fixtures.completion(fixtures.proposal(query='کفش'))
        need=fixtures.phone_battery_state(topic_query='کفش',category_name=None,max_price_toman='3000000',battery_requirement={'status':'unspecified','minimum_mah':None},review_topics=[],pending_requirements=[{'key':'رنگ','source_text':'رنگ سفید','status':'unsupported'}])
        result=self.post(fixtures.body('بدون این شرط ادامه بده، بودجه همان باشد.',context_need_state=need))
        self.assertEqual(result['need_state']['topic_query'],'کفش')
        self.assertEqual(result['need_state']['pending_requirements'],[])
        self.assertEqual(result['max_price_toman'],'3000000')
        self.assertIsNone(result['question'])

    def test_implicit_colour_reference_is_pending_not_a_new_product(self):
        self.response=fixtures.completion(fixtures.proposal(action='clarify',query=None,question='product_kind'))
        result=self.post(fixtures.body('همون اولی سفیدش رو میخوام',context_query='کفش زنانه',max_price_toman='3000000'))
        self.assertEqual(result['need_state']['topic_query'],'کفش زنانه')
        self.assertEqual(result['question_code'],'unsupported_filter')
        self.assertEqual([p['key'] for p in result['need_state']['pending_requirements']],['رنگ'])

    def test_negated_os_is_not_silently_applied_as_a_positive_filter(self):
        self.response=fixtures.completion(fixtures.proposal(query='گوشی'))
        result=self.post(fixtures.body('اندروید نمی‌خواهم',context_query='گوشی',context_category='گوشی موبایل'))
        self.assertEqual(result['question_code'],'unsupported_filter')
        self.assertEqual(result['need_state']['topic_query'],'گوشی')
        self.assertIn('سیستم عامل',[r['key'] for r in result['need_state']['pending_requirements']])

    def test_budget_edit_does_not_waive_an_unhandled_os_request(self):
        self.response=fixtures.completion(fixtures.proposal(query='گوشی اندروید'))
        need=fixtures.phone_battery_state(topic_query='گوشی اندروید',category_name='گوشی موبایل',max_price_toman='30000000',battery_requirement={'status':'unspecified','minimum_mah':None},review_topics=[],pending_requirements=[{'key':'سیستم عامل','source_text':'اندروید نباشد','status':'unsupported'}])
        result=self.post(fixtures.body('بودجه را بیست میلیون کن',context_need_state=need))
        self.assertEqual(result['question_code'],'unsupported_filter')
        self.assertIn('سیستم عامل',[r['key'] for r in result['need_state']['pending_requirements']])
        self.assertEqual(result['max_price_toman'],'20000000')

    def test_nearest_is_not_a_literal_word_in_the_product_topic(self):
        self.response=fixtures.completion(fixtures.proposal(query='گوشی'))
        result=self.post(fixtures.body('گوشی اندرویدی نزدیک من تا بیست میلیون تومان می‌خواهم'))
        self.assertEqual(result['question_code'],'location')
        self.assertEqual(result['need_state']['topic_query'],'گوشی اندروید')
        self.assertEqual(result['need_state']['offer_sort'],'nearest')
        self.assertEqual(result['max_price_toman'],'20000000')

    def test_added_os_request_respects_the_pending_requirement_bound(self):
        self.response=fixtures.completion(fixtures.proposal(query='گوشی'))
        pending=[{'key':key,'source_text':'درخواست آزمایشی '+key,'status':'unsupported'} for key in ['رنگ','سایز','اندازه','جنس','حافظه','رم','وزن','توان']]
        need=fixtures.phone_battery_state(pending_requirements=pending,battery_requirement={'status':'unspecified','minimum_mah':None},review_topics=[])
        result=self.post(fixtures.body('اندروید نمی‌خواهم',context_need_state=need))
        self.assertEqual(result['question_code'],'requirement_limit')
        self.assertEqual(result['need_state']['pending_requirements'],pending)
