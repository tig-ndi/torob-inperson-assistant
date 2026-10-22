"""Deterministic explanation tests; all facts come from synthetic source fixtures."""

from contextlib import closing
import json
import sqlite3
import unittest
from unittest.mock import patch

from apps.api.catalogue import Catalogue, CatalogueUnavailable
from apps.api.explanations import explain_search, review_topics, topic_explanation
from apps.api.intent import AssistantRequest
from apps.api.models import Product, ProductPage
import test_api


def phone(specs, category='گوشی موبایل'):
    return Product(product_id='p', persian_title='منبع', category_name=category, brand_name=None, model=None,
                   image_urls=[], specs=specs,
                   offer_summary={'offer_count': 0, 'min_price_toman': None, 'max_price_toman': None, 'missing_price_count': 0})


def spec(key, value, section='مشخصات کلی'):
    return {'key': key, 'value': value, 'section': section}


class TopicEvidenceTests(unittest.TestCase):
    def test_reference_values_and_indices_are_source_exact_and_display_resolution_is_excluded(self):
        raw = [spec('رزولوشن', '1080×2400'), spec('دوربین اصلی', '<دستور نامطمئن>۵۰ مگاپیکسل')]
        result = topic_explanation(phone(raw), 'camera')
        self.assertEqual(result['status'], 'recorded')
        self.assertEqual(result['evidence'], [{'source_index': 1, **raw[1], 'state': 'recorded'}])

    def test_absence_placeholder_and_no_data_are_different_without_claiming_suitability(self):
        self.assertEqual(topic_explanation(phone([spec('دوربین', 'ندارد')]), 'camera')['status'], 'source_warning')
        for value in [None, 'title', 'None', 'نامشخص']:
            result = topic_explanation(phone([spec('دوربین', value)]), 'camera')
            self.assertEqual(result['status'], 'missing')
            self.assertEqual(result['evidence'][0]['value'], value)
        self.assertEqual(topic_explanation(phone([]), 'camera')['evidence_count'], 0)

    def test_battery_replaceability_warning_does_not_erase_capacity_or_imply_no_battery(self):
        result = topic_explanation(phone([spec('باتری قابل تعویض', 'ندارد'), spec('ظرفیت باتری', '5000 mAh')]), 'battery')
        self.assertEqual(result['status'], 'source_warning')
        self.assertEqual({e['key'] for e in result['evidence']}, {'باتری قابل تعویض', 'ظرفیت باتری'})
        self.assertIn('برخی ویژگی', result['summary'])

    def test_conflicting_source_witnesses_survive_bounded_preview(self):
        raw = [spec('دوربین', 'ندارد')] * 8 + [spec('دوربین', '۵۰ مگاپیکسل')]
        result = topic_explanation(phone(raw), 'camera')
        self.assertEqual(result['status'], 'conflicting')
        self.assertEqual(result['evidence_count'], 9)
        self.assertLessEqual(len(result['evidence']), 4)
        self.assertEqual({e['state'] for e in result['evidence']}, {'negative', 'recorded'})
        self.assertIn(8, [e['source_index'] for e in result['evidence']])
        unproven = topic_explanation(phone([spec('دوربین', 'ندارد'), spec('دوربین', 'اطلاعاتی در دسترس نیست')]), 'camera')
        self.assertEqual(unproven['status'], 'source_warning')
        zero = topic_explanation(phone([spec('دوربین', 'ندارد'), spec('دوربین', '۰ مگاپیکسل')]), 'camera')
        self.assertNotEqual(zero['status'], 'conflicting')

    def test_accessories_and_medical_devices_are_not_phone_capabilities(self):
        for category in ['باتری گوشی موبایل', 'گوشی پزشکی', None]:
            result = topic_explanation(phone([spec('دوربین', 'دارد')], category), 'camera')
            self.assertEqual(result['status'], 'not_assessed')
            self.assertEqual(result['evidence'], [])


class SearchExplanationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_api.CatalogueApiTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.catalogue = Catalogue(self.fixture.database)
        self.request = AssistantRequest(request_id='00000000-0000-0000-0000-000000000001',
                                        messages=[{'role': 'user', 'content': 'گوشی برای عکاسی می‌خواهم'}])

    def page(self, budget=None):
        return self.catalogue.search('گوشی', 12, 0, budget, category_name='گوشی موبایل')

    def test_budget_witness_is_source_exact_and_preserves_null_zero_large_money_and_multi_offer_records(self):
        result = explain_search(self.catalogue, self.page(733518940747298944), 'گوشی', '733518940747298944', self.request)
        one = next(p for p in result['products'] if p['product_id'] == 'product_one')
        self.assertEqual(one['budget_offer']['offer_id'], 'offer_a')
        self.assertEqual(one['budget_offer']['price_toman'], '120000')
        self.assertEqual(one['budget_offer']['inventory_status'], 'unconfirmed')
        self.assertEqual(one['suitability'], 'not_verified')
        with closing(sqlite3.connect(self.fixture.database)) as connection:
            connection.execute("UPDATE offers SET price_toman=0 WHERE offer_id='offer_a'")
            connection.commit()
        zero = explain_search(self.catalogue, self.page(0), 'گوشی', '0', self.request)
        self.assertEqual(zero['products'][0]['budget_offer']['price_toman'], '0')
        with closing(sqlite3.connect(self.fixture.database)) as connection:
            connection.execute("DELETE FROM offers WHERE offer_id='offer_a'")
            connection.commit()
        large = explain_search(self.catalogue, self.page(733518940747298944), 'گوشی', '733518940747298944', self.request)
        one = next(p for p in large['products'] if p['product_id'] == 'product_one')
        self.assertEqual(one['budget_offer']['price_toman'], '733518940747298944')
        self.assertEqual(one['budget_offer']['offer_id'], 'offer_b')
        self.assertEqual(self.catalogue.offers('product_one', 10, 0, None)['items'][-1]['offer_id'], 'offer_null')
        no_budget = explain_search(self.catalogue, self.page(), 'گوشی', None, self.request)
        self.assertTrue(all(p['budget_offer'] is None for p in no_budget['products']))

    def test_topics_survive_budget_history_and_explicit_context_but_clear_for_new_product_or_preference(self):
        page = ProductPage.model_validate(self.page())
        data = self.request.model_dump()
        data['messages'] += [{'role': 'assistant', 'content': 'سقف بودجه؟'}, {'role': 'user', 'content': 'ده میلیون تومان'}]
        self.assertEqual(review_topics(AssistantRequest(**data), page), ['camera'])
        data['context_topics'] = []
        self.assertEqual(review_topics(AssistantRequest(**data), page), [])
        data.update(context_topics=['camera'], messages=[{'role': 'user', 'content': 'باتری هم مهم است'}])
        self.assertEqual(review_topics(AssistantRequest(**data), page), ['camera', 'battery'])
        data['messages'] = [{'role': 'user', 'content': 'دوربین مهم نیست و باتری قوی می‌خواهم'}]
        self.assertEqual(review_topics(AssistantRequest(**data), page), ['battery'])
        shoe = self.catalogue.search('کفش', 12, 0, None)
        self.assertEqual(review_topics(AssistantRequest(**data), ProductPage.model_validate(shoe)), [])
        mixed = page.model_copy(deep=True)
        mixed.category_name = None
        mixed.items.append(phone([], 'گوشی پزشکی'))
        data['messages'] = [{'role': 'user', 'content': 'هشت میلیون تومان'}]
        self.assertEqual(review_topics(AssistantRequest(**data), mixed, 'کفش'), [])
        self.assertEqual(review_topics(AssistantRequest(**data), mixed, 'گوشی'), ['camera'])

    def test_empty_results_and_invalid_source_have_explicit_contracts(self):
        empty = self.page(0)
        result = explain_search(self.catalogue, empty, 'گوشی', '0', self.request)
        self.assertEqual(result['products'], [])
        self.assertEqual(result['provenance'], empty['provenance'])
        with patch.object(self.catalogue, 'offers', return_value=None), self.assertRaises(CatalogueUnavailable):
            explain_search(self.catalogue, self.page(1000000), 'گوشی', '1000000', self.request)
        with patch.object(self.catalogue, 'offers', return_value={'items': 'invalid'}), self.assertRaises(CatalogueUnavailable):
            explain_search(self.catalogue, self.page(1000000), 'گوشی', '1000000', self.request)
        wrong_offer = self.catalogue.offers('product_one', 1, 0, 1000000)
        wrong_offer['items'][0]['product_id'] = 'another_product'
        with patch.object(self.catalogue, 'offers', return_value=wrong_offer), self.assertRaises(CatalogueUnavailable):
            explain_search(self.catalogue, self.page(1000000), 'گوشی', '1000000', self.request)
        wrong_category = self.page()
        wrong_category['items'][0]['category_name'] = 'گوشی پزشکی'
        with self.assertRaises(CatalogueUnavailable):
            explain_search(self.catalogue, wrong_category, 'گوشی', None, self.request)
        broken = self.page()
        broken['items'][0]['specs'] = [{'key': 'دوربین', 'value': 123}]
        with self.assertRaises(CatalogueUnavailable):
            explain_search(self.catalogue, broken, 'گوشی', None, self.request)
