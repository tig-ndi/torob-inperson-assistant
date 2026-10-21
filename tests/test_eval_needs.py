"""Tests for the offline need-to-specs evaluation tool."""

import csv
import json
from pathlib import Path
import tempfile
import unittest

from apps.api.catalogue import Catalogue
from tools.eval_needs import (
    REPRESENTATIVE_SCENARIOS,
    evaluate_scenario,
    run_evaluation,
)
from tools.prepare_data import SCHEMAS, prepare


class EvalNeedsTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.database = self.root / "catalogue.sqlite3"
        source = self.root / "source"
        source.mkdir()

        specs_with_camera = json.dumps([
            {"section": "مشخصات کلی", "key": "رزولوشن دوربین اصلی", "value": "50 مگاپیکسل"},
            {"section": "مشخصات کلی", "key": "گنجایش باتری", "value": "5000 میلی‌آمپر ساعت"},
        ], ensure_ascii=False)

        specs_without_camera = json.dumps([
            {"section": "مشخصات کلی", "key": "تعداد سیم کارت", "value": "دو سیم"},
        ], ensure_ascii=False)

        rows = {
            "shops": [
                {"shop_id": "shop_test", "name": "فروشگاه تست", "lat": "35.7", "lon": "51.4"},
            ],
            "products": [
                {
                    "product_id": "prod_phone_cam",
                    "persian_title": "گوشی موبایل مدل عکاسی پرو",
                    "category_name": "گوشی موبایل",
                    "specs": specs_with_camera,
                    "image_urls": "[]",
                },
                {
                    "product_id": "prod_phone_nocam",
                    "persian_title": "گوشی موبایل ساده دکمه ای",
                    "category_name": "گوشی موبایل",
                    "specs": specs_without_camera,
                    "image_urls": "[]",
                },
                {
                    "product_id": "prod_holder",
                    "persian_title": "پایه عکاسی مونوپاد",
                    "category_name": "پایه نگهدارنده گوشی و تبلت",
                    "specs": "[]",
                    "image_urls": "[]",
                },
            ],
            "offers": [
                {"offer_id": "off_1", "product_id": "prod_phone_cam", "shop_id": "shop_test", "price_toman": "15000000"},
                {"offer_id": "off_2", "product_id": "prod_phone_nocam", "shop_id": "shop_test", "price_toman": "1000000"},
                {"offer_id": "off_3", "product_id": "prod_holder", "shop_id": "shop_test", "price_toman": "500000"},
            ],
        }

        for table, schema in SCHEMAS.items():
            with (source / f"{table}.csv").open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=list(schema))
                writer.writeheader()
                writer.writerows({key: row.get(key, "null") for key in schema} for row in rows[table])

        prepare(source, self.database, self.root / "profile.json")
        self.catalogue = Catalogue(self.database)

    def test_evaluate_scenario_structure_and_insufficient_evidence_labeling(self):
        scenario = {
            "id": "scenario_test",
            "title": "تست گوشی عکاسی",
            "user_message": "یک گوشی برای عکاسی می‌خواهم تا ۲۰ میلیون تومان",
            "budget_toman": 20000000,
            "target_category": "گوشی موبایل",
            "prior_expectation": "انتظار آزمون",
            "spec_probe_keys": ["دوربین", "رزولوشن", "مگاپیکسل"],
            "inference_notes": "یادداشت استنباط",
        }

        result = evaluate_scenario(self.catalogue, scenario)
        self.assertEqual(result["scenario_id"], "scenario_test")
        self.assertIn("گوشی عکاسی", result["generated_query_choices"])
        self.assertIn("گوشی", result["generated_query_choices"])

        analysis = result["choices_analysis"]["گوشی"]
        self.assertGreaterEqual(analysis["returned_items_count"], 2)
        self.assertEqual(analysis["target_category_items_count"], 2)
        self.assertIn("ORDER BY product_search.rank, p.product_id", analysis["ranking_basis"])

        samples = {p["product_id"]: p for p in analysis["sample_products"]}
        if "prod_phone_cam" in samples:
            self.assertEqual(samples["prod_phone_cam"]["evidence_status"], "has_potential_specs")
            self.assertGreater(len(samples["prod_phone_cam"]["matched_specs_sample"]), 0)
        if "prod_phone_nocam" in samples:
            self.assertEqual(samples["prod_phone_nocam"]["evidence_status"], "insufficient_evidence")

    def test_run_evaluation_creates_json_file(self):
        output_file = self.root / "eval_out.json"
        summary = run_evaluation(self.database, output_file)
        self.assertEqual(summary["sample_size"], len(REPRESENTATIVE_SCENARIOS))
        self.assertTrue(output_file.exists())
        loaded = json.loads(output_file.read_text(encoding="utf-8"))
        self.assertEqual(loaded["sample_size"], len(REPRESENTATIVE_SCENARIOS))

    def test_missing_database_raises_file_not_found(self):
        non_existent = self.root / "does_not_exist.sqlite3"
        with self.assertRaises(FileNotFoundError):
            run_evaluation(non_existent)
