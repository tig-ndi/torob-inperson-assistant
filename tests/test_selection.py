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

    def test_recorded_walk_construction_beats_cheaper_model_with_no_use_evidence(self):
        result=self.select('کفش زنانه برای پیاده‌روی روزانه',[
            item('cheap',1,[],'کفش زنانه'),item('facts',2,[spec('کفی','مموری فوم')],'کفش زنانه')])
        self.assertEqual(result.product_id,'facts')
        self.assertIn('مموری فوم',result.summary)
        self.assertIn('موجودی همان سایز',result.summary)
        self.assertIn('راحتی واقعی را ثابت نمی',result.summary)

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
