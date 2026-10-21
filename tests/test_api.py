"""API behavior with synthetic CSV fixtures; real-data smoke is separate."""

from contextlib import closing
import csv
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
