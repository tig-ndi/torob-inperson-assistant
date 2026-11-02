"""Everyday wording keeps the active product and independent constraints."""
import unittest
from apps.api.intent import AssistantRequest, IntentPlan, query_choices, proposed_budget
from apps.api.need_state import update_pending, is_need_control
from apps.api.battery_intent import resolve_requirement
from apps.api.models import PendingRequirement
from apps.api.purchase_language import affirmative_purchase_text
from apps.api.intent import product_span
from test_assistant import body, phone_battery_state

class RefinementContinuity(unittest.TestCase):
    def request(self,text,**state):
        payload=body(text,context_need_state=phone_battery_state(**state))
        payload.pop('max_price_toman')
        return AssistantRequest.model_validate(payload)

    def test_budget_edit_with_retain_rest_cannot_displace_the_product(self):
        request=self.request('بودجه را به سه میلیون تومان تغییر بده، بقیهٔ شرایط همان باشد.',topic_query='گوشی دکمه ای')
        self.assertEqual(query_choices(request),['گوشی دکمه ای'])
        self.assertEqual(proposed_budget(IntentPlan(action='search',query='گوشی دکمه ای',budget_text=None,question=None),request),'3000000')

    def test_keep_budget_with_other_edit_is_not_an_unquantified_budget_change(self):
        request=self.request('حداقل ظرفیت باتری را بردار، بودجه را حفظ کن.',max_price_toman='10000000')
        self.assertEqual(query_choices(request),['گوشی'])
        self.assertEqual(proposed_budget(IntentPlan(action='search',query='گوشی',budget_text=None,question=None),request),'10000000')
        self.assertEqual(resolve_requirement(request,True).status,'no_minimum')

    def test_do_not_filter_size_removes_only_size_and_retains_other_requirements(self):
        pending=[PendingRequirement(key='سایز',source_text='سایز ۳۸'),PendingRequirement(key='رنگ',source_text='مشکی')]
        for text in ['سایز را فعلاً فیلتر نکن','سایز رو اعمال نکن','سایز را در نظر نگیر']:
            with self.subTest(text=text):
                self.assertTrue(is_need_control(text))
                self.assertEqual([p.key for p in update_pending(pending,text).items],['رنگ'])

    def test_do_not_remove_still_retains_the_capacity(self):
        request=self.request('حداقل ظرفیت باتری را برندار')
        self.assertEqual(resolve_requirement(request,True).minimum_mah,5000)

    def test_explicit_refusal_keeps_the_other_purchase_and_accessory_head(self):
        self.assertNotIn('گوشی',affirmative_purchase_text('گوشی نمی‌خواهم؛ کفش زنانه می‌خواهم'))
        names=['گوشی موبایل','کفش زنانه','شارژر گوشی','فیلتر هوا']
        self.assertEqual(product_span('گوشی نمی‌خواهم؛ کفش زنانه می‌خواهم',names,set()),'کفش زنانه')
        self.assertEqual(product_span('برای گوشی می‌خواهم؛ شارژر موبایل تا یک میلیون تومان.',names,set()),'شارژر موبایل')
