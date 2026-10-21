"""Deterministic category detection grounded in the catalogue snapshot.

Resolves product type vs accessories/parts based on head-noun structure.
No ML model, no arbitrary mappings, no external calls.
"""

from __future__ import annotations

import re
from tools.prepare_data import normalize_text

# Exact category names in the catalogue snapshot (products.category_name)
CAT_MOBILE_PHONE = "گوشی موبایل"
CAT_LAPTOP = "لپ تاپ و نوت بوک"
CAT_HEADPHONE = "هدفون، هدست و هندزفری"
CAT_SMARTWATCH = "ساعت و مچ بند هوشمند"
CAT_TABLET = "تبلت"
CAT_TV = "تلویزیون"
CAT_STETHOSCOPE = "گوشی پزشکی"

# Accessory / Part categories in the catalogue snapshot
CAT_PHONE_CASE = "کیف و کاور گوشی"
CAT_PHONE_CHARGER = "شارژر گوشی"
CAT_PHONE_BATTERY = "باتری گوشی موبایل"
CAT_PHONE_SCREEN_PROTECTOR = "محافظ صفحه نمایش گوشی"
CAT_PHONE_TABLET_HOLDER = "پایه نگهدارنده گوشی و تبلت"
CAT_PHONE_LCD = "تاچ و ال سی دی گوشی و تبلت"

CAT_LAPTOP_CASE = "کیف و کاور لپ تاپ"
CAT_LAPTOP_CHARGER = "شارژر لپ تاپ"
CAT_LAPTOP_BATTERY = "باتری لپ تاپ"
CAT_LAPTOP_STAND = "پایه نگهدارنده مانیتور و لپ تاپ"

CAT_SMARTWATCH_CHARGER = "شارژر ساعت هوشمند"
CAT_SMARTWATCH_PROTECTOR = "گلس و محافظ ساعت"

CAT_TABLET_CASE = "کیف و کاور تبلت"
CAT_TABLET_SCREEN_PROTECTOR = "محافظ صفحه نمایش تبلت"

CAT_TV_STAND = "پایه تلویزیون"
CAT_TV_TABLE = "میز تلویزیون"

ALL_GROUNDED_CATEGORIES = {
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
    CAT_PHONE_LCD,
    CAT_LAPTOP_CASE,
    CAT_LAPTOP_CHARGER,
    CAT_LAPTOP_BATTERY,
    CAT_LAPTOP_STAND,
    CAT_SMARTWATCH_CHARGER,
    CAT_SMARTWATCH_PROTECTOR,
    CAT_TABLET_CASE,
    CAT_TABLET_SCREEN_PROTECTOR,
    CAT_TV_STAND,
    CAT_TV_TABLE,
}

# Accessory head nouns in Persian ezafe or preposition compounds
# E.g. "کاور گوشی", "شارژر برای لپ تاپ", "پایه عکاسی برای گوشی"
ACCESSORY_NOUNS = (
    r"کیف|کاور|قاب|گارد|پوسته|کوله|"
    r"شارژر|آداپتور|کلگی|سیم|کابل(?:\s+شارژ)?|"
    r"باتری|باطری|"
    r"گلس|محافظ\s+صفحه(?:\s+نمایش)?|محافظ\s+لنز|"
    r"پایه(?:\s+نگهدارنده)?|هولدر|استند|کول\s*پد|"
    r"تاچ|ال\s*سی\s*دی|تاچ\s+و\s+ال\s*سی\s*دی|صفحه\s+نمایش|"
    r"دسته|قلم|بند|برد|فلت|شاسی|درب\s+پشت|اسپیکر|بلندگو|میکروفون|سنسور|دوربین|"
    r"لوازم\s+جانبی|قطعات|قطعه"
)

DEVICE_PHONE_REGEX = r"(?:گوشی|موبایل)"
DEVICE_LAPTOP_REGEX = r"(?:لپ\s*تاپ|لپتاپ|نوت\s*بوک|نوتبوک)"
DEVICE_TABLET_REGEX = r"(?:تبلت)"
DEVICE_WATCH_REGEX = r"(?:ساعت(?:\s+هوشمند)?|مچ\s*بند(?:\s+هوشمند)?|اسمارت\s*واچ)"
DEVICE_TV_REGEX = r"(?:تلویزیون|تی\s*وی)"
ANY_DEVICE_REGEX = (
    rf"(?:{DEVICE_PHONE_REGEX}|{DEVICE_LAPTOP_REGEX}|{DEVICE_TABLET_REGEX}|"
    rf"{DEVICE_WATCH_REGEX}|{DEVICE_TV_REGEX})"
)


def detect_category_intent(text: str) -> str | None:
    """Detect intended product category from text, respecting head-noun grammar.

    Returns the exact snapshot category_name if confidently determined,
    or None if ambiguous, unsupported, or conflicting.
    """
    if not text or not isinstance(text, str):
        return None

    cleaned = normalize_text(text).strip()
    if not cleaned:
        return None

    # Exact match with a known grounded category
    for cat in ALL_GROUNDED_CATEGORIES:
        if cleaned == normalize_text(cat):
            return cat

    # 1. Stethoscope: explicit medical device
    if re.search(r"\bگوشی\s+(?:های\s+)?پزشکی\b", cleaned):
        return CAT_STETHOSCOPE

    # 2. Check TV Furniture & Accessories
    if re.search(r"\bمیز\s+(?:برای\s+|واسه\s+)?تلویزیون\b", cleaned):
        return CAT_TV_TABLE
    if re.search(r"\b(?:پایه(?:\s+دیواری)?|براکت)\s+(?:برای\s+|واسه\s+)?تلویزیون\b", cleaned):
        return CAT_TV_STAND

    # 3. Check compound where accessory precedes device (e.g. "کاور گوشی", "شارژر برای لپ تاپ", "پایه عکاسی برای گوشی")
    # In Persian ezafe / preposition constructions:
    # <accessory> [words] (برای|واسه| ) <device> -> head noun is the accessory!
    acc_prefix_match = re.search(
        rf"\b(?P<acc>{ACCESSORY_NOUNS})\b.*?(?:برای\s+|واسه\s+|\s+)(?P<dev>{ANY_DEVICE_REGEX})\b",
        cleaned,
    )
    if acc_prefix_match:
        acc = acc_prefix_match.group("acc")
        dev = acc_prefix_match.group("dev")

        # Map to specific accessory categories if available in snapshot
        if re.search(DEVICE_PHONE_REGEX, dev):
            if re.search(r"^(?:کیف|کاور|قاب|گارد|پوسته)$", acc):
                return CAT_PHONE_CASE
            if re.search(r"^(?:شارژر|آداپتور|کلگی|کابل(?:\s+شارژ)?|سیم)$", acc):
                return CAT_PHONE_CHARGER
            if re.search(r"^(?:باتری|باطری)$", acc):
                return CAT_PHONE_BATTERY
            if re.search(r"^(?:گلس|محافظ\s+صفحه(?:\s+نمایش)?)$", acc):
                return CAT_PHONE_SCREEN_PROTECTOR
            if re.search(r"^(?:پایه(?:\s+نگهدارنده)?|هولدر|استند)$", acc):
                if re.search(r"\b(?:عکاسی|دوربین|نور|مونوپاد)\b", cleaned):
                    return None
                return CAT_PHONE_TABLET_HOLDER
            if re.search(r"^(?:تاچ|ال\s*سی\s*دی|تاچ\s+و\s+ال\s*سی\s*دی)$", acc):
                return CAT_PHONE_LCD
            # Other phone accessories (e.g. پایه عکاسی, بلندگو, سنسور) are accessories, NOT phones!
            return None

        if re.search(DEVICE_LAPTOP_REGEX, dev):
            if re.search(r"^(?:کیف|کاور|کوله)$", acc):
                return CAT_LAPTOP_CASE
            if re.search(r"^(?:شارژر|آداپتور|کابل(?:\s+شارژ)?)$", acc):
                return CAT_LAPTOP_CHARGER
            if re.search(r"^(?:باتری|باطری)$", acc):
                return CAT_LAPTOP_BATTERY
            if re.search(r"^(?:پایه(?:\s+نگهدارنده)?|استند|کول\s*پد)$", acc):
                return CAT_LAPTOP_STAND
            return None

        if re.search(DEVICE_TABLET_REGEX, dev):
            if re.search(r"^(?:کیف|کاور|قاب|گارد)$", acc):
                return CAT_TABLET_CASE
            if re.search(r"^(?:گلس|محافظ\s+صفحه(?:\s+نمایش)?)$", acc):
                return CAT_TABLET_SCREEN_PROTECTOR
            if re.search(r"^(?:پایه(?:\s+نگهدارنده)?|هولدر|استند)$", acc):
                if re.search(r"\b(?:عکاسی|دوربین|نور|مونوپاد)\b", cleaned):
                    return None
                return CAT_PHONE_TABLET_HOLDER
            return None

        if re.search(DEVICE_WATCH_REGEX, dev):
            if re.search(r"^(?:شارژر|آداپتور)$", acc):
                return CAT_SMARTWATCH_CHARGER
            if re.search(r"^(?:گلس|محافظ\s+صفحه(?:\s+نمایش)?)$", acc):
                return CAT_SMARTWATCH_PROTECTOR
            return None

        if re.search(DEVICE_TV_REGEX, dev):
            if re.search(r"^(?:پایه(?:\s+نگهدارنده)?|استند|براکت)$", acc):
                return CAT_TV_STAND
            return None

        return None

    # Also check if device is preceded by "برای" or "واسه" (e.g. "... برای گوشی")
    # If device is after "برای" / "واسه", it's the target platform, not the item being bought!
    if re.search(rf"\b(?:برای|واسه)\s+{ANY_DEVICE_REGEX}\b", cleaned):
        return None

    # 4. Check base devices (device is head noun)
    has_phone = bool(re.search(rf"\b{DEVICE_PHONE_REGEX}\b", cleaned))
    has_laptop = bool(re.search(rf"\b{DEVICE_LAPTOP_REGEX}\b", cleaned))
    has_headphone = bool(re.search(r"\b(?:هدفون|هدست|هندزفری|ایرپاد)\b", cleaned))
    has_smartwatch = bool(re.search(r"\b(?:ساعت\s+هوشمند|مچ\s*بند\s+هوشمند|اسمارت\s*واچ)\b", cleaned))
    has_tablet = bool(re.search(rf"\b{DEVICE_TABLET_REGEX}\b", cleaned))
    has_tv = bool(re.search(rf"\b{DEVICE_TV_REGEX}\b", cleaned))

    detected_devices = []
    if has_phone:
        detected_devices.append(CAT_MOBILE_PHONE)
    if has_laptop:
        detected_devices.append(CAT_LAPTOP)
    if has_headphone:
        detected_devices.append(CAT_HEADPHONE)
    if has_smartwatch:
        detected_devices.append(CAT_SMARTWATCH)
    if has_tablet:
        detected_devices.append(CAT_TABLET)
    if has_tv:
        detected_devices.append(CAT_TV)

    # If multiple different devices mentioned (e.g. "گوشی و لپ تاپ"), ambiguous
    if len(detected_devices) > 1:
        return None

    if len(detected_devices) == 1:
        return detected_devices[0]

    # Bare "ساعت" without "هوشمند" or "مچ بند" is intentionally ambiguous
    # Single-word accessory ("شارژر", "باتری", "کاور") without device is intentionally ambiguous.
    return None
