"""Source-backed nighttime shopping decisions, with synthetic shops and no network."""
from contextlib import closing
import json
import sqlite3
import unittest
import test_api


class VisitDecisionTests(unittest.TestCase):
    setUp = test_api.CatalogueApiTests.setUp

    def seed(self):
        closed = json.dumps({day:{'status':'declared','shifts':[{'start_time':'09:00','end_time':'18:00'}]} for day in ('mon','tue','wed','thu','fri','sat','sun')})
        opened = json.dumps({day:{'status':'declared','shifts':[{'start_time':'22:00','end_time':'02:00'}]} for day in ('mon','tue','wed','thu','fri','sat','sun')})
        with closing(sqlite3.connect(self.database)) as db:
            with db:
                db.execute('UPDATE shops SET weekly_hours=? WHERE shop_id IN (?,?)',(closed,'shop_one','shop_near'))
                db.execute('UPDATE shops SET weekly_hours=?,lat=35.736,lon=51.4 WHERE shop_id=?',(opened,'shop_far'))
                db.execute('UPDATE shops SET category_names=?,address=?,lat=35.709,lon=51.4 WHERE shop_id=?',
                           (json.dumps(['گوشی موبایل']), 'خیابان آزمایشی، پاساژ آرمان، طبقه ۲، واحد ۱۰','shop_category_only'))

    def visit(self,**changes):
        return self.client.post('/api/local/visit-insights',json={'product_id':'product_two','lat':35.7,'lon':51.4,'nearby_km':2,'search_km':15,'local_time':'23:30',**changes})

    def test_closed_nearby_open_farther_and_nearer_market_are_distinct(self):
        self.seed()
        response=self.visit()
        self.assertEqual(response.status_code,200,response.text)
        value=response.json()
        self.assertEqual(value['time_source'],'selected_time')
        self.assertIn('23:30',value['evaluated_at'])
        self.assertEqual(value['nearby']['declared_open'],0)
        self.assertEqual(value['nearby']['unknown'],0)
        self.assertEqual(value['nearby']['shops'],value['nearby']['declared_closed'])
        opened=value['open_offers']['items']
        self.assertEqual([o['offer_id'] for o in opened],['offer_far'])
        self.assertGreater(opened[0]['direct_distance_meters'],2000)
        self.assertLess(opened[0]['direct_distance_meters'],5000)
        self.assertEqual(opened[0]['inventory_status'],'unconfirmed')
        market=value['markets'][0]
        self.assertEqual(market['name'],'پاساژ آرمان')
        self.assertLess(market['direct_distance_meters'],2000)
        self.assertEqual(market['inventory_status'],'unknown')
        self.assertEqual(market['opening_status'],'unknown')
        self.assertEqual(market['evidence'],'recorded_shop_address')

    def test_unknown_hours_never_become_closed_and_budget_is_preserved(self):
        self.seed()
        with closing(sqlite3.connect(self.database)) as db:
            with db:db.execute("UPDATE shops SET weekly_hours='{}' WHERE shop_id='shop_near'")
        result=self.visit(max_price_toman='100000').json()
        self.assertEqual(result['open_offers']['items'],[])
        result=self.visit().json()
        self.assertEqual(result['nearby']['unknown'],1)
        self.assertNotEqual(result['nearby']['shops'],result['nearby']['declared_closed'])

    def test_scope_validation_and_missing_product(self):
        for changes in ({'local_time':'25:30'},{'search_km':1},{'lat':91},{'max_price_toman':'9223372036854775808'},{'min_price_toman':'100','max_price_toman':'99'}):
            with self.subTest(changes=changes):self.assertEqual(self.visit(**changes).status_code,422)
        self.assertEqual(self.visit(product_id='missing').status_code,404)

    def test_multiple_offers_per_shop_are_counted_as_one_shop(self):
        self.seed()
        value=self.visit().json()
        self.assertEqual(value['nearby']['shops'],2)


    def test_selected_visit_clock_is_shared_by_offer_cards_prepare_and_alternatives(self):
        self.seed()
        params={'user_lat':35.7,'user_lon':51.4,'visit_time':'23:30','open_now_only':True,'sort_by':'nearest'}
        response=self.client.get('/api/products/product_two/offers',params=params)
        self.assertEqual(response.status_code,200,response.text)
        page=response.json()
        self.assertIn('23:30',page['hours_evaluated_at'])
        self.assertEqual([o['offer_id'] for o in page['items']],['offer_far'])
        selection={'product_id':'product_two','offer_id':'offer_far','shop_id':'shop_far','visit_time':'23:30'}
        prepared=self.client.post('/api/followups/prepare',json=selection).json()
        self.assertIn('23:30',prepared['hours_evaluated_at'])
        self.assertEqual(prepared['selected_offer']['opening_hours']['status'],'declared_open')
        selection.update(offer_id='offer_near_1',shop_id='shop_near',outcome='closed',outcome_source='user_report',open_now_only=True)
        alternatives=self.client.post('/api/followups/alternatives',json=selection)
        self.assertEqual(alternatives.status_code,200,alternatives.text)
        page=alternatives.json()['alternatives']
        self.assertIn('23:30',page['hours_evaluated_at'])
        self.assertEqual([o['offer_id'] for o in page['items']],['offer_far'])
        daytime=self.client.get('/api/products/product_two/offers',params={**params,'visit_time':'12:00'}).json()
        self.assertNotIn('offer_far',[o['offer_id'] for o in daytime['items']])

    def test_invalid_visit_time_rejected_for_every_followup_boundary(self):
        for value in ('25:00','12:60','1:30','tomorrow'):
            with self.subTest(value=value):
                self.assertEqual(self.client.get('/api/products/product_two/offers',params={'visit_time':value}).status_code,422)
                selection={'product_id':'product_two','offer_id':'offer_far','shop_id':'shop_far','visit_time':value}
                self.assertEqual(self.client.post('/api/followups/prepare',json=selection).status_code,422)
                self.assertEqual(self.client.post('/api/followups/alternatives',json={**selection,'outcome':'closed','outcome_source':'user_report'}).status_code,422)

if __name__=='__main__':unittest.main()
