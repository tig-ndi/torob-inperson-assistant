"""Synthetic recorded terms. These checks never authorize credit or payments."""

import json
import unittest

from apps.api.credit import evaluate_credit


def option(**changes):
    return {"provider_name": "ارائه‌دهندهٔ آزمایشی", "channel": "in_person",
            "min_price_toman": None, "max_price_toman": None, "category_names": [], **changes}


def evaluate(*options, price=150000, category="گوشی"):
    return evaluate_credit(json.dumps(options, ensure_ascii=False), price, category)


class DeclaredCreditTests(unittest.TestCase):
    def test_recorded_in_person_program_with_no_recorded_restriction(self):
        result = evaluate(option())
        self.assertEqual(result.status, "matches_declared_terms")
        output = result.as_dict()["options"][0]
        self.assertIsNone(output["min_price_toman"])
        self.assertIsNone(output["max_price_toman"])
        self.assertEqual(output["category_names"], [])

    def test_amount_bounds_are_inclusive_and_large_integers_stay_exact(self):
        large = 733518940747298944
        terms = option(min_price_toman=large, max_price_toman=large + 1)
        for price, expected in ((large - 1, "does_not_match"), (large, "matches_declared_terms"),
                                (large + 1, "matches_declared_terms"), (large + 2, "does_not_match")):
            with self.subTest(price=price):
                result = evaluate(terms, price=price)
                self.assertEqual(result.status, expected)
                self.assertEqual(result.as_dict()["options"][0]["min_price_toman"], str(large))

    def test_zero_is_a_real_bound_and_null_is_not_zero(self):
        self.assertEqual(evaluate(option(min_price_toman=0, max_price_toman=0), price=0).status, "matches_declared_terms")
        self.assertEqual(evaluate(option(max_price_toman=0), price=1).status, "does_not_match")
        self.assertEqual(evaluate(option(), price=1).status, "matches_declared_terms")
        self.assertEqual(evaluate(option(), price=None).options[0].reason, "price_unknown")

    def test_unknown_or_unsupported_channel_never_matches_in_person(self):
        for channel, reason in (("unknown", "channel_unknown"), ("online", "unsupported_channel")):
            result = evaluate(option(channel=channel))
            self.assertEqual(result.status, "unknown")
            self.assertEqual(result.options[0].reason, reason)

    def test_categories_are_exact_after_normalization_not_shop_membership_or_a_guessed_hierarchy(self):
        terms = option(category_names=["گوشي ۱۲"])
        self.assertEqual(evaluate(terms, category="گوشی 12").status, "matches_declared_terms")
        self.assertEqual(evaluate(terms, category="گوشی").options[0].reason, "category_mismatch")
        self.assertEqual(evaluate(terms, category=None).options[0].reason, "product_category_unknown")
        self.assertEqual(evaluate(option(category_names=["موبایل و کالای دیجیتال"]), category="گوشی").status,
                         "does_not_match")

    def test_missing_and_invalid_information_remains_explicit_unknown(self):
        for raw in (None, "null", "[]"):
            self.assertEqual(evaluate_credit(raw, 1, "گوشی").reason, "not_recorded")
        for raw in ("bad json", "{}", "true", "42"):
            self.assertEqual(evaluate_credit(raw, 1, "گوشی").reason, "invalid_data")

    def test_all_constraints_are_validated_even_for_an_unknown_channel(self):
        cases = [option(channel="unknown", min_price_toman=-1), option(max_price_toman=True),
                 option(min_price_toman="100"), option(max_price_toman=1.5),
                 option(min_price_toman=2, max_price_toman=1), option(provider_name=" "),
                 option(category_names=None), option(category_names=[""]),
                 option(category_names=[{"category": "گوشی"}]), {"provider_name": "ناقص"}, None]
        for terms in cases:
            with self.subTest(terms=terms):
                result = evaluate(terms)
                self.assertEqual(result.status, "unknown")
                self.assertEqual(result.options[0].reason, "invalid_conditions")

    def test_multiple_programs_are_kept_and_any_matching_option_is_sufficient(self):
        result = evaluate(option(max_price_toman=1), option(min_price_toman=100000), None)
        self.assertEqual(result.status, "matches_declared_terms")
        self.assertEqual([o.option_index for o in result.options], [0, 1, 2])
        self.assertEqual([o.status for o in result.options], ["does_not_match", "matches_declared_terms", "unknown"])
        self.assertEqual(evaluate(option(max_price_toman=1)).status, "does_not_match")
        self.assertEqual(evaluate(option(max_price_toman=1), None).status, "unknown")

    def test_invalid_host_price_is_rejected_instead_of_coerced(self):
        for price in (-1, True, 1.5, "150000"):
            with self.subTest(price=price), self.assertRaises(ValueError):
                evaluate(option(), price=price)
