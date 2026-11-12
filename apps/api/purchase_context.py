"""Shared boundaries between a purchase, its properties and a target device."""
import re
from tools.prepare_data import normalize_text
from apps.api.purchase_language import affirmative_purchase_text


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
    from apps.api.shopping_intent import brand_choice_reply
    brand_reply = brand_choice_reply(latest, previous)
    if brand_reply:
        return brand_reply
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
    from apps.api.shopping_intent import brand_choice_reply
    if brand_choice_reply(text, topic):
        return True
    if released_brand_topic(text, topic):
        return True
    # A subordinate condition/property cannot introduce a new purchase. Only
    # an explicit replacement or an affirmative request for another family can.
    if re.search(r'به\s*جای|بجای|این بار|عوض.*(?:کالا|محصول)', text):
        return False
    from apps.api.category import detect_category_intent
    current_category = category or detect_category_intent(topic)
    named = detect_category_intent(affirmative_purchase_text(text))
    explicit_new = bool(named and current_category and named != current_category
                        and re.search(r'(?<![\wن])می\s*خوا|دنبال|لازم دارم', text)
                        and not re.match(r'^(?:اگر|اگه|برای|واسه)', text))
    head = re.search(r'(?<!\w)(گوشی|موبایل|کابل|شارژر|هدفون|هندزفری|پاور\s*بانک|کفش|کتانی|لپ\s*تاپ|باتری|یخچال)\b', affirmative_purchase_text(text))
    target_reply = topic.startswith(('شارژر','کابل','کیف','قاب','کاور','محافظ','باتری')) and re.match(r'^(?:برای|واسه|مخصوص)\s+(?:گوشی|موبایل|دستگاه|مدل|سامسونگ|ردمی|آیفون|لپ\s*تاپ)', text)
    if head and not target_reply and not re.match(r'^(?:اگر|اگه)\b', text) and re.search(r'(?<![\wن])می\s*خوا|لازم دارم|دنبال', text):
        canonical = lambda value: re.sub(r'\s+', '', value).replace('موبایل','گوشی').replace('کتانی','کفش').replace('هندزفری','هدفون')
        different_head = not canonical(topic).startswith(canonical(head[1]))
        battery_property = head[1] == 'باتری' and bool(re.search(r'باتری\s+(?:حداقل|قوی|خوب)|میلی\s*آمپر',text))
        explicit_new = explicit_new or different_head and not battery_property
    if re.search(r'برگردیم|برگرد به', text) and named == current_category:

        return True
    if not explicit_new and (re.match(r'^(?:اگر|اگه)\b', text)
            or re.search(r'درگاه|تایپ\s*سی|میکرو\s*usb|لایتنینگ|\bpd\b|\bpps\b|\bqc\b|\d+\s*وات', text, re.I)
            or re.search(r'(?<!\w)(?:رم|حافظه)\s*(?:حداقل\s*)?(?:\d+|بماند|بمونه|همان|همون)', text)
            or re.search(r'همان دستگاه|همون دستگاه|(?:مدل|کابل).*متری|انتقال داده|فقط شارژ|ENC|enc|ANC|anc|مصرف انرژی|در مشخصات|حذف نویز|بی\s*سیم|هر دو برند|هر دو شرط', text)
            or re.search(r'(?:همان|همون)\s+بودجه|بودجه.*(?:کن|بماند|بمونه)', text)
            or re.search(r'قیمت ثبت.*قیمت پاسخ|رزرو.*(?:قطعی|واقعی)|زنگ بزن', text)
            or re.search(r'\S+\s+(?:هم\s+)?نمی\s*خوا', text)
            or re.search(r'(?:رنگ|سفید|مشکی|سیاه|آبی).*(?:نباش|مهم نیست)', text)
            or re.search(r'حداقل\s+\d|ظرفیت.*\d|بدون حداقل باتری', text)):
        return True
    if (re.search(r'ظرفیت|کیلو(?:گرم)?|حذف\s+نویز|مسافرتی|سفری|فندکی', text)
            and re.search(r'قبول|حداقل|مهم نیست|نمی\s*خوا|نباش|بردار', text)
            and not re.search(r'گوشی|موبایل|لپ\s*تاپ|کفش|هدفون|یخچال|لباسشویی', text)):
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


def cumulative_brand_topic(query: str, previous: str | None, latest: str, same_purchase: bool) -> str:
    """Exclusions remain literal predicates in the existing topic contract."""
    from apps.api.shopping_intent import MODEL_WORDS, brand_exclusions, positive_brand_query
    text = normalize_text(latest)
    exclusions = brand_exclusions(previous or '') if same_purchase else []
    for aliases in MODEL_WORDS:
        if any(re.search(re.escape(word) + r'(?:\s+هم)?(?:\s+(?:را|رو))?\s+(?:نمی\s*خوا(?:هم|م)|نمی\s*خوام|نباش)', text) for word in aliases):
            if aliases not in exclusions:
                exclusions.append(aliases)
    for aliases in brand_exclusions(query) + brand_exclusions(latest):
        if aliases not in exclusions:
            exclusions.append(aliases)
    base = positive_brand_query(query)
    return (base + ''.join(' غیر' + aliases[0] for aliases in exclusions)).strip()


def factual_question(text: str) -> str | None:
    text = normalize_text(text)
    if re.search(r'(?<![\wن])می\s*خوا|لازم دارم|دنبال', text):
        return None
    if re.search(r'رزرو.*(?:قطعی|واقعی|شد)|زنگ بزن|تماس واقعی', text):
        return 'نه؛ تماس واقعی یا رزرو قطعی انجام نشده است. پاسخ و رزرو آزمایشی، بدون ارتباط واقعی با فروشنده‌اند. شرایط خریدت محفوظ است.'
    if re.search(r'قیمت ثبت.*قیمت پاسخ|قیمت پاسخ.*قیمت ثبت', text):
        return 'نه؛ قیمت ثبت‌شده از دادهٔ منبع است و قیمت پاسخ فروشنده از نتیجهٔ بررسی فروشنده. اگر پاسخ آزمایشی باشد، قیمت آن تأیید واقعی نیست. موجودی هم مستقل از قیمت نیاز به بررسی دارد. شرایط خریدت محفوظ است.'
    return None


async def restore_purchase(catalogue, request):
    """Recover only the explicitly named prior purchase from supplied human history.

    The browser persists full typed snapshots; this covers API clients that send
    an older purchase in their bounded history. No inferred or seller facts enter.
    """
    from apps.api.category import detect_category_intent
    from apps.api.purchase_language import affirmative_purchase_text
    from apps.api.intent import product_span, explicit_budget
    from apps.api.battery_intent import resolve_requirement
    from apps.api.need_state import resolve_need_state
    latest = request.messages[-1].content
    if not re.search(r'برگردیم|برگرد به', normalize_text(latest)):
        return request
    category = detect_category_intent(latest)
    if not category:
        return request
    index = next((i for i in range(len(request.messages)-2,-1,-1)
                  if request.messages[i].role == 'user'
                  and detect_category_intent(affirmative_purchase_text(request.messages[i].content)) == category), None)
    if index is None:
        return request
    categories, words = catalogue.category_names(), catalogue.identity_words()
    state = None
    for message in request.messages[index:-1]:
        if message.role != 'user':
            continue
        named = detect_category_intent(affirmative_purchase_text(message.content))
        span = product_span(message.content,categories,words)
        if named and named != category or state and span and span.split()[0] != state.topic_query.split()[0] and not refines_purchase(message.content,state.topic_query,category):
            break
        topic = product_span(message.content,categories,words) if state is None else state.topic_query
        if not topic:
            continue
        try:
            budget = explicit_budget(message.content) or (state.max_price_toman if state else None)
        except ValueError:
            return request  # Ambiguous old amounts are not restorable evidence.
        replay = request.model_copy(update={'messages':[message], 'context_need_state':state,
            'context_query':state.topic_query if state else None, 'context_category':category,
            'context_battery_requirement':state.battery_requirement if state else None,
            'max_price_toman':budget})
        battery = resolve_requirement(replay,category == 'گوشی موبایل')
        state = (await resolve_need_state(catalogue,replay,topic,category,budget,battery,'price')).state
    if state is None:
        return request
    from apps.api.shopping_intent import platform_topic
    state = state.model_copy(update={'topic_query':platform_topic(state.topic_query,request.messages[index].content,None,category)})
    return request.model_copy(update={'context_need_state':state,'context_query':state.topic_query,
        'context_category':category,'context_battery_requirement':state.battery_requirement,
        'context_topics':state.review_topics,'max_price_toman':state.max_price_toman,
        'context_offer_sort':state.offer_sort})
