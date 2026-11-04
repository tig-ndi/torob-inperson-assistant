"""Exercise normal shopping utterances through the actual host and source filters."""
import json
import sqlite3
import unittest
from contextlib import closing
from dataclasses import replace
import test_assistant as fixtures
from apps.api.intent import AssistantRequest, query_choices, explicit_budget
from apps.api.source_filters import recorded_values, matches_source_filters
from tools.prepare_data import normalize_text


class AdaptiveShoppingTests(unittest.TestCase):
    def setUp(self):
        fixtures.AssistantApiTests.setUp(self)
        self.service.settings=replace(self.settings,attempt_limit=20)

    def post(self,text,**context):
        self.response=fixtures.completion(fixtures.proposal(query=query_choices(AssistantRequest.model_validate(fixtures.body(text,**context)))[0] if query_choices(AssistantRequest.model_validate(fixtures.body(text,**context))) else 'گوشی'))
        payload=fixtures.body(text,**context)
        if payload.get('context_need_state'):payload.pop('max_price_toman',None)
        response=self.agent_client.post('/api/assistant/turn',json=payload)
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    def add(self,identity,title,category,specs):
        with closing(sqlite3.connect(self.database)) as db:
            db.execute('INSERT INTO products(product_id,persian_title,category_name,specs,image_urls) VALUES(?,?,?,?,?)',(identity,title,category,json.dumps(specs,ensure_ascii=False),'[]'))
            db.execute('INSERT INTO product_search VALUES(?,?)',(identity,normalize_text(title+' '+category)))
            db.execute('INSERT INTO offers(offer_id,product_id,shop_id,price_toman) VALUES(?,?,?,?)',('offer_'+identity,identity,'shop_one',1000000))
            db.commit()

    def test_camera_and_battery_preferences_remain_a_phone(self):
        for text in ['تا بیست میلیون تومان، اندرویدی باشد و دوربین خوب برای عکس گرفتن از بچه‌ام داشته باشد.','دوام باتری از دوربین مهم‌تر است.']:
            with self.subTest(text=text):
                result=self.post(text,context_query='گوشی',context_category='گوشی موبایل')
                self.assertTrue(result['need_state']['topic_query'].startswith('گوشی'))
                self.assertEqual(result['need_state']['category_name'],'گوشی موبایل')

    def test_shoe_use_case_never_becomes_the_query(self):
        result=self.post('برای مادرم که پا درد دارد کفش زنانه تا سه میلیون تومان می‌خواهم، مدل نمی‌شناسم.')
        self.assertEqual(result['query'],'کفش زنانه')
        self.assertEqual(result['max_price_toman'],'3000000')

    def test_unitless_scaled_budget_and_lightweight_request_are_preserved(self):
        text='یک گوشی زیر بیست میلیون می‌خواهم که سبک باشد و باتری خوبی داشته باشد.'
        self.assertEqual(explicit_budget(text),'20000000')
        result=self.post(text)
        self.assertEqual(result['need_state']['max_price_toman'],'20000000')
        self.assertIn('وزن',[p['key'] for p in result['need_state']['pending_requirements']])

    def test_accessory_target_reply_keeps_charger_and_asks_connection(self):
        result=self.post('برای گوشی سامسونگ A54 می‌خواهم.',context_query='شارژر موبایل',context_category='شارژر گوشی')
        self.assertEqual(result['query'],'شارژر موبایل')
        self.assertEqual(result['question_code'],'connector')
        self.assertIsNone(result['products'])

    def test_recorded_colour_and_size_are_conjunctive_and_survive_budget_edits(self):
        self.add('white38','کفش زنانه مدل سپید','کفش طبی زنانه',[{'key':'رنگ','value':'سفید'},{'key':'سایز','value':'38, 39'}])
        self.add('black38','کفش زنانه مدل تیره','کفش طبی زنانه',[{'key':'رنگ','value':'مشکی'},{'key':'سایز','value':'38'}])
        self.add('white40','کفش زنانه مدل روشن','کفش طبی زنانه',[{'key':'رنگ','value':'سفید'},{'key':'سایز','value':'40'}])
        first=self.post('کفش زنانه رنگ سفید سایز ۳۸ تا سه میلیون تومان می‌خواهم')
        self.assertEqual(first['status'],'results')
        self.assertEqual(first['need_state']['source_filters'],{'colour':'سفید','size':'38','connector':None})
        self.assertEqual([p['product_id'] for p in first['products']['items']],['white38'])
        second=self.post('بودجه را دو میلیون کن',context_need_state=first['need_state'])
        self.assertEqual([p['product_id'] for p in second['products']['items']],['white38'])
        self.assertEqual(second['need_state']['source_filters'],first['need_state']['source_filters'])
        third=self.post('رنگ را حذف کن',context_need_state=second['need_state'])
        self.assertIsNone(third['need_state']['source_filters']['colour'])
        self.assertEqual(third['need_state']['source_filters']['size'],'38')
        self.assertEqual({p['product_id'] for p in third['products']['items']},{'white38','black38'})

    def test_charger_output_must_match_explicit_connector(self):
        self.add('typec','شارژر گوشی مدل C','شارژر گوشی',[{'key':'نوع درگاه خروجی','value':'USB Type-C'}])
        self.add('lightning','شارژر آیفون مدل L','شارژر گوشی',[{'key':'نوع درگاه خروجی','value':'Lightning'}])
        self.add('inputonly','شارژر مدل I','شارژر گوشی',[{'key':'نوع درگاه ورودی','value':'USB Type-C'}])
        result=self.post('برای گوشی سامسونگ A54 می‌خواهم، تایپ سی باشد.',context_query='شارژر موبایل',context_category='شارژر گوشی')
        self.assertEqual(result['query'],'شارژر موبایل')
        self.assertEqual([p['product_id'] for p in result['products']['items']],['typec'])
        self.assertEqual(result['need_state']['source_filters']['connector'],'usb-c')

    def test_new_purchase_clears_recorded_variant(self):
        need=fixtures.phone_battery_state(topic_query='کفش',category_name=None,source_filters={'colour':'سفید','size':'38','connector':None},battery_requirement={'status':'unspecified','minimum_mah':None})
        result=self.post('حالا گوشی می‌خواهم',context_need_state=need)
        self.assertTrue(all(v is None for v in result['need_state']['source_filters'].values()))

    def test_source_values_do_not_read_ram_as_size_or_charger_input_as_output(self):
        self.assertEqual(recorded_values([{'key':'رم','value':'38 گیگابایت'}],'size'),set())
        self.assertEqual(recorded_values([{'key':'سایز','value':'37 تا 40'}],'size'),{'37','38','39','40'})
        self.assertFalse(matches_source_filters([{'key':'رنگ','value':'مشکی'}],{'colour':'سفید'}))

    def test_better_recorded_resolution_beats_repeated_camera_descriptions(self):
        self.add('lowcamera','گوشی دوربین آزمایشی کم','گوشی موبایل',[{'key':'رزولوشن دوربین اصلی','value':'5 مگاپیکسل'},{'key':'مشخصات دوربین اصلی','value':'فوکوس و فلش و تشخیص چهره'}])
        self.add('highcamera','گوشی دوربین آزمایشی بیشتر','گوشی موبایل',[{'key':'رزولوشن دوربین اصلی','value':'48 مگاپیکسل'}])
        result=self.post('گوشی برای عکاسی تا سه میلیون تومان می‌خواهم')
        self.assertEqual(result['explanation']['recommended_product_id'],'highcamera')
        self.assertIn('کیفیت عکس',result['explanation']['summary'])

    def test_reference_filter_never_substitutes_another_model_with_the_requested_colour(self):
        self.add('selected','کفش زنانه مدل اول','کفش طبی زنانه',[{'key':'رنگ','value':'مشکی'}])
        self.add('other','کفش زنانه مدل دوم','کفش طبی زنانه',[{'key':'رنگ','value':'سفید'}])
        result=self.post('همون اولی سفیدش رو میخوام',context_query='کفش زنانه',reference_product_id='selected')
        self.assertEqual(result['need_state']['reference_product_id'],'selected')
        self.assertEqual(result['need_state']['pending_requirements'],[])
        self.assertEqual(result['products']['items'],[])
        self.assertIn('همان شرط یا مدل',result['explanation']['summary'])

    def test_application_of_implicit_colour_does_not_leave_a_phantom_pending_requirement(self):
        self.add('white','کفش زنانه مدل سفید','کفش طبی زنانه',[{'key':'رنگ','value':'سفید'}])
        result=self.post('همون اولی سفیدش رو میخوام',context_query='کفش زنانه')
        self.assertEqual(result['status'],'results')
        self.assertEqual(result['need_state']['pending_requirements'],[])
        self.assertEqual([p['product_id'] for p in result['products']['items']],['white'])
        waived=self.post('بدون این شرط ادامه بده، بودجه همان باشد.',context_need_state=result['need_state'])
        self.assertIsNone(waived['need_state']['source_filters']['colour'])

    def test_removing_pending_weight_does_not_waive_applied_colour(self):
        self.add('white','گوشی آزمایشی سفید','گوشی موبایل',[{'key':'رنگ','value':'سفید'}])
        need=fixtures.phone_battery_state(source_filters={'colour':'سفید','size':None,'connector':None},pending_requirements=[{'key':'وزن','source_text':'سبک باشد','status':'unsupported'}],battery_requirement={'status':'unspecified','minimum_mah':None})
        result=self.post('بدون این شرط',context_need_state=need)
        self.assertEqual(result['need_state']['source_filters']['colour'],'سفید')
        self.assertEqual(result['need_state']['pending_requirements'],[])

    def test_followup_comparison_keeps_shoe_topic_and_budget(self):
        result=self.post('کدامشان برای یک ساعت پیاده‌روی روزانه مناسب‌تر است؟',context_query='کفش زنانه',max_price_toman='3000000')
        self.assertEqual(result['query'],'کفش زنانه')
        self.assertEqual(result['max_price_toman'],'3000000')
        self.assertIsNone(result['question'])

    def test_connector_reply_after_device_question_keeps_the_accessory(self):
        self.add('typec','شارژر گوشی مدل C','شارژر گوشی',[{'key':'نوع درگاه خروجی','value':'USB Type-C'}])
        first=self.post('شارژر برای گوشی سامسونگ A54 می‌خواهم.')
        self.assertEqual(first['question_code'],'connector')
        second=self.post('درگاه تایپ سی باشد.',context_need_state=first['need_state'])
        self.assertEqual(second['category_name'],'شارژر گوشی')
        self.assertEqual([p['product_id'] for p in second['products']['items']],['typec'])

    def test_recorded_variant_applies_to_direct_search_and_visit_destinations(self):
        self.add('white38','کفش زنانه مدل روشن','کفش طبی زنانه',[{'key':'رنگ','value':'سفید'},{'key':'سایز','value':'38'}])
        self.add('black38','کفش زنانه مدل تیره','کفش طبی زنانه',[{'key':'رنگ','value':'مشکی'},{'key':'سایز','value':'38'}])
        response=self.agent_client.get('/api/products',params={'q':'کفش زنانه','colour':'سفید','size':'38'})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual([p['product_id'] for p in response.json()['items']],['white38'])
        # Coverage must also exclude other variants even when all shops are closed.
        result=self.agent_client.post('/api/local/destinations',json={'query':'کفش زنانه','lat':35.7,'lon':51.4,'source_filters':{'colour':'سفید','size':'38','connector':None}})
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['matched_models'],1)

    def test_ambiguous_waiver_of_two_applied_filters_asks_which_one(self):
        self.add('white38','کفش زنانه مدل روشن','کفش طبی زنانه',[{'key':'رنگ','value':'سفید'},{'key':'سایز','value':'38'}])
        need=fixtures.phone_battery_state(topic_query='کفش زنانه',category_name=None,source_filters={'colour':'سفید','size':'38','connector':None},battery_requirement={'status':'unspecified','minimum_mah':None})
        result=self.post('بدون این شرط',context_need_state=need)
        self.assertEqual(result['question_code'],'requirement_choice')
        self.assertEqual(result['need_state']['source_filters'],need['source_filters'])
        self.assertIsNone(result['products'])

    def test_negating_an_applied_colour_never_searches_the_rejected_colour(self):
        self.add('white','گوشی سفید آزمایشی','گوشی موبایل',[{'key':'رنگ','value':'سفید'}])
        need=fixtures.phone_battery_state(source_filters={'colour':'سفید','size':None,'connector':None},battery_requirement={'status':'unspecified','minimum_mah':None})
        result=self.post('رنگ سفید نباشد',context_need_state=need)
        self.assertIsNone(result['need_state']['source_filters']['colour'])
        self.assertEqual(result['question_code'],'unsupported_filter')
        self.assertIn('رنگ',[item['key'] for item in result['need_state']['pending_requirements']])
        self.assertIsNone(result['products'])

    def test_size_range_is_not_silently_reduced_to_its_first_number(self):
        from apps.api.source_filters import requested_filters
        self.assertNotIn('size',requested_filters('سایز ۳۸ تا ۴۰'))
        self.assertEqual(requested_filters('سایز را ۳۸ کن')['size'],'38')

    def test_smartphone_kind_uses_recorded_evidence_and_survives_budget_change(self):
        self.add('smart_android','گوشی مدل هوشمند آلفا','گوشی موبایل',[{'key':'سیستم عامل','value':'Android 14'}])
        self.add('smart_ios','گوشی مدل هوشمند بتا','گوشی موبایل',[{'key':'سیستم عامل','value':'iOS 18'}])
        self.add('basic_phone','گوشی ساده مدل گاما','گوشی موبایل',[{'key':'نوع گوشی','value':'ساده'}])
        first=self.post('گوشی هوشمند می‌خواهم؛ خودت نزدیک‌ترین مقصد را انتخاب کن',user_lat=35.7,user_lon=51.4)
        self.assertEqual(first['status'],'results')
        self.assertIn('هوشمند',first['query'])
        self.assertIn('smart_android',[p['product_id'] for p in first['products']['items']])
        self.assertIn('smart_ios',[p['product_id'] for p in first['products']['items']])
        self.assertNotIn('basic_phone',[p['product_id'] for p in first['products']['items']])
        changed=self.post('تا بیست میلیون تومان',context_need_state=first['need_state'],user_lat=35.7,user_lon=51.4)
        self.assertIn('هوشمند',changed['query'])

    def test_excluded_shop_never_returns_as_a_visit_destination(self):
        always=json.dumps({day:{'status':'declared','shifts':[{'start_time':'00:00','end_time':'23:59'}]} for day in ('mon','tue','wed','thu','fri','sat','sun')})
        with closing(sqlite3.connect(self.database)) as db,db:
            db.execute('UPDATE shops SET weekly_hours=? WHERE shop_id=?',(always,'shop_one'))
        original=self.agent_client.post('/api/local/destinations',json={'query':'گوشی','lat':35.7,'lon':51.4,'local_time':'12:00'}).json()
        self.assertTrue(any(s['shop_id']=='shop_one' for s in original['selections']))
        base={'query':'گوشی','local_time':'12:00','lat':35.7,'lon':51.4,'exclude_shop_ids':['shop_one']}
        response=self.agent_client.post('/api/local/destinations',json=base)
        self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(all(s['shop_id']!='shop_one' for s in response.json()['selections']))
        response=self.agent_client.post('/api/local/destinations',json={**base,'exclude_shop_ids':['x'*121]})
        self.assertEqual(response.status_code,422)


    def test_a_delegation_command_keeps_the_topic_and_budget_without_hiding_new_purchases(self):
        state=fixtures.phone_battery_state(topic_query='گوشی هوشمند',max_price_toman='20000000',battery_requirement={'status':'unspecified','minimum_mah':None})
        result=self.post('خودت نزدیک ترین مقصد قابل مراجعه را انتخاب کن',context_need_state=state)
        self.assertEqual(result['query'],'گوشی هوشمند')
        self.assertEqual(result['need_state']['max_price_toman'],'20000000')
        from apps.api.purchase_context import refines_purchase
        self.assertFalse(refines_purchase('خودت یک کفش انتخاب کن','گوشی هوشمند','گوشی موبایل'))
        self.assertFalse(refines_purchase('خودت یک کلاه انتخاب کن','گوشی هوشمند','گوشی موبایل'))


    def test_action_verbs_do_not_become_shoe_specs_or_new_product_names(self):
        result=self.post('خودت یک کفش زنانه تا سه میلیون تومان انتخاب کن',context_query='گوشی هوشمند',context_category='گوشی موبایل')
        self.assertEqual(result['query'],'کفش زنانه')
        self.assertEqual(result['max_price_toman'],'3000000')
