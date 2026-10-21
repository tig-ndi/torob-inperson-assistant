"""API behavior with synthetic CSV fixtures; real-data smoke is separate."""

from contextlib import closing
import csv
from datetime import datetime
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from fastapi.testclient import TestClient

from apps.api.main import create_app
from tools.prepare_data import SCHEMAS, prepare


class CatalogueApiTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.database = self.root / "catalogue.sqlite3"
        source = self.root / "source"
        source.mkdir()
        rows = {
            "shops": [
                {"shop_id": "shop_one", "name": "آزمایشی", "lat": "35.7", "lon": "51.4"},
                {"shop_id": "shop_near", "name": "نزدیک", "lat": "35.71", "lon": "51.41"},
                {"shop_id": "shop_far", "name": "دور", "lat": "35.85", "lon": "51.55"},
                {"shop_id": "shop_null_coord", "name": "بدون لوکیشن"},
                {"shop_id": "shop_category_only", "category_names": '["گوشی"]'},
            ],
            "products": [
                {"product_id": "product_one", "persian_title": "گوشي مدل ۱۲", "specs": "[]", "image_urls": "[]"},
                {"product_id": "product_two", "persian_title": "گوشی دوم", "specs": "[]", "image_urls": "[]"},
                {"product_id": "no_offer", "persian_title": "گوشی بی آفر"},
            ],
            "offers": [
                {"offer_id": "offer_a", "product_id": "product_one", "shop_id": "shop_one", "price_toman": "120000",
                 "last_price_changed_at": "2020-12-03T00:00:00+00:00", "seller_title": "متن ثبت‌شده",
                 "warranty": '{"description":"گارانتی اول"}'},
                {"offer_id": "offer_b", "product_id": "product_one", "shop_id": "shop_one", "price_toman": "733518940747298944",
                 "warranty": '{"description":"گارانتی دوم"}'},
                {"offer_id": "offer_null", "product_id": "product_one", "shop_id": "shop_one"},
                {"offer_id": "offer_near_1", "product_id": "product_two", "shop_id": "shop_near", "price_toman": "200000"},
                {"offer_id": "offer_near_2", "product_id": "product_two", "shop_id": "shop_near", "price_toman": "250000"},
                {"offer_id": "offer_far", "product_id": "product_two", "shop_id": "shop_far", "price_toman": "180000"},
                {"offer_id": "offer_no_coord", "product_id": "product_two", "shop_id": "shop_null_coord", "price_toman": "190000"},
                {"offer_id": "other_product", "product_id": "product_two", "shop_id": "shop_one", "price_toman": "2"},
            ],
        }
        for table, schema in SCHEMAS.items():
            with (source / f"{table}.csv").open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=list(schema))
                writer.writeheader()
                writer.writerows({key: row.get(key, "null") for key in schema} for row in rows[table])
        prepare(source, self.database, self.root / "profile.json")
        self.client = TestClient(create_app(self.database))
        self.addCleanup(self.client.close)

    def test_normalized_search_and_literal_fts_tokens(self):
        response = self.client.get("/api/products", params={"q": "گوشی 12"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual([p["product_id"] for p in body["items"]], ["product_one"])
        self.assertEqual(body["provenance"]["currency"], "toman")
        self.assertEqual(body["provenance"]["inventory_status"], "unconfirmed")
        self.assertEqual(len(body["provenance"]["snapshot_id"]), 64)
        for query in ('" OR *', 'گوشی OR nonexistent', "x'; DROP TABLE products; --"):
            with self.subTest(query=query):
                response = self.client.get("/api/products", params={"q": query})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["items"], [])
        self.assertEqual(self.client.get("/api/products/product_one").status_code, 200)

    def test_offers_preserve_ids_null_large_money_timestamp_and_warranty(self):
        response = self.client.get("/api/products/product_one/offers")
        self.assertEqual(response.status_code, 200)
        offers = response.json()["items"]
        self.assertEqual([o["offer_id"] for o in offers], ["offer_a", "offer_b", "offer_null"])
        self.assertEqual(offers[1]["price_toman"], "733518940747298944")
        self.assertEqual(offers[1]["price_quality"], "above_js_safe_integer")
        self.assertIsNone(offers[2]["price_toman"])
        self.assertEqual(offers[0]["last_price_changed_at"], "2020-12-03T00:00:00+00:00")
        self.assertNotEqual(offers[0]["warranty"], offers[1]["warranty"])
        self.assertTrue(all(o["shop_id"] == "shop_one" and o["product_id"] == "product_one" for o in offers))
        self.assertTrue(all(o["inventory_status"] == "unconfirmed" for o in offers))
        self.assertNotIn("contacts", json.dumps(response.json()))

    def test_budget_is_exact_and_excludes_unknown_prices(self):
        response = self.client.get("/api/products/product_one/offers", params={"max_price_toman": "733518940747298943"})
        self.assertEqual([o["offer_id"] for o in response.json()["items"]], ["offer_a"])
        response = self.client.get("/api/products", params={"q": "گوشی", "max_price_toman": "2"})
        self.assertEqual([p["product_id"] for p in response.json()["items"]], ["product_two"])
        self.assertEqual(self.client.get("/api/products/product_one/offers", params={"max_price_toman": "0"}).json()["items"], [])

    def test_summary_uses_all_source_offers_not_a_representative_row(self):
        body = self.client.get("/api/products/product_one").json()
        self.assertEqual(body["product"]["offer_summary"], {
            "offer_count": 3, "min_price_toman": "120000",
            "max_price_toman": "733518940747298944", "missing_price_count": 1})

    def test_pages_have_stable_order_and_continuation(self):
        first = self.client.get("/api/products/product_one/offers", params={"limit": 1}).json()
        second = self.client.get("/api/products/product_one/offers", params={"limit": 1, "offset": 1}).json()
        self.assertTrue(first["has_more"])
        self.assertNotEqual(first["items"][0]["offer_id"], second["items"][0]["offer_id"])
        self.assertFalse(self.client.get("/api/products/product_one/offers", params={"offset": 3}).json()["has_more"])

    def test_empty_unknown_and_broken_service_are_distinct(self):
        self.assertEqual(self.client.get("/api/products/no_offer/offers").json()["items"], [])
        self.assertEqual(self.client.get("/api/products/missing/offers").status_code, 404)
        self.assertEqual(self.client.get("/api/products/missing").status_code, 404)
        self.assertEqual(self.client.get("/api/products", params={"q": "ناپیدا"}).json()["items"], [])
        missing = self.root / "missing.sqlite3"
        with TestClient(create_app(missing)) as client:
            response = client.get("/api/products", params={"q": "گوشی"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "catalogue_unavailable")
        self.assertFalse(missing.exists())

    def test_invalid_inputs_are_rejected_before_query(self):
        for params in ({"q": " "}, {"q": "***"}, {"q": "a " * 13}, {"q": "a" * 121},
                       {"q": "گوشی", "limit": 51}, {"q": "گوشی", "offset": -1},
                       {"q": "گوشی", "offset": 1000001}, {"q": "گوشی", "max_price_toman": "-1"},
                       {"q": "گوشی", "max_price_toman": "1.5"},
                       {"q": "گوشی", "max_price_toman": "9223372036854775808"}):
            with self.subTest(params=params):
                self.assertEqual(self.client.get("/api/products", params=params).status_code, 422)

    def test_malformed_nested_source_is_service_failure(self):
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE products SET specs=? WHERE product_id='product_one'", ('[{"value":42}]',))
            connection.commit()
        self.assertEqual(self.client.get("/api/products/product_one").status_code, 503)
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE metadata SET value='{}' WHERE key='profile'")
            connection.commit()
        for endpoint in ("/api/products/missing", "/api/products/missing/offers", "/api/products?q=test"):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self.client.get(endpoint).status_code, 503)

    def test_runtime_connection_is_read_only_and_does_not_change_snapshot(self):
        from apps.api.catalogue import Catalogue, CatalogueUnavailable
        before = self.database.read_bytes()
        catalogue = Catalogue(self.database)
        with self.assertRaises(CatalogueUnavailable):
            with catalogue.connect() as connection:
                connection.execute("DELETE FROM products")
        self.client.get("/api/products", params={"q": "گوشی"})
        self.assertEqual(before, self.database.read_bytes())

    def test_haversine_distance_calculation_and_radius_filter(self):
        # Coordinates without radius: all offers returned, distance calculated, null coords has None distance
        resp = self.client.get("/api/products/product_two/offers", params={"user_lat": 35.7, "user_lon": 51.4})
        self.assertEqual(resp.status_code, 200)
        items = resp.json()["items"]
        self.assertEqual(len(items), 5)
        dist_map = {o["offer_id"]: o["direct_distance_meters"] for o in items}
        self.assertEqual(dist_map["other_product"], 0)
        self.assertEqual(dist_map["offer_near_1"], 1432)
        self.assertEqual(dist_map["offer_near_2"], 1432)  # Multi-offer for same shop
        self.assertEqual(dist_map["offer_far"], 21478)
        self.assertIsNone(dist_map["offer_no_coord"])

        # Radius 5km: near offers included, far and null coords excluded; multi-offer preserved
        resp_5km = self.client.get("/api/products/product_two/offers",
                                   params={"user_lat": 35.7, "user_lon": 51.4, "max_distance_km": 5})
        self.assertEqual(resp_5km.status_code, 200)
        items_5km = resp_5km.json()["items"]
        self.assertEqual([o["offer_id"] for o in items_5km], ["other_product", "offer_near_1", "offer_near_2"])

        # Boundary edge case: shop_near is 1432.386 meters away.
        # radius 1.432 km -> 1432.0 m (shop_near is excluded)
        resp_under = self.client.get("/api/products/product_two/offers",
                                     params={"user_lat": 35.7, "user_lon": 51.4, "max_distance_km": 1.432})
        self.assertEqual([o["offer_id"] for o in resp_under.json()["items"]], ["other_product"])

        # radius 1.433 km -> 1433.0 m (shop_near is included)
        resp_over = self.client.get("/api/products/product_two/offers",
                                    params={"user_lat": 35.7, "user_lon": 51.4, "max_distance_km": 1.433})
        self.assertEqual([o["offer_id"] for o in resp_over.json()["items"]],
                         ["other_product", "offer_near_1", "offer_near_2"])

        # Combined budget and radius filter with pagination
        # max_price_toman 210000 + max_distance_km 5 -> other_product (2) and offer_near_1 (200000)
        resp_combo = self.client.get("/api/products/product_two/offers",
                                     params={"user_lat": 35.7, "user_lon": 51.4, "max_distance_km": 5,
                                             "max_price_toman": 210000, "limit": 1})
        self.assertEqual(resp_combo.status_code, 200)
        body = resp_combo.json()
        self.assertTrue(body["has_more"])
        self.assertEqual(body["items"][0]["offer_id"], "other_product")

        resp_page2 = self.client.get("/api/products/product_two/offers",
                                     params={"user_lat": 35.7, "user_lon": 51.4, "max_distance_km": 5,
                                             "max_price_toman": 210000, "limit": 1, "offset": 1})
        self.assertFalse(resp_page2.json()["has_more"])
        self.assertEqual(resp_page2.json()["items"][0]["offer_id"], "offer_near_1")

    def test_coordinates_and_radius_validation_edge_cases(self):
        # lat without lon
        self.assertEqual(self.client.get("/api/products/product_one/offers",
                                         params={"user_lat": 35.7}).status_code, 422)
        # lon without lat
        self.assertEqual(self.client.get("/api/products/product_one/offers",
                                         params={"user_lon": 51.4}).status_code, 422)
        # radius without coordinates
        self.assertEqual(self.client.get("/api/products/product_one/offers",
                                         params={"max_distance_km": 5}).status_code, 422)
        # out of geographic bounds
        for params in ({"user_lat": 91.0, "user_lon": 51.4},
                       {"user_lat": -91.0, "user_lon": 51.4},
                       {"user_lat": 35.7, "user_lon": 181.0},
                       {"user_lat": 35.7, "user_lon": -181.0},
                       {"user_lat": 35.7, "user_lon": 51.4, "max_distance_km": 0},
                       {"user_lat": 35.7, "user_lon": 51.4, "max_distance_km": -1},
                       {"user_lat": "nan", "user_lon": 51.4},
                       {"user_lat": 35.7, "user_lon": "inf"}):
            with self.subTest(params=params):
                self.assertEqual(self.client.get("/api/products/product_one/offers", params=params).status_code, 422)

    def test_open_now_filter_precedes_pagination_and_combines_with_existing_filters(self):
        from test_hours import CLOSED, declared, shift

        weekly_open = json.dumps({"wed": declared(shift()), "tue": CLOSED})
        weekly_closed = json.dumps({"wed": CLOSED, "tue": CLOSED})
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE shops SET weekly_hours=? WHERE shop_id IN ('shop_one','shop_far')", (weekly_closed,))
            connection.execute("UPDATE shops SET weekly_hours=? WHERE shop_id='shop_near'", (weekly_open,))
            connection.commit()
        instant = datetime.fromisoformat("2026-10-21T10:00:00+03:30")
        with TestClient(create_app(self.database, clock=lambda: instant)) as client:
            url = "/api/products/product_two/offers"
            full = client.get(url).json()
            self.assertEqual(len(full["items"]), 5)
            by_id = {offer["offer_id"]: offer for offer in full["items"]}
            self.assertEqual(by_id["offer_no_coord"]["opening_hours"]["status"], "unknown")
            self.assertEqual(by_id["other_product"]["opening_hours"]["status"], "declared_closed")
            params = {"open_now_only": "true", "limit": 1}
            first = client.get(url, params=params)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.headers["cache-control"], "no-store")
            self.assertEqual(first.json()["items"][0]["offer_id"], "offer_near_1")
            self.assertTrue(first.json()["has_more"])
            second = client.get(url, params={**params, "offset": 1}).json()
            self.assertEqual(second["items"][0]["offer_id"], "offer_near_2")
            self.assertFalse(second["has_more"])
            combined = client.get(url, params={**params, "user_lat": 35.7, "user_lon": 51.4,
                                              "max_distance_km": 5, "max_price_toman": "210000"}).json()
            self.assertEqual([o["offer_id"] for o in combined["items"]], ["offer_near_1"])
            self.assertFalse(combined["has_more"])
            self.assertEqual(combined["hours_evaluated_at"], instant.isoformat())
            self.assertEqual(client.get(url, params={"open_now_only": "invalid"}).status_code, 422)

    def test_one_injected_instant_is_shared_by_filter_results_and_page_metadata(self):
        from test_hours import CLOSED, declared, shift

        weekly = json.dumps({"wed": declared(shift("09:00", "10:00")), "tue": CLOSED})
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE shops SET weekly_hours=? WHERE shop_id='shop_one'", (weekly,))
            connection.commit()
        clocks = iter([datetime.fromisoformat("2026-10-21T09:59:59+03:30"),
                       datetime.fromisoformat("2026-10-21T10:00:00+03:30")])
        with TestClient(create_app(self.database, clock=lambda: next(clocks))) as client:
            before = client.get("/api/products/product_one/offers", params={"open_now_only": "true"}).json()
            after = client.get("/api/products/product_one/offers", params={"open_now_only": "true"}).json()
        self.assertEqual(len(before["items"]), 3)  # Same shop, all offer IDs retained.
        self.assertEqual(after["items"], [])
        self.assertIn("09:59:59", before["hours_evaluated_at"])
        self.assertIn("10:00:00", after["hours_evaluated_at"])

    def test_credit_filter_precedes_pagination_preserves_multiple_offers_and_uses_the_offer_category(self):
        from test_credit import option
        from test_hours import CLOSED, declared, shift

        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE products SET category_name='گوشی' WHERE product_id='product_two'")
            connection.execute("UPDATE shops SET payment_options=? WHERE shop_id='shop_one'", (json.dumps([option(channel="unknown")]),))
            connection.execute("UPDATE shops SET payment_options=?,weekly_hours=? WHERE shop_id='shop_near'",
                               (json.dumps([option(category_names=["گوشی"], min_price_toman=200000, max_price_toman=250000)]),
                                json.dumps({"wed": declared(shift()), "tue": CLOSED})))
            connection.execute("UPDATE shops SET payment_options=? WHERE shop_id='shop_far'",
                               (json.dumps([option(category_names=["کفش"])]),))
            connection.commit()
        now = datetime.fromisoformat("2026-10-21T10:00:00+03:30")
        with TestClient(create_app(self.database, clock=lambda: now)) as client:
            url = "/api/products/product_two/offers"
            full = client.get(url).json()["items"]
            by_id = {o["offer_id"]: o for o in full}
            self.assertEqual(by_id["other_product"]["in_person_credit"]["status"], "unknown")
            self.assertEqual(by_id["offer_no_coord"]["in_person_credit"]["status"], "unknown")
            self.assertEqual(by_id["offer_far"]["in_person_credit"]["status"], "does_not_match")
            params = {"in_person_credit_only": "true", "limit": 1}
            first = client.get(url, params=params)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json()["items"][0]["offer_id"], "offer_near_1")
            self.assertTrue(first.json()["has_more"])
            second = client.get(url, params={**params, "offset": 1}).json()
            self.assertEqual(second["items"][0]["offer_id"], "offer_near_2")
            self.assertFalse(second["has_more"])
            combined = client.get(url, params={**params, "max_price_toman": "210000", "user_lat": 35.7,
                                              "user_lon": 51.4, "max_distance_km": 5, "open_now_only": "true"}).json()
            self.assertEqual([o["offer_id"] for o in combined["items"]], ["offer_near_1"])
            self.assertFalse(combined["has_more"])
            self.assertEqual(combined["items"][0]["in_person_credit"]["options"][0]["min_price_toman"], "200000")
            self.assertEqual(client.get(url, params={"in_person_credit_only": "invalid"}).status_code, 422)

    def test_unknown_price_and_invalid_payment_data_are_visible_without_becoming_eligible(self):
        from test_credit import option

        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE shops SET payment_options=? WHERE shop_id='shop_one'", (json.dumps([option()]),))
            connection.commit()
        full = self.client.get("/api/products/product_one/offers").json()["items"]
        self.assertEqual(full[-1]["in_person_credit"]["options"][0]["reason"], "price_unknown")
        filtered = self.client.get("/api/products/product_one/offers", params={"in_person_credit_only": "true"}).json()
        self.assertEqual([o["offer_id"] for o in filtered["items"]], ["offer_a", "offer_b"])
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE shops SET payment_options='{}' WHERE shop_id='shop_one'")
            connection.commit()
        response = self.client.get("/api/products/product_one/offers")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"][0]["in_person_credit"]["reason"], "invalid_data")
        self.assertEqual(self.client.get("/api/products/product_one/offers",
                                        params={"in_person_credit_only": "true"}).json()["items"], [])
