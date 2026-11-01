"""Road geometry, source-backed context, seller demo and reservation regression checks; no external calls."""
from contextlib import closing
from datetime import datetime,timedelta
import json,sqlite3,unittest
from unittest.mock import patch,MagicMock
import test_visit
from apps.api.routing import parse_route,fetch_road,_cache
from apps.api.hours import TEHRAN
from apps.api.catalogue_context import authenticity

SELECTION={'product_id':'product_two','offer_id':'offer_far','shop_id':'shop_far'}
ROAD={'geometry':{'type':'LineString','coordinates':[[51.4,35.7],[51.402,35.7],[51.402,35.736],[51.4,35.736]]},'distance_meters':5100,'duration_seconds':600,'endpoint_offset_meters':10,'computed_at':'2026-10-30T20:00:00+03:30','source':'FOSSGIS / OSRM / OpenStreetMap','live_traffic':False,'steps':[{'name':'خیابان آزمون','type':'turn','modifier':'left','distance_meters':100,'duration_seconds':30}]}
class UpgradeTests(unittest.TestCase):
 setUp=test_visit.VisitDecisionTests.setUp
 seed=test_visit.VisitDecisionTests.seed
 def route(self,**changes):return self.client.post('/api/local/road-routes',json={'selections':[SELECTION],'lat':35.7,'lon':51.4,'mode':'walking','consent':True,**changes})
 def batch(self):
  r=self.client.post('/api/local/checks',json={'journey_id':'test_journey','selections':[SELECTION]});self.assertEqual(r.status_code,200,r.text);return r.json()
 def reply(self,batch,**changes):return self.client.post(f"/api/local/seller-demo/{batch['id']}/{batch['items'][0]['seller_token']}",json={'outcome':'available','price_toman':'1234567890123456','hold_minutes':15,**changes})
 def reserve(self,batch):return self.client.post(f"/api/local/checks/{batch['id']}/offer_far/reserve",json={})
 def test_road_requires_opt_in_valid_mode_and_source_identity(self):
  self.seed()
  with patch('apps.api.routing.fetch_road') as network:
   for changes in ({'consent':False},{'mode':'flying'},{'lon':190},{'selections':[SELECTION]*4}):self.assertEqual(self.route(**changes).status_code,422)
   self.assertEqual(self.route(selections=[{**SELECTION,'shop_id':'shop_near'}]).status_code,404);network.assert_not_called()
 def test_road_uses_distinct_profiles_and_preserves_nonstraight_geometry(self):
  self.seed()
  with patch('apps.api.routing.fetch_road',return_value=ROAD) as network:
   for mode in ('driving','walking','cycling'):
    r=self.route(mode=mode);self.assertEqual(r.status_code,200,r.text);item=r.json()['items'][0];self.assertEqual(item['geometry'],ROAD['geometry']);self.assertEqual(item['mode'],mode);self.assertFalse(item['live_traffic']);self.assertEqual(network.call_args.args[-1],mode)
 def test_failed_road_never_falls_back_to_a_straight_line(self):
  self.seed()
  with patch('apps.api.routing.fetch_road',side_effect=ValueError('no route')):
   item=self.route().json()['items'][0];self.assertEqual(item['status'],'unavailable');self.assertNotIn('geometry',item)
 def test_arrival_uses_cached_road_duration_and_preserves_source_hours(self):
  self.seed()
  with patch('apps.api.journey.cached_route',return_value=ROAD):
   row=self.client.post('/api/local/arrival-checks',json={'selections':[SELECTION],'lat':35.7,'lon':51.4,'mode':'cycling','use_road_route':True,'local_time':'23:30'}).json()['items'][0]
  self.assertEqual(row['basis'],'street_route');self.assertEqual(row['minutes_max'],10);self.assertEqual(row['risk'],'ready');self.assertEqual(row['inventory_status'],'unconfirmed')
 def test_missing_car_route_never_uses_a_walking_estimate(self):
  self.seed()
  with patch('apps.api.journey.cached_route',return_value=None):
   row=self.client.post('/api/local/arrival-checks',json={'selections':[SELECTION],'lat':35.7,'lon':51.4,'mode':'driving','use_road_route':True}).json()['items'][0]
  self.assertIsNone(row['minutes_max']);self.assertEqual(row['basis'],'unknown')
 def test_batch_rejects_duplicate_shop_and_crossed_source_ids(self):
  self.seed()
  self.assertEqual(self.client.post('/api/local/checks',json={'journey_id':'x','selections':[SELECTION,SELECTION]}).status_code,422)
  self.assertEqual(self.client.post('/api/local/checks',json={'journey_id':'x','selections':[{**SELECTION,'offer_id':'missing'}]}).status_code,404)
 def test_restored_trip_namespace_can_start_another_check(self):
  self.seed();r=self.client.post('/api/local/checks',json={'journey_id':'saved:local-trip-id','selections':[SELECTION]});self.assertEqual(r.status_code,200,r.text);self.assertEqual(len(self.client.get('/api/local/checks',params={'journey_id':'saved:local-trip-id'}).json()['items']),1)
 def test_reply_capability_and_reservation_price_are_preserved(self):
  self.seed();batch=self.batch();self.assertEqual(self.client.post(f"/api/local/seller-demo/{batch['id']}/bad-token",json={'outcome':'available'}).status_code,404)
  self.assertEqual(self.reserve(batch).status_code,409)
  self.assertEqual(self.reply(batch).status_code,200);r=self.reserve(batch);self.assertEqual(r.status_code,200,r.text);hold=r.json();self.assertEqual(hold['price_toman'],'1234567890123456');self.assertEqual(hold['source'],'simulated');self.assertEqual(self.reserve(batch).json()['code'],hold['code'])
  self.assertEqual(self.client.get(f"/api/local/seller-demo/{batch['id']}/{batch['items'][0]['seller_token']}").json()['reservation']['code'],hold['code'])
 def test_expiry_cancel_and_new_reply_invalidate_old_reservations(self):
  self.seed();clock=datetime(2026,10,30,23,30,tzinfo=TEHRAN)
  with patch('apps.api.checks.now',return_value=clock):batch=self.batch();self.reply(batch);self.reserve(batch)
  with patch('apps.api.checks.now',return_value=clock+timedelta(minutes=16)):
   self.assertEqual(self.client.get('/api/local/checks/'+batch['id']).json()['items'][0]['reservation']['status'],'expired');self.assertEqual(self.reserve(batch).status_code,409)
   self.reply(batch,outcome='out_of_stock');self.assertEqual(self.reserve(batch).status_code,409)
 def test_seller_closing_time_caps_the_reservation_window(self):
  self.seed();clock=datetime(2026,10,30,23,30,tzinfo=TEHRAN)
  with patch('apps.api.checks.now',return_value=clock):
   batch=self.batch();self.reply(batch,closes_at='23:35');hold=self.reserve(batch).json();self.assertEqual(datetime.fromisoformat(hold['expires_at']),clock+timedelta(minutes=5))
 def test_saved_trip_binds_reservation_to_source_selection(self):
  self.seed();batch=self.batch();self.reply(batch);hold=self.reserve(batch).json()
  data={**SELECTION,'alternatives':[],'checklist':[],'reservation_id':hold['id']}
  response=self.client.post('/api/local/trips',json=data);self.assertEqual(response.status_code,200,response.text);self.assertEqual(response.json()['reservation']['code'],hold['code'])
  self.client.post(f"/api/local/checks/{batch['id']}/offer_far/cancel",json={});self.assertEqual(self.client.get('/api/local/trips').json()['items'][0]['reservation']['status'],'cancelled')
  data.update(offer_id='offer_near_1',shop_id='shop_near');self.assertEqual(self.client.post('/api/local/trips',json=data).status_code,422)
 def test_missing_reservation_evidence_is_unknown_not_expired(self):
  self.seed();batch=self.batch();self.reply(batch);hold=self.reserve(batch).json()
  self.client.post('/api/local/trips',json={**SELECTION,'alternatives':[],'checklist':[],'reservation_id':hold['id']})
  self.client.delete('/api/local/checks/'+batch['id'])
  self.assertEqual(self.client.get('/api/local/trips').json()['items'][0]['reservation']['status'],'unknown')
 def test_context_uses_real_prices_and_counts_without_confirming_inventory(self):
  self.seed();r=self.client.post('/api/local/catalogue-context',json={'query':'گوشی','product_ids':['product_two'],'lat':35.7,'lon':51.4,'radius_km':2});self.assertEqual(r.status_code,200,r.text);v=r.json();self.assertEqual(v['inventory_status'],'unconfirmed');self.assertIsInstance(v['budget']['min_toman'],str);self.assertGreater(v['budget']['model_count'],0);self.assertEqual(v['products']['product_two']['nearby_shop_count'],2)
 def test_originality_caution_never_comes_from_price_alone(self):
  self.assertIsNone(authenticity('گوشی عادی ارزان','گوشی موبایل'));self.assertIsNotNone(authenticity('هدفون های کپی','هدفون'));self.assertIsNone(authenticity('مبل طرح چوب','مبل'));self.assertFalse(authenticity('گوشی طرح اپل','گوشی موبایل')['declared_non_original'])
 def test_route_boundary_rejects_bad_geometry_and_nonfinite_duration(self):
  with self.assertRaises(ValueError):parse_route({'code':'Ok','routes':[{'geometry':{'type':'LineString','coordinates':[[0,0]]}}]})
  with self.assertRaises(ValueError):parse_route({'code':'Ok','routes':[{'geometry':ROAD['geometry'],'distance':100,'duration':float('nan')}]})

if __name__=='__main__':unittest.main()
