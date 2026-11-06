"""Reproductions of the eight judged failures, with synthetic source witnesses."""
import unittest
from datetime import datetime
import test_assistant as fixtures
import test_shopping_context as context_fixtures
from dataclasses import replace
from apps.api.shopping_intent import matches_product_kind
from apps.api.purchase_preferences import recorded_requirements_match, minimum_capacity
from apps.api.visit_time import selected_instant
from apps.api.hours import TEHRAN
from apps.api.visit import VisitRequest
from apps.api.journey import ArrivalRequest
from apps.api.models import FollowupPrepareRequest
from pydantic import ValidationError
from apps.api.model_comparison import comparison_queries


class JudgingRegressions(unittest.TestCase):
    def setUp(self):
        context_fixtures.ShoppingContextTests.setUp(self)
        self.service.settings=replace(self.settings,attempt_limit=20)
    add_product=context_fixtures.ShoppingContextTests.add_product
    post=context_fixtures.ShoppingContextTests.post

    def turn(self,text,query,state=None,question=None):
        self.response=fixtures.completion(fixtures.proposal(query=query,action='clarify' if question else 'search',question=question))
        return self.post(fixtures.body(text,**({'context_need_state':state} if state else {})))

    def test_whole_washer_and_fridge_never_retrieve_spare_parts(self):
        for head,category in [('ماشین لباسشویی','لوازم یدکی ماشین لباسشویی و ظرفشویی'),('یخچال','قطعات و لوازم جانبی یخچال و فریزر')]:
            with self.subTest(head=head):
                self.assertEqual(matches_product_kind(head,category,head+' قطعه','[]'),0)
                self.assertEqual(matches_product_kind(head,head,head+' اصلی','[]'),1)
        self.assertEqual(matches_product_kind('یخچال','کلید و سوئیچ','میکروسوئیچ کلید درب یخچال','[]'),0)
        self.assertEqual(matches_product_kind('یخچال','یخچال مسافرتی','یخدان مسافرتی کیش','[]'),0)
        self.add_product('whole_washer','ماشین لباسشویی مستقل','ماشین لباسشویی',[{'key':'ظرفیت دیگ','value':'9 کیلوگرم'}])
        self.add_product('washer_part','چپقی ماشین لباسشویی','لوازم یدکی ماشین لباسشویی و ظرفشویی')
        result=self.turn('ماشین لباسشویی برای خانواده پنج نفره کم مصرف و حداقل نه کیلو تا چهل میلیون تومان','ماشین لباسشویی')
        self.assertEqual(result['status'],'results',result)
        self.assertEqual([p['product_id'] for p in result['products']['items']],['whole_washer'])
        self.assertEqual(result['need_state']['minimum_capacity_kg'],9)

    def test_two_models_are_retrieved_separately_and_parts_excluded(self):
        self.assertEqual(comparison_queries('بین سامسونگ A54 و شیائومی Redmi10 برای عکاسی مقایسه کن'),['سامسونگ a54','شیائومی redmi10'])
        for model in ('A54','A34'):
            self.add_product(model,'گوشی سامسونگ '+model,'گوشی موبایل',model=model)
        self.add_product('shared_part','محافظ لنز سامسونگ A54 A34','محافظ صفحه نمایش گوشی')
        result=self.turn('بین سامسونگ A54 و A34 برای عکاسی تا بیست میلیون تومان مقایسه کن','سامسونگ a54 a34')
        self.assertEqual(result['status'],'results',result)
        self.assertEqual({p['product_id'] for p in result['products']['items']},{'A54','A34'})
        self.assertEqual(result['need_state']['comparison_queries'],['سامسونگ a54','سامسونگ a34'])
        self.assertIn('a54',result['explanation']['summary'])
        again=self.turn('بودجه را سی میلیون کن','گوشی',result['need_state'])
        self.assertEqual({p['product_id'] for p in again['products']['items']},{'A54','A34'})

    def test_unknown_exact_model_is_not_silently_broadened(self):
        self.add_product('known_samsung','گوشی سامسونگ A54','گوشی موبایل')
        result=self.turn('گوشی سامسونگ مدل QZX9999 میخوام','گوشی سامسونگ')
        self.assertIn('qzx9999',result['query'])
        self.assertEqual(result['status'],'no_evidence')
        self.assertEqual(matches_product_kind('گوشی سامسونگ','گوشی موبایل','گوشی یونیوا S25','[]','Univa','S25'),0)
        self.assertEqual(matches_product_kind('گوشی سامسونگ','گوشی موبایل','گوشی یونیوا S25','[]','سامسونگ','S25'),0)
        self.assertEqual(matches_product_kind('گوشی سامسونگ','گوشی موبایل','گوشی طرح سامسونگ S24','[]','سامسونگ','S24'),0)
        self.assertEqual(matches_product_kind('گوشی سامسونگ a54','گوشی موبایل','گوشی هوشمند','[]','سامسونگ','A54'),1)

    def test_preferences_survive_history_eviction_and_clear_on_switch(self):
        self.add_product('laptop','لپ تاپ برنامه نویسی','لپ تاپ و نوت بوک',[{'key':'وزن','value':'1 کیلوگرم'},{'key':'ظرفیت حافظه رم','value':'16 GB'}])
        first=self.turn('لپ تاپ سبک برای برنامه نویسی تا چهل میلیون تومان','لپ تاپ')
        self.assertEqual(first['need_state']['preferences'],['coding','lightweight'])
        state=first['need_state']
        for budget in ('چهل و پنج','سی','سی و پنج'):
            result=self.turn('بودجه را '+budget+' میلیون کن','لپ تاپ',state)
            self.assertEqual(result['need_state']['preferences'],['coding','lightweight'])
            self.assertIn('وزن',result['explanation']['summary'])
            state=result['need_state']
        removed=self.turn('سبک بودن مهم نیست','لپ تاپ',state)
        self.assertNotIn('lightweight',removed['need_state']['preferences'])
        switched=self.turn('گوشی میخوام','گوشی',state)
        self.assertEqual(switched['need_state']['preferences'],[])

    def test_cable_target_reply_preserves_cable_budget_and_connector(self):
        self.add_product('cable','کابل شارژ تایپ سی','کابل و مبدل',[{'key':'نوع رابط','value':'USB-C'}])
        self.add_product('bundle','شارژر برای گوشی','شارژر گوشی')
        first=self.turn('کابل برای گوشی تا پانصد هزار تومان','کابل')
        self.assertEqual(first['question_code'],'connector')
        self.assertEqual(first['need_state']['topic_query'],'کابل گوشی')
        second=self.turn('لایتنینگ نمیخوام؛ تایپ سی میخوام',first['need_state']['topic_query'],first['need_state'])
        self.assertEqual(second['need_state']['source_filters']['connector'],'usb-c')
        third=self.turn('برای گوشی سامسونگ A54 هست؛ خود گوشی نمیخوام',second['need_state']['topic_query'],second['need_state'])
        self.assertTrue(third['need_state']['topic_query'].startswith('کابل'),third)
        self.assertEqual(third['need_state']['source_filters']['connector'],'usb-c')
        self.assertEqual(third['max_price_toman'],'500000')

    def test_compound_shoe_and_anc_requests_do_not_get_generic_product_question(self):
        self.add_product('walking_shoe','کتانی زنانه پیاده روی','کفش ورزشی',[{'key':'سایز','value':'38'}])
        shoe=self.turn('کتونی زنانه سایز ۳۸ برای پیاده روی میخوام',None,question='product_kind')
        self.assertNotEqual(shoe['question_code'],'product_kind',shoe)
        self.assertTrue(shoe['products']['items'])
        self.add_product('anc','هدفون بی سیم','هدفون، هدست و هندزفری',[{'key':'حذف نویز','value':'ANC فعال'}])
        self.add_product('enc','هدفون فقط میکروفون','هدفون، هدست و هندزفری',[{'key':'حذف نویز','value':'ENC میکروفون'}])
        result=self.turn('هدفون میخوام فقط حذف نویز فعال ANC، نه ENC میکروفون','هدفون',question='product_kind')
        self.assertNotEqual(result['question_code'],'product_kind',result)
        self.assertEqual([p['product_id'] for p in result['products']['items']],['anc'])

    def test_source_requirements_fail_closed_on_missing_or_contradictory_values(self):
        self.assertEqual(minimum_capacity('حداقل نه کیلو'),9)
        for specs in ([],[{'key':'ظرفیت دیگ','value':'8 کیلوگرم'}],[{'key':'ظرفیت دیگ','value':'9 کیلوگرم'},{'key':'ظرفیت دیگ','value':'7 کیلوگرم'}]):
            self.assertEqual(recorded_requirements_match('ماشین لباسشویی',specs,minimum_kg=9),0)
        self.assertEqual(recorded_requirements_match('هدفون، هدست و هندزفری',[{'key':'حذف نویز','value':'ENC'}],require_anc=True),0)


class VisitCalendarTests(unittest.TestCase):
    def test_selected_day_applies_before_clock_and_weekday_rollover(self):
        friday=datetime(2026,11,6,22,30,tzinfo=TEHRAN)
        result=selected_instant(friday,'10:00','2026-11-07')
        self.assertEqual(result.isoformat(),'2026-11-07T10:00:00+03:30')
        self.assertEqual(result.weekday(),5)

    def test_all_visit_request_contracts_accept_a_day_and_reject_invalid_calendar(self):
        for model,extra in [(VisitRequest,dict(product_id='p',lat=35.7,lon=51.4)),(ArrivalRequest,dict(selections=[dict(product_id='p',offer_id='o',shop_id='s')])),(FollowupPrepareRequest,dict(product_id='p',offer_id='o',shop_id='s'))]:
            self.assertEqual(model(visit_date='2026-11-07',**extra).visit_date,'2026-11-07')
            with self.assertRaises(ValidationError):model(visit_date='2026-02-31',**extra)
