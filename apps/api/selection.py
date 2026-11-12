"""Explain a starting candidate from recorded facts, without certifying suitability."""
from dataclasses import dataclass, field
import re

from apps.api.category import CAT_MOBILE_PHONE
from apps.api.intent import AssistantRequest
from apps.api.models import Product, ProductPage
from tools.prepare_data import normalize_text
from apps.api.recorded_preferences import recorded_preference_score, recorded_need_evidence


@dataclass
class Selection:
    product_id: str | None
    summary: str
    evidence: dict[str, list[str]] = field(default_factory=dict)


def selection_context(request: AssistantRequest) -> str:
    # Old requests in a different category must not become current preferences.
    messages = [m.content for m in request.messages if m.role == 'user']
    context = normalize_text(' ؛ '.join(messages))
    if request.context_need_state:
        from apps.api.purchase_preferences import update_preferences, preferences_context, PATTERNS
        from apps.api.category import detect_category_intent
        current = detect_category_intent(request.messages[-1].content)
        changed = bool(current and request.context_category and current != request.context_category)
        preferences = update_preferences(request.context_need_state.preferences, request.messages[-1].content, changed)
        if changed:
            context = normalize_text(request.messages[-1].content)
        for key, pattern in PATTERNS.items():
            if key not in preferences:
                context = re.sub(pattern, ' ', context)
        context += ' ؛ ' + preferences_context(preferences)
    # Carry only typed review preferences already represented by the API state.
    # Other old needs cannot be recovered if the client did not send them.
    from apps.api.explanations import requested_review_topics, KEYWORDS
    topics = requested_review_topics(request)
    if request.category_cleared:
        topics = []
    from apps.api.category import detect_category_intent
    category = detect_category_intent(request.messages[-1].content)
    if category is not None and category != CAT_MOBILE_PHONE:
        topics = []
    for topic, pattern in KEYWORDS.items():
        if topic not in topics:
            context = re.sub(pattern, ' ', context)
    if 'camera' in topics and not re.search(r'دوربین|عکاسی|سلفی', context):
        context += ' دوربین'
    if 'battery' in topics and not re.search(r'باتری|باطری', context):
        context += ' باتری'
    return context


def facts_for(product: Product, context: str) -> tuple[int, list[str]]:
    parent = bool(re.search(r'پدر|مادر|سالمند|دکمه', context))
    walking = bool(re.search(r'پیاده|دویدن|ورزش', context))
    footwear = bool(re.search(r'کفش|کتانی|کتونی', product.category_name or ''))
    score, facts = 0, []
    # A positive row must not win when the same source key also says absent.
    contradicted = {normalize_text(s.key or '') for s in product.specs
                    if re.search(r'ندارد|نیست|فاقد|نامشخص|ثبت نشده', normalize_text(s.value or ''))}
    for spec in product.specs:
        key, value = normalize_text(spec.key or ''), normalize_text(spec.value or '')
        if key in contradicted or not value or re.search(r'نیست|ندارد|نامناسب|نامشخص|ثبت نشده|نمی', value):
            continue
        weight = 0
        if parent and product.category_name == CAT_MOBILE_PHONE:
            if re.search(r'پشتیبانی از زبان فارسی|کیبورد فارسی', key) and value in {'دارد', 'بله'}:
                weight = 2
            elif re.search(r'دکمه|بلندی صدا', key) and re.search(r'درشت|بزرگ|بلند', value):
                weight = 4
        elif walking and footwear:
            if re.search(r'کاربرد|مناسب برای', key) and re.search(r'پیاده|دویدن|ورزش', value):
                weight = 4
            elif key == 'کفی' and re.search(r'مموری فوم|راحتی|طبی', value):
                # A recorded construction detail, never proof of actual comfort.
                weight = 1
        elif product.category_name == CAT_MOBILE_PHONE:
            if re.search(r'باتری|باطری', context) and key == 'ظرفیت باتری' and product.battery_capacity and product.battery_capacity.status == 'known':
                weight = 1
            elif re.search(r'عکاسی|عکس گرفتن|دوربین|سلفی', context) and re.search(r'دوربین اصلی|دوربین سلفی', key):
                weight = 1
        if weight:
            score += weight
            facts.append(f'طبق مشخصات منبع، {spec.key}: {spec.value}')
    for weight, row in recorded_need_evidence(product.category_name, [s.model_dump() for s in product.specs], context):
        if product.category_name != CAT_MOBILE_PHONE:
            score += weight
            facts.append(f'طبق مشخصات منبع، {row["key"]}: {row["value"]}')
    return score, list(dict.fromkeys(facts))[:3]


def recommend_selection(page: ProductPage, request: AssistantRequest) -> Selection:
    if not page.items:
        return Selection(None, 'با این شرایط، محصولی در داده‌های ثبت‌شده پیدا نشد؛ بودجه یا نوع کالا را تغییر بدهیم.')
    context = selection_context(request)
    walking = bool(re.search(r'پیاده|دویدن|ورزش', context))
    footwear = any(re.search(r'کفش|کتانی|کتونی', p.category_name or '') for p in page.items)
    evidence = {p.product_id: facts_for(p, context)[1] for p in page.items}
    if re.search(r'خانواده|پرجمعیت', context) and any(re.search(r'یخچال|فریزر', p.category_name or '') for p in page.items):
        return Selection(None, 'یخچال‌های منطبق با شرایط ثبت‌شده را آوردم. برای خانواده، ارزان‌ترین مدل الزاماً مناسب نیست؛ چه ظرفیت یا ابعادی برای آشپزخانه نیاز داری؟ تا روشن شدن ظرفیت، مناسب بودن هیچ‌کدام را تأیید نمی‌کنم؛ مشخصات و موجودی را هم باید بررسی کنیم.', evidence)
    if walking and footwear and not re.search(r'مردانه|زنانه|بچگانه|کودک|دخترانه|پسرانه', context):
        return Selection(None, 'کفش‌های ثبت‌شده در این بودجه پیدا شدند. برای انتخاب مدل پیاده‌روی، کفش مردانه، زنانه یا کودک می‌خواهی؟ بعد سایز و کاربرد ثبت‌شده را بررسی می‌کنیم؛ قیمت کمتر به‌تنهایی راحتی یا تناسب را ثابت نمی‌کند.', evidence)
    first = min(page.items, key=lambda p: (-recorded_preference_score(p.category_name,[s.model_dump() for s in p.specs],context), -facts_for(p, context)[0],
        p.offer_summary.min_price_toman is None, int(p.offer_summary.min_price_toman or 0), p.product_id))
    facts = evidence[first.product_id]
    priced = [int(p.offer_summary.min_price_toman) for p in page.items if p.offer_summary.min_price_toman is not None]
    cheapest = first.offer_summary.min_price_toman is not None and int(first.offer_summary.min_price_toman) == min(priced)
    reason = '؛ '.join(facts[:2]) if facts else 'در میان نتایج فعلی کمترین قیمت ثبت‌شده را دارد' if cheapest else 'برای شروع بررسی مشخصات ثبت‌شده انتخاب شده؛ ارزان‌ترینِ همهٔ نتایج نیست'
    price = f' با قیمت ثبت‌شدهٔ {first.offer_summary.min_price_toman} تومان' if first.offer_summary.min_price_toman is not None else ''
    parent = bool(re.search(r'پدر|مادر|سالمند|دکمه', context)) and first.category_name == CAT_MOBILE_PHONE
    if parent:
        caution = 'اندازهٔ دکمه و بلندی صدا هنوز تأیید نشده؛ این دو مورد را پیش از مراجعه بپرس.'
    elif walking and footwear:
        caution = 'این مشخصات راحتی واقعی را ثابت نمی‌کنند؛ سایزهای کارت را با سایزت مقایسه کن و موجودی همان سایز را از فروشنده بپرس. پیش از خرید باید کفش را امتحان کنی.'
    elif first.category_name == CAT_MOBILE_PHONE and re.search(r'دوربین|عکاسی|عکس گرفتن|باتری|شارژدهی', context):
        caution = 'مقایسه بر پایهٔ مقادیر ثبت‌شده است؛ وضوح دوربین، کیفیت عکس از سوژهٔ متحرک را ثابت نمی‌کند و ظرفیت باتری هم تضمین دوام نیست. این نیاز را پیش از خرید بررسی کن.'
    else:
        caution = 'تناسب نهایی و موجودی هنوز باید بررسی شوند.'
    return Selection(first.product_id, f'برای شروع بررسی، «{first.persian_title}»{price}: {reason}. {caution} کارت همین مدل و فروشگاه‌هایش پایین در دسترس است.', evidence)


def ranking_need_context(state):
    """Identical stable source-ranking input for first and subsequent pages."""
    from apps.api.purchase_preferences import preferences_context
    if state.category_cleared:
        return ''
    return preferences_context(state.preferences) + ' ' + ' '.join(
        {'camera':'دوربین','battery':'باتری'}[topic] for topic in state.review_topics)
