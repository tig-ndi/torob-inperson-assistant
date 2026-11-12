"""Grounded recommendation regressions, using synthetic product facts only."""
import unittest
from apps.api.selection import recommend_selection
from apps.api.intent import AssistantRequest
from apps.api.models import ProductPage
from test_explanations import phone, spec
from test_assistant import body

def item(id,price,specs,category='گوشی موبایل'):
    p=phone(specs,category)
    p.product_id=id
    p.offer_summary.min_price_toman=str(price)
    return p

def page(items):
    return ProductPage(items=items,has_more=False,limit=12,offset=0,provenance={'snapshot_id':'test','dataset':'synthetic','generated_at_utc':'2026-11-02T00:00:00Z','currency':'toman','inventory_status':'unconfirmed'})

class SelectionTests(unittest.TestCase):
    def select(self,text,items):
        return recommend_selection(page(items),AssistantRequest.model_validate(body(text)))

    def test_photography_reason_quotes_source_instead_of_claiming_cheapest(self):
        for text in ['گوشی برای عکس گرفتن از بچه', 'گوشی برای عکاسی']:
            result = self.select(text, [item('cheap', 1, []),
                item('camera', 2, [spec('دوربین اصلی', '50 مگاپیکسل')])])
            self.assertEqual(result.product_id, 'camera')
            self.assertIn('طبق مشخصات منبع، دوربین اصلی: 50 مگاپیکسل', result.summary)
            self.assertNotIn('کمترین قیمت', result.summary)
            self.assertIn('کیفیت عکس', result.summary)

    def test_recorded_walk_construction_beats_cheaper_model_with_no_use_evidence(self):
        result=self.select('کفش زنانه برای پیاده‌روی روزانه',[
            item('cheap',1,[],'کفش زنانه'),item('facts',2,[spec('کفی','مموری فوم')],'کفش زنانه')])
        self.assertEqual(result.product_id,'facts')
        self.assertIn('مموری فوم',result.summary)
        self.assertIn('موجودی همان سایز',result.summary)
        self.assertIn('راحتی واقعی را ثابت نمی',result.summary)

    def test_nonphone_source_backed_use_beats_cheaper_unrecorded_option(self):
        for category, need, key, value in [
            ('لپ تاپ و نوت بوک', 'لپ تاپ برای برنامه نویسی', 'کاربری', 'برنامه نویسی، دانشجویی'),
            ('هدفون، هدست و هندزفری', 'هدفون با حذف نویز فعال', 'حذف نویز', 'ANC'),
            ('ماشین لباسشویی', 'ماشین لباسشویی کم مصرف', 'نمودار مصرف انرژی', 'A+++'),
        ]:
            with self.subTest(category=category):
                result = self.select(need, [item('cheap', 1, [], category), item('recorded', 2, [spec(key, value)], category)])
                self.assertEqual(result.product_id, 'recorded')
                self.assertIn(value, result.summary)
                self.assertIn('طبق مشخصات منبع', result.summary)

    def test_enc_is_not_evidence_of_active_headphone_noise_cancellation(self):
        category = 'هدفون، هدست و هندزفری'
        result = self.select('هدفون با ANC', [
            item('enc', 1, [spec('نویز کنسلینگ', 'ENC')], category),
            item('anc', 2, [spec('نویز کنسلینگ', 'ANC')], category)])
        self.assertEqual(result.product_id, 'anc')
        self.assertEqual(result.evidence['enc'], [])

    def test_nonphone_contradictions_and_negative_claims_do_not_earn_ranking(self):
        category = 'هدفون، هدست و هندزفری'
        for rows in [[spec('حذف نویز', 'ANC ندارد')], [spec('حذف نویز', 'بدون ANC')],
                     [spec('حذف نویز', 'ANC غیرفعال')], [spec('حذف نویز', 'ANC'), spec('حذف نویز', 'ندارد')]]:
            result = self.select('هدفون با ANC', [item('bad', 1, rows, category), item('good', 2, [spec('حذف نویز', 'ANC')], category)])
            self.assertEqual(result.product_id, 'good')
            self.assertEqual(result.evidence['bad'], [])

    def test_refused_nonphone_preference_does_not_earn_a_source_bonus(self):
        category = 'هدفون، هدست و هندزفری'
        result = self.select('هدفون میخواهم؛ حذف نویز فعال مهم نیست', [
            item('cheap', 1, [], category), item('anc', 2, [spec('حذف نویز', 'ANC')], category)])
        self.assertEqual(result.product_id, 'cheap')

    def test_light_laptop_uses_explicit_units_and_not_an_unknown_number(self):
        category = 'لپ تاپ و نوت بوک'
        result = self.select('لپ تاپ سبک برای حمل', [
            item('unitless', 1, [spec('وزن', '0.1')], category),
            item('heavy', 2, [spec('وزن', '2.5 کیلوگرم')], category),
            item('light', 3, [spec('وزن', '1200 گرم')], category)])
        self.assertEqual(result.product_id, 'light')
        self.assertEqual(result.evidence['unitless'], [])

    def test_typed_review_memory_affects_ranking_after_short_followups(self):
        request = AssistantRequest.model_validate(body('بودجه را تغییر دادم', context_query='گوشی',
            context_category='گوشی موبایل', context_topics=['camera']))
        result = recommend_selection(page([item('none', 1, []), item('camera', 2, [spec('دوربین اصلی', '50 مگاپیکسل')])]), request)
        self.assertEqual(result.product_id, 'camera')

    def test_latest_review_release_does_not_keep_camera_ranking(self):
        request = AssistantRequest.model_validate(body('دوربین مهم نیست', context_query='گوشی',
            context_category='گوشی موبایل', context_topics=['camera']))
        result = recommend_selection(page([item('cheap', 1, []), item('camera', 2, [spec('دوربین اصلی', '50 مگاپیکسل')])]), request)
        self.assertEqual(result.product_id, 'cheap')

    def test_laptop_ram_and_family_capacity_compare_only_recorded_quantities(self):
        for category, need, key, lower, higher in [
            ('لپ تاپ و نوت بوک', 'لپ تاپ برای برنامه نویسی', 'حافظه رم', '8 گیگابایت', '32 گیگابایت'),
            ('ماشین لباسشویی', 'ماشین لباسشویی برای خانواده پرجمعیت', 'ظرفیت دیگ', '6 کیلوگرم', '10 کیلوگرم'),
        ]:
            with self.subTest(category=category):
                result = self.select(need, [item('lower', 1, [spec(key, lower)], category), item('higher', 2, [spec(key, higher)], category)])
                self.assertEqual(result.product_id, 'higher')
                self.assertIn(higher, result.summary)

    def test_negative_walking_claim_does_not_earn_preference(self):
        result=self.select('کفش زنانه برای پیاده‌روی',[
            item('no',2,[spec('مناسب برای','برای پیاده‌روی مناسب نیست')],'کفش زنانه'),item('yes',3,[spec('کاربرد','پیاده‌روی')],'کفش زنانه')])
        self.assertEqual(result.product_id,'yes')
        self.assertEqual(result.evidence['no'],[])

    def test_missing_audience_asks_before_naming_a_best_shoe(self):
        result=self.select('برای پیاده‌روی کفش می‌خواهم',[item('child',1,[],'کفش کودک')])
        self.assertIsNone(result.product_id)
        self.assertIn('مردانه، زنانه یا کودک',result.summary)

    def test_parent_phone_reason_is_recorded_and_never_invents_loudness(self):
        result=self.select('برای مادرم گوشی با دکمه درشت و صدای بلند می‌خواهم',[
            item('cheap',1,[]),item('fa',2,[spec('کیبورد فارسی','دارد')])])
        self.assertEqual(result.product_id,'fa')
        self.assertIn('کیبورد فارسی: دارد',result.summary)
        self.assertIn('هنوز تأیید نشده',result.summary)

    def test_recommendation_is_source_id_and_exact_large_price_order(self):
        products=[item('higher',9007199254740993,[]),item('lower',9007199254740992,[])]
        result=self.select('گوشی می‌خواهم',products)
        self.assertEqual(result.product_id,'lower')
        self.assertIn('9007199254740992',result.summary)

    def test_conflicting_positive_source_row_does_not_earn_preference(self):
        result=self.select('گوشی برای مادرم',[
            item('conflict',1,[spec('کیبورد فارسی','دارد'),spec('کیبورد فارسی','ندارد')]),
            item('consistent',2,[spec('کیبورد فارسی','دارد')])])
        self.assertEqual(result.product_id,'consistent')
        self.assertEqual(result.evidence['conflict'],[])
