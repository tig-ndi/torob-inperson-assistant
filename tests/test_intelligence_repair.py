"""Adversarial dialogue regressions with controlled providers and source facts."""
import unittest
from dataclasses import replace
import test_assistant as fixtures
import test_shopping_context as context
from apps.api.battery_intent import capacity_update
from apps.api.models import BatteryRequirement
from apps.api.purchase_context import refines_purchase
from apps.api.shopping_intent import matches_product_kind
from apps.api.source_filters import requested_filters, edited_filters, SourceFilters


class IntelligenceRepairTests(unittest.TestCase):
    def setUp(self):
        context.ShoppingContextTests.setUp(self)
        self.service.settings=replace(self.settings,attempt_limit=100)
    add_product=context.ShoppingContextTests.add_product
    post=context.ShoppingContextTests.post

    def turn(self,text,query,state=None,**kwargs):
        self.response=fixtures.completion(fixtures.proposal(query=query))
        return self.post(fixtures.body(text,**({'context_need_state':state} if state else {}),**kwargs))

    def state(self,topic='گوشی اندروید',**kwargs):
        return fixtures.phone_battery_state(topic_query=topic,battery_requirement={'status':'unspecified','minimum_mah':None},**kwargs)

    def test_modifier_does_not_become_product(self):
        cases=[('شارژر','تایپ سی است؛ شارژ سریع ۲۵ وات و PD لازم دارم.'),
               ('کابل گوشی','برای شارژ و انتقال داده می‌خواهم، نه فقط شارژ.'),
               ('کابل گوشی','مدل دو متری می‌خواهم؛ همان دستگاه و بودجه بماند.'),
               ('کابل گوشی','مدل یک متری می‌خواهم؛ همان دستگاه و بودجه بماند.'),
               ('هدفون','ENC میکروفون کافی نیست؛ ANC واقعی می‌خواهم.'),
               ('هدفون','حذف نویز فعال دیگر لازم نیست، فقط بی سیم و بودجه بماند.'),
               ('ماشین لباسشویی','اگر میزان مصرف انرژی در مشخصات نیست، نگو کم مصرف است.')]
        for topic,text in cases:
            with self.subTest(text=text):
                state=self.state(topic,category_name=None)
                result=self.turn(text,topic,state)
                self.assertEqual(result['need_state']['topic_query'],topic,result)
                self.assertEqual(result['max_price_toman'],state['max_price_toman'])

    def test_conditional_accessory_is_not_a_list(self):
        from apps.api.intent import multiple_topic_heads
        text='اگر فقط کابل همراهش تایپ سی بود ولی خود شارژر درگاه USB-A داشت پیشنهاد نده.'
        self.assertFalse(multiple_topic_heads(text,['شارژر گوشی','کابل و مبدل']))
        self.assertTrue(refines_purchase(text,'شارژر موبایل'))

    def test_capacity_stays_unresolved_when_weight_is_waived(self):
        first=self.turn('ظرفیت حداقل ۲۰۰۰۰ میلی‌آمپرساعت و وزن کم می‌خواهم.','پاوربانک',self.state('پاوربانک',category_name=None))
        self.assertIn('ظرفیت',[p['key'] for p in first['need_state']['pending_requirements']],first)
        second=self.turn('وزن مهم نیست ولی ظرفیت ۲۰۰۰۰ بماند.','پاوربانک',first['need_state'])
        self.assertIn('ظرفیت',[p['key'] for p in second['need_state']['pending_requirements']],second)
        self.assertNotIn('وزن',[p['key'] for p in second['need_state']['pending_requirements']])
        self.assertIsNone(second['products'])

    def test_compound_colour_edits_are_local_and_value_can_be_waived(self):
        self.assertEqual(requested_filters('مشکی نباشد، سفید می‌خواهم، اندروید باقی بماند.'),{'colour':'سفید'})
        first=edited_filters(SourceFilters(colour='مشکی',connector='usb-c'),'مشکی نباشد، سفید می‌خواهم',lambda _:True)
        self.assertEqual(first.colour,'سفید')
        second=edited_filters(first,'سفید مهم نیست؛ درگاه باقی بماند',lambda _:True)
        self.assertIsNone(second.colour)
        self.assertEqual(second.connector,'usb-c')

    def test_brand_exclusions_accumulate_through_budget_edit(self):
        for brand in ['سامسونگ','شیائومی','نوکیا']:
            self.add_product(brand,'گوشی '+brand,'گوشی موبایل')
        first=self.turn('گوشی غیرسامسونگ تا پنجاه میلیون تومان می‌خواهم.','گوشی غیرسامسونگ')
        second=self.turn('شیائومی هم نمی‌خواهم؛ بقیه برندها با همان بودجه.','گوشی غیرسامسونگ',first['need_state'])
        third=self.turn('بودجه را دوازده میلیون کن؛ هر دو برند همچنان حذف باشند.',second['query'],second['need_state'])
        for result in [second,third]:
            self.assertIn('غیرسامسونگ',result['query'],result)
            self.assertIn('غیرشیائومی',result['query'],result)
            self.assertIn('نوکیا',[p['product_id'] for p in result['products']['items']])
            self.assertFalse({'سامسونگ','شیائومی'} & {p['product_id'] for p in result['products']['items']})
        self.assertEqual(third['max_price_toman'],'12000000')

    def test_battery_answer_and_explicit_waiver(self):
        waiting=BatteryRequirement(status='awaiting_minimum')
        self.assertEqual(capacity_update('حداقل ۴۰۰۰ می‌خواهم، سقف ظرفیت مهم نیست.',waiting).minimum_mah,4000)
        current=BatteryRequirement(status='minimum',minimum_mah=5000)
        for text in ['حالا بدون حداقل باتری؛ اندروید بماند.','بدون حداقل ظرفیت باتری ادامه بده']:
            self.assertEqual(capacity_update(text,current).status,'no_minimum',text)
        self.assertTrue(refines_purchase('حداقل ۴۰۰۰ می‌خواهم، سقف ظرفیت مهم نیست.','گوشی'))

    def test_parts_never_substitute_for_whole_powerbank(self):
        title='باتری لیتیوم پلیمر پاور بانک ظرفیت 10000 میلی آمپر'
        self.assertEqual(matches_product_kind('پاور بانک','پاوربانک',title,'[]'),0)
        self.assertEqual(matches_product_kind('باتری پاور بانک','پاوربانک',title,'[]'),1)

    def test_same_budget_does_not_ask_again(self):
        state=self.state('گوشی',max_price_toman='20000000')
        result=self.turn('فقط مدل‌های غیرسامسونگ با همان بودجه را بررسی کن.','گوشی',state)
        self.assertNotEqual(result['question_code'],'budget',result)
        self.assertEqual(result['max_price_toman'],'20000000')
        self.assertIn('غیرسامسونگ',result['query'])

    def test_filler_cannot_pollute_explicit_topic(self):
        from apps.api.intent import product_span
        categories=['پاوربانک','کفش ورزشی','باربند خودرو']
        self.assertEqual(product_span('نه، منظورم پاوربانک بود تا دو میلیون تومان.',categories,set()),'پاوربانک')
        self.assertEqual(product_span('همان بودجه را نگه دار، ولی این بار کفش کتانی می‌خواهم.',categories,set()),'کفش کتانی')

    def test_status_questions_preserve_purchase_and_answer_truthfully(self):
        state=self.state()
        for text,answer in [('پس الان رزرو قطعی شد یا نه؟','رزرو قطعی'),('قیمت ثبت‌شده با قیمت پاسخ فروشنده یکی است؟','قیمت ثبت‌شده')]:
            result=self.turn(text,state['topic_query'],state)
            self.assertEqual(result['need_state']['topic_query'],state['topic_query'])
            self.assertIsNone(result['products'])
            self.assertIn(answer,result['question'])
            self.assertTrue(result['question'].startswith('نه'))

    def test_return_to_prior_purchase_recovers_supplied_history(self):
        history=[{'role':'user','content':'گوشی اندروید سفید با باتری حداقل ۵۰۰۰ میلی آمپر ساعت تا بیست میلیون تومان می‌خواهم.'},
                 {'role':'assistant','content':'شرایط گوشی ثبت شد.'},
                 {'role':'user','content':'به جای گوشی کفش زنانه سایز ۳۸ تا سه میلیون می‌خواهم.'},
                 {'role':'assistant','content':'کفش بررسی شد.'},
                 {'role':'user','content':'حالا برگردیم به همان گوشی؛ چه شرط‌هایی داشتم؟'}]
        self.add_product('white_phone','گوشی سفید','گوشی موبایل',[{'key':'رنگ','value':'سفید'}])
        self.response=fixtures.completion(fixtures.proposal(query='گوشی اندروید'))
        body=fixtures.body('unused',context_need_state=self.state('کفش',category_name=None,max_price_toman='3000000'))
        body['messages']=history
        result=self.post(body)
        self.assertEqual(result['max_price_toman'],'20000000',result)
        self.assertIn('اندروید',result['need_state']['topic_query'])
        self.assertEqual(result['need_state']['source_filters']['colour'],'سفید')
        self.assertEqual(result['need_state']['battery_requirement']['minimum_mah'],5000)

    def test_camera_evidence_precedes_nearest_window_limit(self):
        for i in range(14):
            self.add_product('weak'+str(i),'گوشی ساده '+str(i),'گوشی موبایل',[{'key':'دوربین اصلی','value':'0.3 مگاپیکسل'}])
        self.add_product('camera','گوشی عکاسی','گوشی موبایل',[{'key':'دوربین اصلی','value':'8 مگاپیکسل'}])
        result=self.turn('گوشی برای عکاسی تا بیست میلیون تومان می‌خواهم.','گوشی',user_lat=35.7,user_lon=51.4,context_offer_sort='nearest')
        self.assertIn('camera',[p['product_id'] for p in result['products']['items']],result)
        self.assertEqual(result['explanation']['recommended_product_id'],'camera',result)

    def test_ranked_pagination_keeps_initial_source_order_without_duplicates(self):
        for i in range(15):
            self.add_product('weak'+str(i),'گوشی ساده '+str(i),'گوشی موبایل',[{'key':'دوربین اصلی','value':'0.3 مگاپیکسل'}])
        self.add_product('better','گوشی دوربین','گوشی موبایل',[{'key':'دوربین اصلی','value':'8 مگاپیکسل'}])
        first=self.turn('گوشی برای عکاسی تا بیست میلیون تومان می‌خواهم.','گوشی',user_lat=35.7,user_lon=51.4,context_offer_sort='nearest')
        next_page=self.agent_client.get('/api/products',params={'q':first['query'],'limit':12,'offset':12,'user_lat':35.7,'user_lon':51.4,'sort_by':'nearest','ranking_context':'دوربین','max_price_toman':'20000000'}).json()
        ids={p['product_id'] for p in first['products']['items']}
        self.assertFalse(ids & {p['product_id'] for p in next_page['items']})
        self.assertIn('better',ids)

    def test_explicit_new_family_after_same_budget_does_not_inherit_phone_platform(self):
        text='با همان بودجه کفش کتانی می‌خواهم'
        self.assertFalse(refines_purchase(text,'گوشی اندروید','گوشی موبایل'))
        result=self.turn(text,'کفش کتانی',self.state(max_price_toman='20000000'))
        self.assertEqual(result['query'],'کفش کتانی',result)
        self.assertEqual(result['max_price_toman'],'20000000')
        self.assertNotIn('اندروید',result['need_state']['topic_query'])
