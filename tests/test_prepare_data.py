"""Contract regressions use explicitly synthetic fixtures, not copied contacts."""

import csv
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from tools.prepare_data import SCHEMAS, normalize_text, prepare


class DatasetContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.database = self.root / "out" / "catalogue.sqlite3"
        self.report = self.root / "out" / "profile.json"
        self.rows = {
            "shops": [{"shop_id": "shop_test", "name": "فروشگاه آزمایشی",
                       "lat": "35.7", "lon": "51.4", "category_names": '["گوشی"]',
                       "payment_options": "[]", "weekly_hours": "{}", "contacts": "[]"}],
            "products": [{"product_id": "product_test", "persian_title": "گوشي مدل ۱۲",
                          "image_urls": "[]", "specs": "[]"}],
            "offers": [{"offer_id": "offer_test", "product_id": "product_test",
                        "shop_id": "shop_test", "price_toman": "120000",
                        "description": "", "last_price_changed_at": "2026-09-01T00:00:00+00:00"}],
        }

    def write_source(self):
        for table, schema in SCHEMAS.items():
            with (self.source / f"{table}.csv").open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=list(schema))
                writer.writeheader()
                writer.writerows({column: row.get(column, "null") for column in schema}
                                 for row in self.rows[table])

    def run_import(self):
        self.write_source()
        return prepare(self.source, self.database, self.report)

    def test_real_csv_boundary_units_nulls_search_and_provenance(self):
        report = self.run_import()
        self.assertEqual(report["relations"]["foreign_key_errors"], 0)
        self.assertEqual(report["fts_rows"], 1)
        self.assertEqual(report["prices"]["min_toman"], 120000)
        self.assertFalse(report["semantics"]["inventory_confirmed"])
        self.assertEqual(len(report["sources"]["shops"]["sha256"]), 64)
        with closing(sqlite3.connect(self.database)) as con:
            self.assertEqual(con.execute("SELECT description,warranty,price_toman FROM offers").fetchone(), ("", None, 120000))
            self.assertEqual(con.execute("SELECT product_id FROM product_search WHERE product_search MATCH ?", (normalize_text("گوشی 12"),)).fetchone(), ("product_test",))
        self.assertEqual(json.loads(self.report.read_text(encoding="utf-8"))["integrity_check"], "ok")

    def test_orphan_offer_fails_without_publishing_partial_database(self):
        self.rows["offers"][0]["shop_id"] = "missing_shop"
        with self.assertRaisesRegex(ValueError, "FOREIGN KEY"):
            self.run_import()
        self.assertFalse(self.database.exists())
        self.assertFalse(self.report.exists())

    def test_duplicate_id_is_not_silently_replaced(self):
        self.rows["products"].append(self.rows["products"][0].copy())
        with self.assertRaisesRegex(ValueError, "UNIQUE"):
            self.run_import()

    def test_malformed_json_and_nonfinite_coordinate_are_rejected(self):
        for column, value in (("weekly_hours", "[]"), ("lat", "NaN")):
            with self.subTest(column=column):
                original = self.rows["shops"][0][column]
                self.rows["shops"][0][column] = value
                with self.assertRaises(ValueError):
                    self.run_import()
                self.rows["shops"][0][column] = original

    def test_source_schema_drift_is_rejected(self):
        self.write_source()
        (self.source / "shops.csv").write_text("shop_id,name\nshop_test,Test\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "header"):
            prepare(self.source, self.database, self.report)

    def test_previous_snapshot_is_not_overwritten(self):
        self.run_import()
        before = self.database.read_bytes()
        with self.assertRaises(FileExistsError):
            prepare(self.source, self.database, self.report)
        self.assertEqual(before, self.database.read_bytes())

    def test_negative_price_and_missing_timezone_are_rejected(self):
        for column, value in (("price_toman", "-100"), ("last_price_changed_at", "2026-09-01T00:00:00")):
            with self.subTest(column=column):
                original = self.rows["offers"][0][column]
                self.rows["offers"][0][column] = value
                with self.assertRaises(ValueError):
                    self.run_import()
                self.rows["offers"][0][column] = original

    def test_outputs_cannot_modify_source_directory(self):
        self.write_source()
        with self.assertRaisesRegex(ValueError, "outside"):
            prepare(self.source, self.source / "out.sqlite3", self.report)

    def test_large_money_and_mixed_offsets_keep_their_meaning(self):
        large_price = 733518940747298944
        self.rows["offers"][0].update(price_toman=str(large_price),
                                      last_price_changed_at="2026-09-01T01:00:00+03:30")
        self.rows["offers"].append({**self.rows["offers"][0], "offer_id": "offer_second",
                                   "last_price_changed_at": "2026-08-31T23:00:00+00:00"})
        report = self.run_import()
        self.assertEqual(report["prices"]["max_toman"], large_price)
        self.assertEqual(report["prices"]["above_javascript_safe_integer"], 2)
        self.assertEqual(report["relations"]["repeated_shop_product_pairs"], 1)
        self.assertEqual(report["price_timestamp_range"],
                         ["2026-09-01T01:00:00+03:30", "2026-08-31T23:00:00+00:00"])


if __name__ == "__main__":
    unittest.main()
