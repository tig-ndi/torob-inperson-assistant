"""Judging regressions: source data and mocked model transport, no paid calls."""
import json
from pathlib import Path
import unittest
import sqlite3
from contextlib import closing
from fastapi.testclient import TestClient
from apps.api.catalogue import Catalogue
from apps.api.intent import multiple_topic_heads,product_span,query_choices,AssistantRequest
from apps.api.shopping_intent import matches_product_kind
from apps.api.main import create_app
import test_assistant
import test_api

SNAPSHOT=Path(__file__).resolve().parents[1]/'.local/catalogue.sqlite3'

@unittest.skipUnless(SNAPSHOT.exists(),'local snapshot not present')
class JudgingRegressions(unittest.TestCase):
    def setUp(self):
        # Borrow the transport fixture only; do not inherit/rerun its test suite.
        test_assistant.SnapshotAssistantApiTests.setUp(self)
        self.catalogue=Catalogue(SNAPSHOT)

    def turn(self,text,state=None):
        return test_assistant.SnapshotAssistantApiTests.post_turn(self,text,state,
                test_assistant.proposal(action='clarify',query=None,question='product_kind'))

    def test_mother_phone_need_and_followup_do_not_repeat_product_question(self):
        text='یک گوشی برای مادرم می‌خواهم، بودجه دو میلیون تومان است. دکمه‌های درشت و صدای بلند مهم است؛ مدل خاصی بلد نیستم.'
        first=self.turn(text)
        self.assertEqual(first['status'],'results',first)
        self.assertEqual(first['need_state']['max_price_toman'],'2000000')
        self.assertTrue(first['products']['items'])
        for item in first['products']['items']:
            self.assertTrue(matches_product_kind('گوشی دکمه ای',item['category_name'],item['persian_title'],json.dumps(item['specs'])))
        second=self.turn('ویژگی‌های دکمه و صدا را فعلاً کنار بگذار؛ فقط گوشی دکمه‌ای تا دو میلیون تومان پیدا کن.',first['need_state'])
        self.assertEqual(second['status'],'results',second)
        self.assertEqual(len(self.calls),2)
        self.assertTrue(multiple_topic_heads('گوشی و شارژر می‌خواهم',self.catalogue.category_names(),self.catalogue.identity_words()))

    def test_constraint_control_words_never_override_the_active_product(self):
        for text,state in [
            ('سایز را فعلا فیلتر نکن، بودجه همان سه میلیون تومان بماند.',{'version':1,'topic_query':'کفش زنانه','max_price_toman':'3000000','pending_requirements':[{'key':'سایز','source_text':'سایز ۳۸','status':'unsupported'}]}),
            ('حداقل ظرفیت باتری را بردار، بودجه را حفظ کن.',test_assistant.phone_battery_state(max_price_toman='10000000')),
        ]:
            with self.subTest(text=text):
                result=self.turn(text,state)
                self.assertEqual(result['query'],state['topic_query'])
                self.assertEqual(result['status'],'results',result)
                self.assertEqual(result['need_state']['pending_requirements'],[])
                self.assertEqual(result['max_price_toman'],state['max_price_toman'])
                if 'باتری' in text:self.assertEqual(result['battery_requirement']['status'],'no_minimum')

    def test_refused_phone_does_not_displace_the_requested_shoe(self):
        result=self.turn('گوشی نمی‌خواهم؛ کفش زنانه می‌خواهم تا سه میلیون تومان.')
        self.assertEqual(result['status'],'results',result)
        self.assertIn('کفش',result['query'])
        self.assertNotIn('گوشی',result['query'])

    def test_walk_shoe_results_exclude_accessories_and_phone_explanations(self):
        # The provider may correctly propose a search here; the repository still
        # owns product-family exclusions and must not return shoelaces.
        self.response=test_assistant.completion(test_assistant.proposal(query='کفش'))
        request=test_assistant.body('برای پیاده‌روی روزانه کفش مناسب می‌خواهم؛ بودجه سه میلیون تومان است. مدل نمی‌شناسم.')
        response=self.client.post('/api/assistant/turn',json=request)
        self.assertEqual(response.status_code,200,response.text)
        result=response.json()
        self.assertEqual(result['status'],'results',result)
        self.assertTrue(result['products']['items'])
        for p in result['products']['items']:
            self.assertNotRegex(p['category_name'],'بند|واکس|هولدر|کاور|جاکفشی')
        self.assertNotIn('دوربین',str(result['explanation']['limitations']))
        self.assertNotIn('باتری گوشی',str(result['explanation']['limitations']))
        self.assertIn('مردانه، زنانه یا کودک',result['explanation']['summary'])
        self.assertNotIn('کمترین قیمت ثبت',result['explanation']['summary'])

    def test_background_duration_does_not_displace_the_requested_product(self):
        for text,topic in [
            ('هر روز یک ساعت پیاده‌روی دارم؛ تا سه میلیون تومان کفش می‌خواهم، مدل نمی‌شناسم. گزینهٔ مناسب و علتش را بگو.','کفش'),
            ('روزانه ۴۵ دقیقه راه رفتن دارم؛ کفش می‌خوام تا سه میلیون تومان.','کفش'),
            ('روزانه دو ساعت مطالعه می‌کنم؛ هدفون می‌خواهم تا سه میلیون تومان.','هدفون'),
            ('یک ساعت هوشمند می‌خواهم تا سه میلیون تومان.','ساعت هوشمند'),
            ('ساعت یازده و نیم شب است؛ گوشی می‌خواهم.','گوشی'),
            ('نیم ساعت وقت دارم؛ شارژر موبایل می‌خواهم.','شارژر موبایل'),
        ]:
            with self.subTest(text=text):
                req=AssistantRequest.model_validate(test_assistant.body(text))
                self.assertTrue(any(topic in choice for choice in query_choices(req)),query_choices(req))
                self.assertIn(topic,product_span(text,self.catalogue.category_names(),self.catalogue.identity_words()))
                result=self.turn(text)
                self.assertNotEqual(result['question_code'],'product_kind',result)

    def test_destination_search_covers_more_than_first_twelve_models(self):
        result=self.client.post('/api/local/destinations',json={'query':'شارژر موبایل','lat':35.7,'lon':51.4,'search_km':15,'local_time':'23:30'})
        self.assertEqual(result.status_code,200,result.text)
        data=result.json()
        self.assertGreater(data['matched_models'],12)
        self.assertEqual(data['coverage'],'all_matching_offers_in_radius')
        for product_id in data['product_ids']:
            self.assertEqual(self.catalogue.detail(product_id)['product']['category_name'],'شارژر گوشی')

    def test_destination_search_respects_budget_and_payment(self):
        for extra in [{'max_price_toman':'0'},{'payment_provider':'kalabarg'}]:
            data=self.client.post('/api/local/destinations',json={'query':'شارژر موبایل','lat':35.7,'lon':51.4,**extra}).json()
            self.assertEqual(data['product_ids'],[])
            self.assertEqual(data['matched_models'],0)


class DestinationArrivalPriority(unittest.TestCase):
    setUp=test_api.CatalogueApiTests.setUp
    def test_farther_shop_with_time_to_buy_beats_near_shop_closing_on_arrival(self):
        days=('mon','tue','wed','thu','fri','sat','sun')
        closing=json.dumps({d:{'status':'declared','shifts':[{'start_time':'10:00','end_time':'23:59'}]} for d in days})
        always=json.dumps({d:{'status':'declared','shifts':[{'start_time':'00:00','end_time':'23:59'}]} for d in days})
        with closing_connection(self.database) as db:
            db.execute('UPDATE shops SET weekly_hours=? WHERE shop_id=?',(closing,'shop_near'))
            db.execute('UPDATE shops SET weekly_hours=? WHERE shop_id=?',(always,'shop_far'))
        response=self.client.post('/api/local/destinations',json={'query':'گوشی','lat':35.7,'lon':51.4,'search_km':40,'local_time':'23:30'})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['selections'][0]['shop_id'],'shop_far')


from contextlib import contextmanager
@contextmanager
def closing_connection(path):
    with closing(sqlite3.connect(path)) as db,db:yield db
