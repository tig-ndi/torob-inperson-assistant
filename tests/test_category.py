import unittest

from apps.api.category import (
    detect_category_intent,
    is_ambiguous_product_intent,
    is_bare_watch,
    resolve_accessory_category,
    CAT_MOBILE_PHONE,
    CAT_LAPTOP,
    CAT_HEADPHONE,
    CAT_SMARTWATCH,
    CAT_TABLET,
    CAT_TV,
    CAT_STETHOSCOPE,
    CAT_PHONE_CASE,
    CAT_PHONE_CHARGER,
    CAT_PHONE_BATTERY,
    CAT_PHONE_SCREEN_PROTECTOR,
    CAT_PHONE_TABLET_HOLDER,
    CAT_LAPTOP_CASE,
    CAT_LAPTOP_CHARGER,
    CAT_LAPTOP_BATTERY,
    CAT_SMARTWATCH_CHARGER,
    CAT_TV_STAND,
    CAT_TV_TABLE,
)


class TestCategoryDetector(unittest.TestCase):
    def test_base_devices(self):
        self.assertEqual(detect_category_intent("گوشی"), CAT_MOBILE_PHONE)
        self.assertEqual(detect_category_intent("موبایل"), CAT_MOBILE_PHONE)
        self.assertEqual(detect_category_intent("گوشی سامسونگ A54"), CAT_MOBILE_PHONE)
        self.assertEqual(detect_category_intent("گوشی شیائومی نوت ۱۳"), CAT_MOBILE_PHONE)
        self.assertEqual(detect_category_intent("لپ تاپ"), CAT_LAPTOP)
        self.assertEqual(detect_category_intent("لپتاپ"), CAT_LAPTOP)
        self.assertEqual(detect_category_intent("نوت بوک"), CAT_LAPTOP)
        self.assertEqual(detect_category_intent("لپ تاپ ایسوس ویووبوک"), CAT_LAPTOP)
        self.assertEqual(detect_category_intent("هدفون"), CAT_HEADPHONE)
        self.assertEqual(detect_category_intent("هدست گیمینگ"), CAT_HEADPHONE)
        self.assertEqual(detect_category_intent("هندزفری بی سیم"), CAT_HEADPHONE)
        self.assertEqual(detect_category_intent("ایرپاد پرو"), CAT_HEADPHONE)
        self.assertEqual(detect_category_intent("ساعت هوشمند"), CAT_SMARTWATCH)
        self.assertEqual(detect_category_intent("مچ بند هوشمند"), CAT_SMARTWATCH)
        self.assertEqual(detect_category_intent("اسمارت واچ سامسونگ"), CAT_SMARTWATCH)
        self.assertEqual(detect_category_intent("تبلت"), CAT_TABLET)
        self.assertEqual(detect_category_intent("تبلت سامسونگ"), CAT_TABLET)
        self.assertEqual(detect_category_intent("تلویزیون"), CAT_TV)
        self.assertEqual(detect_category_intent("تلویزیون ۵۵ اینچ"), CAT_TV)

    def test_medical_phone_not_mobile(self):
        self.assertEqual(detect_category_intent("گوشی پزشکی"), CAT_STETHOSCOPE)
        self.assertEqual(detect_category_intent("گوشی های پزشکی لیتمن"), CAT_STETHOSCOPE)

    def test_device_with_features_is_device(self):
        # Device is head noun; features/uses are modifiers
        self.assertEqual(detect_category_intent("گوشی با باتری قوی"), CAT_MOBILE_PHONE)
        self.assertEqual(detect_category_intent("گوشی با رم ۸ گیگابایت"), CAT_MOBILE_PHONE)
        self.assertEqual(detect_category_intent("گوشی سامسونگ با باتری ۵۰۰۰"), CAT_MOBILE_PHONE)
        self.assertEqual(detect_category_intent("گوشی برای عکاسی"), CAT_MOBILE_PHONE)
        self.assertEqual(detect_category_intent("لپ تاپ با رم ۱۶"), CAT_LAPTOP)
        self.assertEqual(detect_category_intent("لپ تاپ برای برنامه نویسی"), CAT_LAPTOP)
        self.assertEqual(detect_category_intent("لپ تاپ برای بازی"), CAT_LAPTOP)
        self.assertEqual(detect_category_intent("لپ تاپ با شارژر فابریک"), CAT_LAPTOP)
        self.assertEqual(detect_category_intent("لپ تاپ ایسوس برای گیمینگ"), CAT_LAPTOP)
        self.assertEqual(detect_category_intent("ساعت هوشمند با قابلیت مکالمه"), CAT_SMARTWATCH)
        self.assertEqual(detect_category_intent("گوشی برای بازی تا ۱۰ میلیون"), CAT_MOBILE_PHONE)

    def test_accessories_as_head_noun_not_device(self):
        # Accessory is head noun, NOT device
        self.assertEqual(detect_category_intent("کاور گوشی"), CAT_PHONE_CASE)
        self.assertEqual(detect_category_intent("قاب گوشی"), CAT_PHONE_CASE)
        self.assertEqual(detect_category_intent("گارد گوشی سامسونگ"), CAT_PHONE_CASE)
        self.assertEqual(detect_category_intent("کیف گوشی"), CAT_PHONE_CASE)
        self.assertEqual(detect_category_intent("شارژر گوشی"), CAT_PHONE_CHARGER)
        self.assertEqual(detect_category_intent("شارژر برای گوشی"), CAT_PHONE_CHARGER)
        self.assertEqual(detect_category_intent("آداپتور موبایل"), CAT_PHONE_CHARGER)
        self.assertEqual(detect_category_intent("باتری گوشی"), CAT_PHONE_BATTERY)
        self.assertEqual(detect_category_intent("باطری موبایل"), CAT_PHONE_BATTERY)
        self.assertEqual(detect_category_intent("گلس گوشی"), CAT_PHONE_SCREEN_PROTECTOR)
        self.assertEqual(detect_category_intent("محافظ صفحه گوشی"), CAT_PHONE_SCREEN_PROTECTOR)
        self.assertEqual(detect_category_intent("پایه نگهدارنده گوشی"), CAT_PHONE_TABLET_HOLDER)
        self.assertEqual(detect_category_intent("هولدر گوشی"), CAT_PHONE_TABLET_HOLDER)

        # Laptop accessories
        self.assertEqual(detect_category_intent("شارژر لپ تاپ"), CAT_LAPTOP_CHARGER)
        self.assertEqual(detect_category_intent("شارژر برای لپ تاپ"), CAT_LAPTOP_CHARGER)
        self.assertEqual(detect_category_intent("کیف لپ تاپ"), CAT_LAPTOP_CASE)
        self.assertEqual(detect_category_intent("کاور لپ تاپ"), CAT_LAPTOP_CASE)
        self.assertEqual(detect_category_intent("کوله لپ تاپ"), CAT_LAPTOP_CASE)
        self.assertEqual(detect_category_intent("باتری لپ تاپ"), CAT_LAPTOP_BATTERY)

        # Smartwatch accessory
        self.assertEqual(detect_category_intent("شارژر ساعت هوشمند"), CAT_SMARTWATCH_CHARGER)

        # TV accessories
        self.assertEqual(detect_category_intent("پایه تلویزیون"), CAT_TV_STAND)
        self.assertEqual(detect_category_intent("میز تلویزیون"), CAT_TV_TABLE)

    def test_unsupported_or_generic_accessory_not_mapped_to_device(self):
        # Even if not mapped to a specific category, it must NEVER be mapped to the base device!
        self.assertIsNone(detect_category_intent("پایه عکاسی برای گوشی"))
        self.assertIsNone(detect_category_intent("سنسور گوشی"))
        self.assertIsNone(detect_category_intent("لوازم جانبی گوشی"))

    def test_ambiguous_queries(self):
        # Ambiguous single words without device or category
        self.assertIsNone(detect_category_intent("شارژر"))
        self.assertIsNone(detect_category_intent("باتری"))
        self.assertIsNone(detect_category_intent("کاور"))
        self.assertIsNone(detect_category_intent("ساعت"))  # without هوشمند could be anything
        self.assertIsNone(detect_category_intent("گوشی و لپ تاپ"))  # conflicting devices
        self.assertIsNone(detect_category_intent("کفش ورزشی"))  # out of scope
        self.assertIsNone(detect_category_intent(""))
        self.assertIsNone(detect_category_intent("   "))

    def test_exact_categories(self):
        self.assertEqual(detect_category_intent("گوشی موبایل"), CAT_MOBILE_PHONE)
        self.assertEqual(detect_category_intent("لپ تاپ و نوت بوک"), CAT_LAPTOP)
        self.assertEqual(detect_category_intent("هدفون، هدست و هندزفری"), CAT_HEADPHONE)
        self.assertEqual(detect_category_intent("ساعت و مچ بند هوشمند"), CAT_SMARTWATCH)

    def test_bare_watch_detection(self):
        self.assertTrue(is_bare_watch("ساعت"))
        self.assertTrue(is_bare_watch("ساعت می‌خوام"))
        self.assertTrue(is_bare_watch("ساعت مردانه تا ۲ میلیون"))
        self.assertFalse(is_bare_watch("ساعت هوشمند"))
        self.assertFalse(is_bare_watch("ساعت مچی عقربه‌ای"))
        self.assertFalse(is_bare_watch("ساعت دیواری"))
        self.assertFalse(is_bare_watch("گوشی"))
        self.assertFalse(is_bare_watch(""))

    def test_resolve_accessory_with_context(self):
        # Phone context + accessory
        self.assertEqual(resolve_accessory_category("شارژر", context_category=CAT_MOBILE_PHONE), CAT_PHONE_CHARGER)
        self.assertEqual(resolve_accessory_category("کاور", context_category=CAT_MOBILE_PHONE), CAT_PHONE_CASE)
        self.assertEqual(resolve_accessory_category("باتری", context_query="گوشی سامسونگ A54"), CAT_PHONE_BATTERY)

        # Laptop context + accessory
        self.assertEqual(resolve_accessory_category("شارژر", context_category=CAT_LAPTOP), CAT_LAPTOP_CHARGER)
        self.assertEqual(resolve_accessory_category("کیف", context_query="لپ تاپ ایسوس"), CAT_LAPTOP_CASE)
        self.assertEqual(resolve_accessory_category("باتری", context_category=CAT_LAPTOP), CAT_LAPTOP_BATTERY)

        # Non-accessory text does not resolve
        self.assertIsNone(resolve_accessory_category("بودجه را ۸ میلیون کن", context_category=CAT_MOBILE_PHONE))
        self.assertIsNone(resolve_accessory_category("کفش ورزشی", context_category=CAT_MOBILE_PHONE))

    def test_is_ambiguous_product_intent(self):
        # 1. Bare accessories without device or context are ambiguous
        self.assertTrue(is_ambiguous_product_intent("شارژر"))
        self.assertTrue(is_ambiguous_product_intent("شارژر می‌خواهم"))
        self.assertTrue(is_ambiguous_product_intent("دنبال یک باتری خوب هستم"))
        self.assertTrue(is_ambiguous_product_intent("کاور"))
        self.assertTrue(is_ambiguous_product_intent("هولدر"))
        self.assertTrue(is_ambiguous_product_intent("گلس"))
        self.assertTrue(is_ambiguous_product_intent("ساعت"))
        self.assertTrue(is_ambiguous_product_intent("ساعت می‌خوام"))

        # 2. Accessories with target device in text are NOT ambiguous
        self.assertFalse(is_ambiguous_product_intent("شارژر لپ تاپ"))
        self.assertFalse(is_ambiguous_product_intent("شارژر برای لپ تاپ ایسوس"))
        self.assertFalse(is_ambiguous_product_intent("کاور گوشی"))
        self.assertFalse(is_ambiguous_product_intent("باتری آیفون"))
        self.assertFalse(is_ambiguous_product_intent("شارژر مک بوک"))
        self.assertFalse(is_ambiguous_product_intent("ساعت هوشمند"))

        # 3. Base devices are NOT ambiguous
        self.assertFalse(is_ambiguous_product_intent("گوشی"))
        self.assertFalse(is_ambiguous_product_intent("گوشی با باتری قوی"))
        self.assertFalse(is_ambiguous_product_intent("لپ تاپ"))
        self.assertFalse(is_ambiguous_product_intent("هدفون بی سیم"))

        # 4. Out-of-scope / unsupported products are NOT ambiguous
        self.assertFalse(is_ambiguous_product_intent("کفش ورزشی"))
        self.assertFalse(is_ambiguous_product_intent("یخچال ساید بای ساید"))
        self.assertFalse(is_ambiguous_product_intent("تلویزیون سونی"))
        self.assertFalse(is_ambiguous_product_intent("سونی"))

        # 5. Accessories with active context topic are NOT ambiguous (independent of category_cleared)
        self.assertFalse(is_ambiguous_product_intent("شارژر", context_category=CAT_MOBILE_PHONE))
        self.assertFalse(is_ambiguous_product_intent("کاور", context_query="گوشی سامسونگ"))
        self.assertFalse(is_ambiguous_product_intent("شارژر", context_category=CAT_MOBILE_PHONE, category_cleared=True))
        self.assertFalse(is_ambiguous_product_intent("کاور", context_query="گوشی سامسونگ", category_cleared=True))

        # 6. Accessories without valid context topic remain ambiguous (even with category_cleared=True)
        self.assertTrue(is_ambiguous_product_intent("شارژر", category_cleared=True))
        self.assertTrue(is_ambiguous_product_intent("کاور", context_query="کفش ورزشی"))

    def test_stethoscope_topic_is_not_a_mobile_device_even_without_category(self):
        for category in [CAT_STETHOSCOPE, None]:
            self.assertIsNone(resolve_accessory_category('شارژر', context_category=category, context_query='گوشی پزشکی'))
            self.assertTrue(is_ambiguous_product_intent('شارژر', context_category=category, context_query='گوشی پزشکی'))


if __name__ == "__main__":
    unittest.main()
