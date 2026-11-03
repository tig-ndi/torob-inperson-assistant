"""Shared boundaries between a purchase, its properties and a target device."""
import re
from tools.prepare_data import normalize_text


def refines_purchase(text: str, topic: str | None, category: str | None = None) -> bool:
    if not topic:
        return False
    text = normalize_text(text)
    from apps.api.category import detect_category_intent
    current = category or detect_category_intent(topic)
    if re.match(r'^(?:کدامشان|کدومشون|از این(?:ها| ها)|بین این(?:ها| ها))\b', text):
        return True
    # A target device after "for" describes the existing accessory. A request
    # explicitly naming a new accessory/device continues through normal routing.
    if (current or '').startswith(('شارژر', 'کیف', 'محافظ', 'باتری')):
        return bool(re.match(r'^(?:برای|واسه|مخصوص)\s+(?:گوشی|موبایل|دستگاه|مدل|سامسونگ|ردمی|آیفون|لپ\s*تاپ)', text)
                    and not re.search(r'خود\s+(?:گوشی|لپ\s*تاپ).*می\s*خوا|به\s*جای|عوض', text))
    if current == 'گوشی موبایل':
        explicit_part = re.search(r'(?:خود|حالا|فعلا|یک|یه)\s+(?:باتری|دوربین)\b.*می\s*خوا|^(?:باتری|دوربین)\s+(?:گوشی|ردمی|سامسونگ|شیائومی)\b.*می\s*خوا', text)
        preference = re.search(r'دوام|شارژدهی|سبک|اندروید|دوربین\s+(?:خوب|مناسب|قوی)|باتری\s+(?:خوب|قوی)|(?:برای\s+)?عکس\s*گرفتن|(?:باتری|دوربین).*(?:مهم|اولویت)', text)
        return bool(preference and not explicit_part
                    and not re.search(r'لپ\s*تاپ|شارژر|کفش|پاوربانک|هدفون', text))
    return False


def accessory_target(text: str) -> bool:
    text = normalize_text(text)
    return bool(re.search(r'ردمی|note\s*\d|نوت\s*\d|a\d{2}|iphone\s*\d|آیفون\s*\d', text, re.I))
