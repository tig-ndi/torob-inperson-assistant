"""Deterministic retrieval reasons and source spec review; no suitability score or LLM call."""

import re
from decimal import Decimal

from pydantic import ValidationError

from apps.api.catalogue import Catalogue, CatalogueUnavailable
from apps.api.category import CAT_MOBILE_PHONE, detect_category_intent
from apps.api.intent import AssistantRequest
from apps.api.models import OfferPage, Product, ProductPage, SearchExplanation
from tools.prepare_data import normalize_text


TOPICS = {'camera': 'دوربین', 'battery': 'باتری'}
KEYWORDS = {'camera': r'دوربین|عکاسی|سلفی|\bcamera\b|\bphotography\b', 'battery': r'باتری|باطری|\bbattery\b'}


def review_topics(request: AssistantRequest, page: ProductPage, query: str | None = None) -> list[str]:
    if page.category_name != CAT_MOBILE_PHONE and not any(p.category_name == CAT_MOBILE_PHONE for p in page.items):
        return []
    if page.category_name != CAT_MOBILE_PHONE and query is not None:
        query_category = detect_category_intent(query)
        if query_category is not None and query_category != CAT_MOBILE_PHONE:
            return []
        if query_category is None and not all(p.category_name == CAT_MOBILE_PHONE for p in page.items):
            return []  # A stray phone in an unfiltered mixed result is not proof of the active topic.
    return requested_review_topics(request)


def requested_review_topics(request: AssistantRequest) -> list[str]:
    """User review preferences only; the caller must verify the product scope."""
    # An explicit context field supersedes old history; [] also clears it.
    if request.context_topics is not None:
        topics = list(request.context_topics)
        messages = request.messages[-1:]
    else:
        topics, messages = [], request.messages
    for message in messages:
        if message.role != 'user':
            continue
        text = normalize_text(message.content)
        category = detect_category_intent(text)
        if category is not None and category != CAT_MOBILE_PHONE:
            topics = []
            continue
        mentioned, removed = [], []
        for clause in re.split(r'[؛;،,.؟!\n]|\b(?:ولی|اما)\b|\s+و\s+(?=(?:دوربین|باتری|باطری)\b)', text):
            for topic, pattern in KEYWORDS.items():
                if re.search(pattern, clause):
                    if re.search(r'مهم نیست|اهمیتی ندارد|نمی\s*(?:خواهم|خوام)', clause):
                        removed.append(topic)
                    else:
                        mentioned.append(topic)
        if mentioned:
            topics = topics + mentioned if re.search(r'\bهم\b', text) else mentioned
        topics = [topic for topic in topics if topic not in removed]
    return [topic for topic in TOPICS if topic in topics]


def source_state(value: str | None) -> str:
    text = normalize_text(value or '').strip(' .،؛:')
    if text in {'', '-', '—', 'null', 'none', 'undefined', 'title', 'n/a', 'نامشخص', 'ثبت نشده'}:
        return 'unknown'
    if re.fullmatch(r'ندارد|خیر|فاقد(?: دوربین)?|بدون\s*دوربین|no|no camera|not supported', text):
        return 'negative'
    return 'recorded'


def affirmative_value(value: str | None) -> bool:
    """Only explicit presence or a positive measured value can contradict absence."""
    text = normalize_text(value or '').strip(' .،؛:').replace('٬', '').replace('٫', '.')
    if text in {'دارد', 'بله', 'yes', 'با دوربین'}:
        return True
    measured = re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)\s*(?:مگا\s*پیکسل|megapixels?|mp|mah|میلی\s*آمپر\s*ساعت)', text)
    return measured is not None and Decimal(measured[1]) > 0


def topic_explanation(product: Product, topic: str) -> dict:
    label = TOPICS[topic]
    if normalize_text(product.category_name or '') != CAT_MOBILE_PHONE:
        return {'topic': topic, 'status': 'not_assessed', 'summary': 'این بررسی محدود به دستهٔ منبع گوشی موبایل است.', 'evidence_count': 0, 'evidence': []}
    entries = []
    grouped: dict[tuple[str, str], set[str]] = {}
    for index, spec in enumerate(product.specs):
        key, section = normalize_text(spec.key or ''), normalize_text(spec.section or '')
        matches = (re.search(r'دوربین|\bcamera\b', key) or re.fullmatch(r'دوربین(?: ها)?', section)) if topic == 'camera' else (
            re.search(r'باتری|باطری|\bbattery\b', key) or section in {'باتری', 'باطری', 'battery'})
        if not matches:
            continue
        state = source_state(spec.value)
        entries.append({'source_index': index, 'section': spec.section, 'key': spec.key, 'value': spec.value, 'state': state})
        states = grouped.setdefault((section, key), set())
        states.add(state)
        if state == 'recorded' and affirmative_value(spec.value):
            states.add('affirmative')
    conflicting = any({'affirmative', 'negative'} <= states for states in grouped.values())
    if conflicting:
        status, summary = 'conflicting', f'در مشخصات هم‌عنوانِ {label} داده‌های ناسازگار ثبت شده؛ تناسب با نیاز تأیید نمی‌شود.'
    elif any(e['state'] == 'negative' for e in entries):
        status, summary = 'source_warning', f'برای برخی ویژگی‌های {label} نبود قابلیت ثبت شده است؛ کلید و مقدار منبع را بررسی کنید.'
    elif any(e['state'] == 'recorded' for e in entries):
        status, summary = 'recorded', f'دادهٔ مرتبط با {label} ثبت شده است؛ این داده به‌تنهایی کیفیت واقعی را تأیید نمی‌کند.'
    else:
        status, summary = 'missing', f'دادهٔ قابل اتکا برای بررسی {label} در فیلدهای شناخته‌شده پیدا نشد؛ نبود قابلیت نتیجه گرفته نمی‌شود.'
    # Preserve warnings and both sides of a conflict in the bounded preview.
    conflict_keys = {key for key, states in grouped.items() if {'affirmative', 'negative'} <= states}
    witnesses = set()
    if conflict_keys:
        first_key = next(key for key in grouped if key in conflict_keys)
        for state in ['negative', 'recorded']:
            witnesses.add(next(e['source_index'] for e in entries if e['state'] == state and (state == 'negative' or affirmative_value(e['value'])) and
                               (normalize_text(e['section'] or ''), normalize_text(e['key'] or '')) == first_key))
    entries.sort(key=lambda e: (0 if e['source_index'] in witnesses else
                               1 if e['state'] == 'negative' else 2 if e['state'] == 'recorded' else 3, e['source_index']))
    return {'topic': topic, 'status': status, 'summary': summary, 'evidence_count': len(entries), 'evidence': entries[:4]}


def explain_search(catalogue: Catalogue, raw_page: dict, query: str, budget: str | None, request: AssistantRequest) -> dict:
    try:
        page = ProductPage.model_validate(raw_page)
    except ValidationError as exc:
        raise CatalogueUnavailable('invalid source page') from exc
    topics = review_topics(request, page, query)
    products = []
    for product in page.items:
        reasons = [f'این کالا در بازیابی لفظی کاتالوگ برای «{query}» آمده است.']
        if page.category_name is not None:
            if product.category_name != page.category_name:
                raise CatalogueUnavailable('source category mismatch')
            reasons.append(f'دستهٔ منبع با فیلتر «{page.category_name}» مطابقت دارد.')
        budget_offer = None
        if page.min_battery_capacity_mah is not None:
            capacity = product.battery_capacity
            if capacity is None or capacity.status != 'known' or capacity.capacity_mah is None or capacity.capacity_mah < page.min_battery_capacity_mah:
                raise CatalogueUnavailable('source capacity mismatch')
            reasons.append(f'ظرفیت ثبت‌شدهٔ باتری {capacity.capacity_mah} میلی‌آمپرساعت، حداقل {page.min_battery_capacity_mah} را دارد؛ دوام واقعی باتری تأیید نمی‌شود.')
        if budget is not None:
            offers = catalogue.offers(product.product_id, 1, 0, int(budget))
            if offers is None:
                raise CatalogueUnavailable('qualifying source offer unavailable')
            try:
                offer_page = OfferPage.model_validate(offers)
            except ValidationError as exc:
                raise CatalogueUnavailable('invalid source offer page') from exc
            if not offer_page.items:
                raise CatalogueUnavailable('qualifying source offer unavailable')
            offer = offer_page.items[0].model_dump()
            if offer['product_id'] != product.product_id or offer_page.provenance.snapshot_id != page.provenance.snapshot_id:
                raise CatalogueUnavailable('misattributed source offer')
            if offer['price_toman'] is None or int(offer['price_toman']) > int(budget):
                raise CatalogueUnavailable('invalid qualifying source offer')
            budget_offer = {key: offer[key] for key in ['offer_id', 'product_id', 'shop_id', 'price_toman', 'last_price_changed_at', 'inventory_status']}
            budget_offer['selection_basis'] = 'lowest_recorded_qualifying_price_then_offer_id'
            reasons.append(f'یک آفر تاریخی با قیمت ثبت‌شدهٔ {offer["price_toman"]} تومان، زیر یا برابر سقف {budget} تومان است؛ موجودی تأیید نشده است.')
        products.append({'product_id': product.product_id, 'reasons': reasons, 'budget_offer': budget_offer,
                         'topics': [topic_explanation(product, topic) for topic in topics], 'suitability': 'not_verified',
                         'battery_capacity': product.battery_capacity.model_dump() if product.battery_capacity else None})
    result = {'query': query, 'category_name': page.category_name, 'max_price_toman': budget,
              'ranking_basis': 'lexical_match_then_product_id', 'topics': topics,
              'summary': 'دلیل بازیابی و شواهد ثبت‌شده برای بررسی آمده‌اند؛ ترتیب نتایج بر اساس تطابق لفظی و شناسهٔ کالا است.',
              'limitations': ['تناسب کاربرد، کیفیت عکاسی و دوام واقعی باتری از این پاسخ به‌تنهایی تأیید نمی‌شوند.',
                              'بررسی موضوعی فعلی به فیلدهای شناخته‌شدهٔ دوربین و باتری گوشی محدود است؛ سایر نیازها ارزیابی نشده‌اند.',
                              'قیمت و آفر تاریخی‌اند؛ موجودی و پذیرش فروشنده برای مراجعه هنوز باید تأیید شوند.'],
              'products': products, 'provenance': page.provenance.model_dump()}
    result['min_battery_capacity_mah'] = page.min_battery_capacity_mah
    if page.min_battery_capacity_mah is not None:
        result['limitations'].append('فیلتر ظرفیت فقط بر ظرفیت دقیق ثبت‌شدهٔ گوشی اعمال شده؛ داده‌های نامعلوم، ناسازگار و بدون واحد کنار گذاشته شده‌اند.')
    try:
        return SearchExplanation.model_validate(result).model_dump()
    except ValidationError as exc:
        raise CatalogueUnavailable('invalid source explanation') from exc
