"""Local workflow integration tests; no seller or model network calls."""
from contextlib import closing
import json
import os
import sqlite3
import unittest
from unittest.mock import patch

from apps.api.assistant import AgentSettings, ENDPOINT
import test_api


class LocalWorkflowTests(unittest.TestCase):
    setUp = test_api.CatalogueApiTests.setUp

    def selection(self, **values):
        return {'product_id': 'product_two', 'offer_id': 'offer_near_1', 'shop_id': 'shop_near', **values}

    def test_report_exact_price_source_and_no_precise_position_persistence(self):
        payload = self.selection(source='simulated', outcome='price_changed', price_toman='733518940747298944', note='test', user_lat=35.71, user_lon=51.41)
        response = self.client.post('/api/local/followups', json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result['price_toman'], payload['price_toman'])
        self.assertFalse(result['seller_confirmation'])
        self.assertFalse(result['external_contact_attempted'])
        self.assertNotIn('user_lat', result)
        reports = self.client.get('/api/local/followups', params={'offer_id': 'offer_near_1'}).json()['items']
        self.assertEqual(reports, [result])
        original = self.client.post('/api/followups/prepare', json=self.selection()).json()
        self.assertEqual(original['selected_offer']['price_toman'], '200000')

    def test_report_rejects_mismatched_selection_and_invalid_money(self):
        for changes, status in [({'shop_id':'shop_far'},409), ({'price_toman':None},422), ({'price_toman':'9223372036854775808'},422), ({'source':'seller_verified'},422)]:
            payload=self.selection(source='simulated',outcome='price_changed',price_toman='1000')
            payload.update(changes)
            self.assertEqual(self.client.post('/api/local/followups',json=payload).status_code,status)

    def test_trip_round_trip_and_delete_keep_catalogue_unchanged(self):
        payload=self.selection(checklist=['check warranty'],alternatives=[{'product_id':'product_two','offer_id':'offer_far','shop_id':'shop_far','user_lat':35.7,'user_lon':51.4}],user_lat=35.7,user_lon=51.4)
        response=self.client.post('/api/local/trips',json=payload)
        self.assertEqual(response.status_code,200,response.text)
        trip=response.json()
        self.assertNotIn('user_lat',trip)
        self.assertNotIn('user_lat',trip['alternatives'][0])
        self.assertEqual(self.client.get('/api/local/trips').json()['items'],[trip])
        self.assertEqual(self.client.delete('/api/local/trips/'+trip['id']).status_code,204)
        self.assertEqual(self.client.get('/api/local/trips').json()['items'],[])
        self.assertEqual(self.client.delete('/api/local/trips/'+trip['id']).status_code,404)
        payload['alternatives']=[{'product_id':'product_one','offer_id':'offer_a','shop_id':'shop_one'}]
        self.assertEqual(self.client.post('/api/local/trips',json=payload).status_code,422)

    def test_filters_apply_before_pagination_keep_exact_money(self):
        page=self.client.get('/api/products/product_one/offers',params={'min_price_toman':'120001','limit':1}).json()
        self.assertEqual([o['offer_id'] for o in page['items']],['offer_b'])
        self.assertEqual(page['items'][0]['price_toman'],'733518940747298944')
        self.assertFalse(page['has_more'])
        self.assertEqual(self.client.get('/api/products/product_one/offers',params={'min_price_toman':'500','max_price_toman':'499'}).status_code,422)

    def test_payment_and_fast_delivery_require_actual_matching_terms(self):
        option={'provider_name':'ترب‌پی','channel':'in_person','min_price_toman':200000,'max_price_toman':220000,'category_names':['گوشی موبایل']}
        with closing(sqlite3.connect(self.database)) as db:
            db.execute('UPDATE shops SET payment_options=?,supports_fast_delivery=1 WHERE shop_id=?',(json.dumps([option]),'shop_near'))
            db.commit()
        page=self.client.get('/api/products/product_two/offers',params={'payment_provider':'torobpay','fast_delivery_only':True}).json()
        self.assertEqual([o['offer_id'] for o in page['items']],['offer_near_1'])
        self.assertTrue(page['items'][0]['shop']['supports_fast_delivery'])
        self.assertEqual(self.client.get('/api/products/product_two/offers',params={'payment_provider':'kalabarg'}).json()['items'],[])
        with closing(sqlite3.connect(self.database)) as db:
            option['channel']='unknown'
            db.execute('UPDATE shops SET payment_options=? WHERE shop_id=?',(json.dumps([option]),'shop_near'));db.commit()
        self.assertEqual(self.client.get('/api/products/product_two/offers',params={'payment_provider':'torobpay'}).json()['items'],[])

    def test_alternatives_preserve_new_filters_and_exclude_entire_shop(self):
        payload=self.selection(outcome='no_answer',outcome_source='simulated',min_price_toman='185000',max_price_toman='195000')
        response=self.client.post('/api/followups/alternatives',json=payload)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual([o['offer_id'] for o in response.json()['alternatives']['items']],['offer_no_coord'])

    def test_probable_shops_never_imply_product_inventory(self):
        with closing(sqlite3.connect(self.database)) as db:
            db.execute('UPDATE shops SET category_names=?,lat=35.7,lon=51.4 WHERE shop_id=?',(json.dumps(['گوشی']), 'shop_category_only'));db.commit()
        response=self.client.get('/api/local/probable-shops',params={'category':'گوشی','product_id':'product_one','lat':35.7,'lon':51.4,'radius':1})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['items'][0]['inventory_status'],'unknown')
        self.assertEqual(response.json()['items'][0]['shop_id'],'shop_category_only')

    def test_root_env_is_allowlisted_and_box_endpoint_unchanged(self):
        (self.root/'.env').write_text('BOXAPI_API_KEY=test-only\nTOROB_ASSISTANT_ENABLED=1\nTOROB_ASSISTANT_MODEL=gpt-5.6-luna\nTOROB_ASSISTANT_ATTEMPT_LIMIT=3\nARBITRARY_ENDPOINT=https://example.invalid\n',encoding='utf-8')
        with patch.dict(os.environ,{},clear=True):
            settings=AgentSettings.load(self.root)
        self.assertTrue(settings.enabled)
        self.assertEqual(settings.api_key,'test-only')
        self.assertEqual(settings.attempt_limit,3)
        self.assertEqual(ENDPOINT,'https://ai.boxapi.ir/ai/v1/chat/completions')


if __name__ == '__main__':
    unittest.main()
