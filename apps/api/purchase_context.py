"""Shared boundaries between a purchase, its properties and a target device."""
import re
from tools.prepare_data import normalize_text


def credit_preference(text: str) -> bool:
    return bool(re.search(r'قسطی|اقساط|اعتباری|ترب\s*پی|torob\s*pay', normalize_text(text)))


def released_brand_topic(text: str, topic: str | None) -> str | None:
    if not topic:
        return None
    text, topic = normalize_text(text), normalize_text(topic)
    match = re.search(r'(\S+)(?:\s+(?:برام|برای من))?\s+مهم\s+نیست', text)
    if not match or match[1] in {'قیمت', 'بودجه', 'رنگ', 'سایز', 'باتری', 'ظرفیت', 'فاصله'}:
        return None
    brand = match[1]
    if brand not in topic.split() or brand in {'گوشی', 'موبایل', 'شارژر', 'کابل', 'کفش', 'هدفون'}:
        return None
    return ' '.join(word for word in topic.split() if word != brand) or None


def purchase_question(text: str) -> bool:
    """Questions about an existing choice do not request another product."""
    text = normalize_text(text)
    if re.search(r'به جای|عوض کن|جدید.*می\s*خوا|دیگه.*می\s*خوا', text):
        return False
    return bool(re.search(r'(?:چرا|دلیل).*(?:انتخاب|پیشنهاد|همین|این فروشگاه)|'
                          r'(?:این|همین|همون|اولی|دومی|سومی).*(?:می\s*خوره|سازگار|مناسب.*هست)|'
                          r'(?:سازگاری|سازگار بودن).*(?:این|همین|مدل)', text))


def retained_identity(latest: str, previous: str | None, proposed: str | None) -> str | None:
    """A field edit may shorten a repeated head, not silently erase its qualifiers."""
    if not previous or not proposed:
        return proposed
    text = normalize_text(latest)
    released = released_brand_topic(latest, previous)
    if released:
        return released
    if (re.search(r'بودجه|قیمت|میلیون|تومان|رنگ|سایز|درگاه', text)
            and not re.search(r'به جای|نوع.*عوض|مدل.*(?:دیگه|دیگر)|فرقی ن(?:داره|دارد)', text)
            and set(normalize_text(proposed).split()) < set(normalize_text(previous).split())):
        return previous
    return proposed


def refines_purchase(text: str, topic: str | None, category: str | None = None) -> bool:
    if not topic:
        return False
    text = normalize_text(text)
    if released_brand_topic(text, topic):
        return True
    if credit_preference(text) and not re.search(r'گوشی|موبایل|شارژر|کابل|کفش|هدفون|پاوربانک|لپ\s*تاپ', text):
        return True
    if purchase_question(text):
        return True
    from apps.api.purchase_preferences import PATTERNS
    if (any(re.search(pattern,text) for pattern in PATTERNS.values())
            and re.search(r'مهم نیست|حذف کن|بردار|اولویت|مهم است|مهمه',text)
            and not re.search(r'گوشی|موبایل|لپ\s*تاپ|کفش|کتانی|هدفون|شارژر|کابل|یخچال|لباسشویی',text)):
        return True
    from apps.api.category import detect_category_intent
    current = category or detect_category_intent(topic)
    # A tool command about this purchase must not become a new literal product
    # such as 'مقصد قابل مراجعه'. Unknown nouns still take the normal topic path.
    command_words=set('خودت نزدیک نزدیکترین ترین کوتاه کوتاهترین سریع سریعترین ارزان ارزون تر بهترین مقصد قابل مراجعه را رو انتخاب انتخابش کن کنید تصمیم بگیر برای من برام بهم همین این محصول کالا فروشگاه جا جای شروع کنم حرکت مسیر پیاده ماشین خودرو دوچرخه بریم برم برنامه رفتن تعیین آماده بچین با به و از بین گزینه ها گزینهها یکی اولی دومی سومی'.split())
    words=re.findall(r'[^\W_]+',text)
    if (re.search(r'انتخاب(?:ش)?\s*(?:کن|کنید)|تصمیم\s*بگیر|برنامه.*بچین|مسیر.*(?:تعیین|آماده)\s*کن',text)
            and words and all(word in command_words for word in words)):
        return True
    if re.match(r'^(?:کدامشان|کدومشون|از این(?:ها| ها)|بین این(?:ها| ها))\b', text):
        return True
    # A target device after "for" describes the existing accessory. A request
    # explicitly naming a new accessory/device continues through normal routing.
    if normalize_text(topic).startswith(('شارژر', 'کابل', 'کیف', 'قاب', 'کاور', 'محافظ', 'باتری')):
        return bool(re.match(r'^(?:برای|واسه|مخصوص)\s+(?:گوشی|موبایل|دستگاه|مدل|سامسونگ|ردمی|آیفون|لپ\s*تاپ)', text)
                    and not re.search(r'خود\s+(?:گوشی|لپ\s*تاپ).*(?<![\wن])می\s*خوا|به\s*جای|عوض', text))
    if current == 'گوشی موبایل':
        explicit_part = re.search(r'(?:خود|حالا|فعلا|یک|یه)\s+(?:باتری|دوربین)\b.*می\s*خوا|^(?:باتری|دوربین)\s+(?:گوشی|ردمی|سامسونگ|شیائومی)\b.*می\s*خوا', text)
        preference = re.search(r'دوام|شارژدهی|سبک|اندروید|دوربین\s+(?:خوب|مناسب|قوی)|باتری\s+(?:خوب|قوی)|(?:برای\s+)?عکس\s*گرفتن|(?:باتری|دوربین).*(?:مهم|اولویت)', text)
        return bool(preference and not explicit_part
                    and not re.search(r'لپ\s*تاپ|شارژر|کفش|پاوربانک|هدفون', text))
    return False


def accessory_target(text: str) -> bool:
    text = normalize_text(text)
    return bool(re.search(r'ردمی|note\s*\d|نوت\s*\d|a\d{2}|iphone\s*\d|آیفون\s*\d', text, re.I))
