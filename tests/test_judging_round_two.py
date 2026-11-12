"""Regressions from the second strict audit, using a controlled provider."""
import unittest

from apps.api.intent import explicit_budget, parse_toman
from apps.api.purchase_language import affirmative_purchase_text
from apps.api.ram import minimum_ram_gb, recorded_ram_gb
from apps.api.powerbank import minimum_powerbank_mah, recorded_powerbank_mah
from apps.api.model_comparison import revised_comparison_queries
from apps.api.shopping_intent import contradictory_brands, brand_choice_reply
from apps.api.models import ProductPage
from apps.api.selection import recommend_selection
from apps.api.intent import AssistantRequest
import test_audit_repair_regressions as fixtures
from uuid import uuid4
SNAPSHOT = fixtures.SNAPSHOT


class LanguageTests(unittest.TestCase):
    def test_correction_and_not_only_are_not_item_refusals(self):
        self.assertIn('لپتاپ', affirmative_purchase_text('نه من لپتاپ برای دانشگاه میخوام، سقف چهل میلیون'))
        self.assertIn('گوشی', affirmative_purchase_text('نه فقط گوشی، هدفون هم میخوام'))
        text = affirmative_purchase_text('پاوربانک میخوام، نه ماژول و نه باتری یدکی')
        self.assertNotIn('ماژول', text)
        self.assertNotIn('باتری', text)

    def test_exact_written_quantities(self):
        self.assertEqual(explicit_budget('شارژر تا نیم میلیون'), '500000')
        self.assertEqual(parse_toman('دوازده و نیم میلیون'), 12500000)
        with self.assertRaises(ValueError):
            parse_toman('نیم')
        for text, expected in [('رم حداقل شانزده گیگ', 16), ('رم بیشتر از ۱۶', 17),
                               ('حداقل سی و دو گیگ رم', 32), ('رم حداقل ۲۴ گیگ', 24)]:
            self.assertEqual(minimum_ram_gb(text), expected, text)

    def test_ordinal_replacement_and_ambiguity(self):
        prior = ['redmi note 10', 'سامسونگ a34']
        self.assertEqual(revised_comparison_queries('همون اولی رو با A55 عوض کن؛ دومی و بودجه همون بمونه', prior), ['a55', prior[1]])
        self.assertEqual(revised_comparison_queries('دومی رو با A55 عوض کن', prior), [prior[0], 'a55'])
        for text in ['سومی رو با A55 عوض کن', 'اولی رو با A34 عوض کن', 'همونو با A55 عوض کن']:
            self.assertEqual(revised_comparison_queries(text, prior), [], text)

    def test_brand_contradiction_is_not_a_negative_only_request(self):
        self.assertTrue(contradictory_brands('گوشی سامسونگ میخوام ولی اصلا سامسونگ نباشه، تا ده میلیون'))
        for text in ['گوشی غیرسامسونگ تا ده میلیون', 'سامسونگ نباشه', 'سامسونگ میخوام', 'سامسونگ نمیخوام؛ شیائومی میخوام']:
            self.assertFalse(contradictory_brands(text), text)
        self.assertEqual(brand_choice_reply('سامسونگ باشه', 'گوشی غیرسامسونگ غیرشیائومی'), 'گوشی غیرشیائومی سامسونگ')
        self.assertEqual(brand_choice_reply('سامسونگ نباشه', 'گوشی غیرشیائومی سامسونگ'), 'گوشی غیرشیائومی غیرسامسونگ')

    def test_powerbank_capacity_requires_consistent_unit_evidence(self):
        self.assertEqual(minimum_powerbank_mah('حداقل ظرفیت ۲۰۰۰۰ باشه'), 20000)
        self.assertEqual(minimum_powerbank_mah('ظرفیت حداقل بیست هزار میلی‌آمپر ساعت'), 20000)
        self.assertEqual(minimum_powerbank_mah('ظرفیت بیشتر از ۲۰ آمپر ساعت'), 20001)
        self.assertIsNone(minimum_powerbank_mah('ظرفیت حداقل ۲۰ وات ساعت'))
        category = 'پاور بانک'
        self.assertEqual(recorded_powerbank_mah(category, [{'key':'ظرفیت اسمی باتری','value':'اسمی: 20000 میلی امپر ساعت'}]), 20000)
        self.assertEqual(recorded_powerbank_mah(category, [{'key':'ظرفیت اسمی','value':'20000'}], 'پاوربانک ظرفیت ۲۰۰۰۰ میلی آمپر ساعت'), 20000)
        self.assertIsNone(recorded_powerbank_mah(category, [{'key':'ظرفیت اسمی','value':'20000'}]))
        self.assertIsNone(recorded_powerbank_mah(category, [{'key':'ظرفیت اسمی','value':'10000 mAh'}], 'پاوربانک ظرفیت ۲۰۰۰۰ میلی آمپر ساعت'))
        self.assertIsNone(recorded_powerbank_mah(category, [{'key':'ظرفیت اسمی','value':'20 Wh'}]))
        self.assertIsNone(recorded_powerbank_mah('باتری پاوربانک', [{'key':'ظرفیت اسمی','value':'20000 mAh'}]))


@unittest.skipUnless(SNAPSHOT.exists(), 'local catalogue snapshot not available')
class SourceDialogueTests(unittest.TestCase):
    setUp = fixtures.ShoppingAuditSourceTests.setUp
    turn = fixtures.ShoppingAuditSourceTests.turn

    def test_correction_reaches_new_laptop_and_budget(self):
        first = 'گوشی تا ده میلیون میخوام'
        original = self.turn(first)
        result = self.turn('نه من لپتاپ برای دانشگاه میخوام، سقف چهل میلیون', original, first)
        self.assertEqual(result['need_state']['topic_query'], 'لپ تاپ')
        self.assertEqual(result['max_price_toman'], '40000000')
        self.assertEqual(result['status'], 'results')
        self.assertTrue(result['products']['items'])

    def test_ordinal_edit_replaces_one_model_and_preserves_budget(self):
        first = 'Redmi Note 10 و سامسونگ A34 را مقایسه کن تا چهل میلیون'
        original = self.turn(first)
        result = self.turn('همون اولی رو با A55 عوض کن؛ دومی و بودجه همون بمونه', original, first)
        self.assertEqual(result['need_state']['comparison_queries'], ['a55', 'سامسونگ a34'])
        self.assertEqual(result['max_price_toman'], '40000000')

    def test_ambiguous_comparison_edit_asks_without_losing_choices(self):
        first = 'Redmi Note 10 و سامسونگ A34 را مقایسه کن تا چهل میلیون'
        prior = self.turn(first)
        result = self.turn('همونو با A55 عوض کن', prior, first)
        self.assertEqual(result['status'], 'needs_input')
        self.assertIsNone(result['products'])
        self.assertEqual(result['need_state']['comparison_queries'], prior['need_state']['comparison_queries'])
        self.assertEqual(result['max_price_toman'], '40000000')

    def test_half_million_and_written_strict_ram_reach_retrieval(self):
        charger = self.turn('شارژر تا نیم میلیون')
        self.assertEqual(charger['max_price_toman'], '500000')
        self.assertEqual(charger['question_code'], 'product_kind')
        self.assertFalse(charger['need_state']['budget_needs_input'])
        first = 'لپ تاپ برای برنامه نویسی تا شصت میلیون میخوام، رم حداقل شانزده گیگ'
        result = self.turn(first)
        self.assertEqual(result['need_state']['minimum_ram_gb'], 16)
        self.assertEqual(result['need_state']['pending_requirements'], [])
        strict = self.turn('رم بیشتر از ۱۶ باشه', result, first)
        self.assertEqual(strict['need_state']['minimum_ram_gb'], 17)
        self.assertEqual(strict['max_price_toman'], '60000000')
        self.assertEqual(strict['products']['items'], [])
        # This snapshot has no >16GB laptop below 60M; relaxing the filter would be wrong.
        page = self.client.get('/api/products', params={'q':'لپ تاپ','minimum_ram_gb':17,'limit':12}).json()
        self.assertTrue(page['items'])
        for product in page['items']:
            self.assertGreater(recorded_ram_gb(product['category_name'], product['specs']), 16)

    def test_contradictory_brand_asks_once_and_keeps_budget(self):
        first = 'گوشی سامسونگ میخوام ولی اصلا سامسونگ نباشه، تا ده میلیون'
        result = self.turn(first)
        self.assertEqual(result['status'], 'needs_input')
        self.assertIsNone(result['products'])
        self.assertEqual(result['max_price_toman'], '10000000')
        self.assertNotIn('سامسونگ', result['need_state']['topic_query'])
        later = self.turn('سامسونگ نباشه', result, first)
        self.assertEqual(later['status'], 'results')
        self.assertEqual(later['max_price_toman'], '10000000')

    def test_brand_answer_cannot_bypass_pending_battery_or_location(self):
        for first in ['گوشی سامسونگ با باتری قوی تا ده میلیون میخوام',
                      'گوشی سامسونگ از نزدیکترین فروشگاه تا ده میلیون میخوام']:
            prior = self.turn(first)
            self.assertEqual(prior['status'], 'needs_input', prior)
            later = self.turn('سامسونگ نباشه', prior, first)
            self.assertEqual(later['status'], 'needs_input', later)
            self.assertIsNone(later['products'])
            self.assertEqual(later['max_price_toman'], '10000000')
            self.assertIn(later['question_code'], ['battery_capacity', 'location'])

    def test_powerbank_minimum_survives_budget_pagination_destinations(self):
        first = 'پاوربانک تا دو میلیون میخوام، نه ماژول و نه باتری یدکی'
        original = self.turn(first)
        result = self.turn('حداقل ظرفیت ۲۰۰۰۰ باشه', original, first)
        self.assertEqual(result['need_state']['minimum_powerbank_mah'], 20000)
        self.assertEqual(result['need_state']['pending_requirements'], [])
        self.assertEqual(result['status'], 'results')
        self.assertTrue(result['products']['items'])
        self.assertEqual(result['max_price_toman'], '2000000')
        later = self.turn('بودجه سه میلیون باشد', result, first)
        self.assertEqual(later['need_state']['minimum_powerbank_mah'], 20000)
        for offset in [0, 3]:
            page = self.client.get('/api/products', params={'q':'پاوربانک','minimum_powerbank_mah':20000,'max_price_toman':'3000000','limit':3,'offset':offset}).json()
            for product in page['items']:
                self.assertGreaterEqual(recorded_powerbank_mah(product['category_name'],product['specs'],product['persian_title']), 20000)
        destinations = self.client.post('/api/local/destinations', json={'query':'پاوربانک','minimum_powerbank_mah':20000,'max_price_toman':'3000000','lat':35.7,'lon':51.4,'search_km':1000})
        self.assertEqual(destinations.status_code, 200, destinations.text)
        self.assertGreater(destinations.json()['matched_models'], 0)
        for identifier in destinations.json()['product_ids']:
            response = self.client.get('/api/products/' + identifier)
            self.assertEqual(response.status_code, 200, response.text)
            product = response.json()['product']
            self.assertGreaterEqual(recorded_powerbank_mah(product['category_name'],product['specs'],product['persian_title']), 20000)

    def test_camera_recommendation_does_not_claim_cheapest(self):
        result = self.turn('گوشی برای عکس گرفتن از بچه میخوام تا ده میلیون')
        page = ProductPage.model_validate(result['products'])
        selected = recommend_selection(page, AssistantRequest.model_validate({'request_id':str(uuid4()),'messages':[{'role':'user','content':'گوشی برای عکس گرفتن از بچه میخوام تا ده میلیون'}]}))
        candidate = next(p for p in page.items if p.product_id == selected.product_id)
        if int(candidate.offer_summary.min_price_toman) > min(int(p.offer_summary.min_price_toman) for p in page.items if p.offer_summary.min_price_toman is not None):
            self.assertNotIn('کمترین قیمت', selected.summary)
        self.assertIn('کیفیت', selected.summary)
