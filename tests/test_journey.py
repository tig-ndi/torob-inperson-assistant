"""Arrival decisions use local source schedules; no external routing or model calls."""
from contextlib import closing
import json
import sqlite3
import unittest
import test_visit


class ArrivalTests(unittest.TestCase):
    setUp = test_visit.VisitDecisionTests.setUp
    seed = test_visit.VisitDecisionTests.seed

    def check(self, **changes):
        return self.client.post('/api/local/arrival-checks', json={
            'selections': [{'product_id': 'product_two', 'offer_id': 'offer_far', 'shop_id': 'shop_far'}],
            'lat': 35.7, 'lon': 51.4, 'local_time': '23:30', **changes})

    def test_walking_range_is_explicit_and_overnight_schedule_works(self):
        self.seed()
        r = self.check()
        self.assertEqual(r.status_code, 200, r.text)
        row = r.json()['items'][0]
        self.assertEqual(row['basis'], 'rough_walking_range')
        self.assertGreater(row['minutes_max'], row['minutes_min'])
        self.assertEqual(row['risk'], 'ready')
        self.assertEqual(row['inventory_status'], 'unconfirmed')
        self.assertIn('01:', row['arrival_at'])

    def test_shop_open_now_but_closed_on_arrival_is_not_recommended(self):
        self.seed()
        schedule = json.dumps({day: {'status': 'declared', 'shifts': [{'start_time': '22:00', 'end_time': '00:00'}]} for day in ('mon','tue','wed','thu','fri','sat','sun')})
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute('UPDATE shops SET weekly_hours=? WHERE shop_id=?', (schedule, 'shop_far'))
        self.assertEqual(self.check().json()['items'][0]['risk'], 'closing_soon')
        row = self.check(mode='manual', manual_minutes=5, manual_offer_id='offer_far').json()['items'][0]
        self.assertEqual(row['risk'], 'ready')
        self.assertEqual(row['basis'], 'user_duration')
        row = self.check(mode='manual', manual_minutes=20, manual_offer_id='offer_far').json()['items'][0]
        self.assertEqual(row['risk'], 'closing_soon')  # 10-minute purchase margin ends exactly at closing.

    def test_unknown_and_missing_location_never_become_safe(self):
        self.seed()
        self.assertEqual(self.check(lat=None, lon=None).json()['items'][0]['risk'], 'unknown')
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("UPDATE shops SET weekly_hours='{}' WHERE shop_id='shop_far'")
        self.assertEqual(self.check().json()['items'][0]['risk'], 'unknown')

    def test_identity_and_duration_boundaries(self):
        self.seed()
        for edit in ({'manual_minutes': 0}, {'mode': 'manual', 'manual_minutes': 5, 'manual_offer_id': 'another'}, {'lon': None}, {'local_time': '25:00'}):
            self.assertEqual(self.check(**edit).status_code, 422)
        self.assertEqual(self.check(selections=[{'product_id':'product_two','offer_id':'offer_far','shop_id':'shop_near'}]).status_code,404)


if __name__ == '__main__':
    unittest.main()
