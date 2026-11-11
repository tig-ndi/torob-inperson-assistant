"""Request-scoped transitions for unresolved source-field requests, not filters.

Text is preserved as untrusted evidence of a request, never executed or treated as
a product fact. Only explicit, local removal phrases may discard a requirement.
"""

from dataclasses import dataclass
import asyncio
import re
from typing import TYPE_CHECKING

from apps.api.models import PendingRequirement, AssistantNeedState, BatteryRequirement
from apps.api.category import detect_category_intent
from apps.api.purchase_language import affirmative_purchase_text
from apps.api.shopping_intent import operating_system, negated_operating_system
from apps.api.purchase_preferences import update_preferences, minimum_capacity, update_excluded_kinds
from tools.prepare_data import normalize_text

if TYPE_CHECKING:
    from apps.api.catalogue import Catalogue
    from apps.api.intent import AssistantRequest


FIELDS = ('رنگ', 'سایز', 'اندازه', 'جنس', 'حافظه', 'رم', 'وزن', 'توان', 'گارانتی', 'قسطی', 'سیستم عامل', 'درگاه', 'ظرفیت', 'طول', 'کاربری', 'پروتکل')
GENERIC_RELEASE = {'بدون این شرط', 'بدون این فیلتر'}
ALL_RELEASE = {'همه شرط های اجرا نشده را حذف کن', 'همه شرط های حل نشده را حذف کن',
               'همه فیلترهای اجرا نشده را حذف کن'}
CONTINUE = {'ادامه بده', 'ادامه', 'باشه', 'بله', 'آره', 'اره', 'اوکی'}
FIELD_PATTERN = re.compile(r'(?<!\w)(' + '|'.join(FIELDS) + r')(?:ش|اش|م|مون|و)?(?!\w)')


def generic_release(text: str) -> bool:
    cleaned = normalize_text(text).strip(' .!؟')
    first, *rest = re.split(r'[،؛,;]', cleaned, maxsplit=1)
    if not re.fullmatch(r'بدون این (?:شرط|فیلتر)(?:\s+(?:ادامه(?:\s+بده)?|بگرد|جستجو\s*کن))?', first.strip()):
        return False
    return not rest or bool(re.match(r'^\s*(?:سقف\s+)?بودجه\b', rest[0]) and not FIELD_PATTERN.search(rest[0]))


def field_is_negated(clause: str, literal: str) -> bool:
    """Distinguish "no warranty" from a positive field request.

    Value negation such as "the blue one is not acceptable" must not discard the
    field itself; only absence/refusal patterns adjacent to the field do.
    """
    before = re.search(r'(?<!\w)(?:بدون|بی)\s+(?:هیچ\s+|این\s*که\s+)?' + literal + r'(?!\w)', clause)
    after = re.search(
        literal + r'(?:\s+(?:را|رو))?\s*(?:نمی\s*خواه(?:م|ی|د|یم|ند)|نمی\s*خوام|'
        r'نمی\s*خوایم|نمی\s*خواین|ندار(?:م|ی|د|ه)|نداشته|نباش(?:ه|د)|'
        r'لازم\s+نیست|نیازی\s+نیست|نیست)(?!\w)', clause)
    return bool(before or after)


@dataclass(frozen=True)
class PendingUpdate:
    items: list[PendingRequirement]
    clarification: str | None = None
    controlled: bool = False


def is_need_control(text: str, *, include_ack: bool = False) -> bool:
    text = normalize_text(text)
    return (generic_release(text) or text in ALL_RELEASE or include_ack and text in CONTINUE or
            bool(re.search(r'(?:حذف|بردار|مهم نیست|بی خیال|صرف نظر|فیلتر نکن|اعمال نکن|در نظر نگیر|کنار بگذار)', text)
                 and (FIELD_PATTERN.search(text) or re.search(r'(?:حداقل\s+(?:ظرفیت\s+)?|ظرفیت\s+)(?:باتری|باطری)',text) or 'فاصله' in text
                      or re.search(r'سیستم\s*عامل|اندروید|android|ios', text)
                      or 'شرط' in text and ('اجرا نشده' in text or 'حل نشده' in text))))


def update_pending(items: list[PendingRequirement], text: str, *, supported_fields: tuple[str, ...] = ()) -> PendingUpdate:
    from apps.api.visit_intent import referenced_colour
    cleaned = normalize_text(text)
    if cleaned in ALL_RELEASE:
        return PendingUpdate([], controlled=True)
    if generic_release(cleaned):
        if not items:
            # No pending source-field constraint: let battery/scope handling own
            # the phrase instead of interpreting it as a deletion of that state.
            return PendingUpdate([])
        if len(items) == 1:
            return PendingUpdate([], controlled=True)
        return PendingUpdate(list(items), 'requirement_choice', True)
    updated = {normalize_text(item.key): item for item in items if item.key not in supported_fields}
    if 'رنگ' not in supported_fields and referenced_colour(cleaned) and not re.search(r'(?<!\w)رنگ(?:ش|اش)?(?!\w)', cleaned):
        updated['رنگ'] = PendingRequirement(key='رنگ', source_text=text)
    if re.search(r'(?<!\w)سبک(?:\s+باشد|\s+باشه|\s+می|\s+و|$)', cleaned):
        updated['وزن'] = PendingRequirement(key='وزن', source_text=text)
    from apps.api.source_filters import connector
    if 'درگاه' not in supported_fields and connector(cleaned):
        updated['درگاه'] = PendingRequirement(key='درگاه', source_text=text)
    from apps.api.source_filters import COLOURS
    if 'رنگ' not in supported_fields and any(re.search(re.escape(colour) + r'(?:ش)?\s+(?:(?:را|رو)\s+)?(?:نباش|نمی\s*خوا|نمیخوام)', cleaned) for colour in COLOURS):
        updated['رنگ'] = PendingRequirement(key='رنگ', source_text=text)
    if re.search(r'\d+\s*وات', cleaned):
        updated['توان'] = PendingRequirement(key='توان', source_text=text)
    if re.search(r'(?<!\w)(?:pd|pps|qc)(?!\w)', cleaned, re.I) and re.search(r'لازم|می\s*خوا|باید', cleaned):
        updated['پروتکل'] = PendingRequirement(key='پروتکل', source_text=text)
    if re.search(r'انتقال داده', cleaned) and not re.search(r'انتقال داده.*(?:مهم نیست|لازم نیست)', cleaned):
        updated['کاربری'] = PendingRequirement(key='کاربری', source_text=text)
    if re.search(r'(?:\d+(?:\.\d+)?|یک|دو|سه|نیم)\s*متری', cleaned):
        updated['طول'] = PendingRequirement(key='طول', source_text=text)
    controlled = False
    operations: dict[str, set[str]] = {}
    # Segmentation affects only attribution of a removal operator; monetary and
    # physical quantities are still parsed by their existing independent modules.
    for clause in re.split(r'[،؛;.!?؟\n]|\s+و\s+', cleaned):
        matches = list(FIELD_PATTERN.finditer(clause))
        for index, match in enumerate(matches):
            key = match[1]
            if key in supported_fields:
                continue
            literal = re.escape(match[0])
            field = rf'{literal}(?:\s+(?:را|رو))?\s+'
            tail = clause[match.start():matches[index + 1].start() if index + 1 < len(matches) else len(clause)]
            denied = bool(re.search(r'حذف\s*نکن|بر\s*ندار', tail)
                          or re.search(field + r'(?:همون|همان|قبلی|حفظ\s*کن|نگه\s*دار|تغییر\s*نده)', clause))
            ignored = bool(re.search(field + r'(?:(?:فعلا|موقتا|الان)\s+)*(?:فیلتر\s*نکن|اعمال\s*نکن|در\s*نظر\s*نگیر|کنار\s*بگذار)(?!\w)',clause))
            removed = ignored or bool(re.search(field + r'(?:حذف\s*کن(?:ید)?|بردار(?:ید)?|مهم\s*نیست)', clause)
                           or re.search(r'(?:بی\s*خیال|صرف\s*نظر\s*از)\s+' + literal + r'(?!\w)', clause)
                           or re.search(literal + r'(?:\s+\S+){0,2}\s+(?:برام\s+|برای\s+من\s+)?'
                                        r'مهم\s*نیست', clause))
            negated = field_is_negated(clause, literal)
            if denied:
                operations.setdefault(key, set()).add('keep')
                controlled = True
            if removed or negated and not denied:
                operations.setdefault(key, set()).add('remove')
                updated.pop(key, None)
                controlled = controlled or removed
            elif not denied:
                operations.setdefault(key, set()).add('set')
                updated[key] = PendingRequirement(key=key, source_text=text)
    if any('remove' in actions and len(actions) > 1 for actions in operations.values()):
        return PendingUpdate(list(items), 'requirement_choice', True)
    if len(updated) > 8:
        # Do not partially accept a too-large edit or silently evict old needs.
        return PendingUpdate(list(items), 'requirement_limit', controlled)
    return PendingUpdate(list(updated.values()), controlled=controlled)


def visit_sort(text: str, previous: str) -> tuple[str, bool]:
    from apps.api.visit_intent import wants_nearest, uncertain_nearest
    cleaned = normalize_text(text)
    removal = bool(re.search(r'(?:فیلتر\s+)?فاصله(?:\s+(?:را|رو))?\s+حذف\s*کن(?!\w)|'
                             r'(?:(?:نزدیک\s+بودن|فاصله)\s+مهم\s*نیست)', cleaned))
    if uncertain_nearest(cleaned) or removal and wants_nearest(cleaned):
        return previous, True
    return ('price' if removal else 'nearest' if wants_nearest(cleaned) else previous), False


@dataclass(frozen=True)
class NeedResolution:
    state: AssistantNeedState
    clarification: str | None
    controlled: bool


async def resolve_need_state(catalogue: 'Catalogue', request: 'AssistantRequest', query: str | None,
                             category: str | None, budget: str | None,
                             battery: BatteryRequirement, offer_sort: str,
                             fallback_source: str | None = None, budget_needs_input: bool = False) -> NeedResolution:
    from apps.api.visit_intent import is_constraint_followup
    from apps.api.explanations import requested_review_topics
    from apps.api.intent import clear_product_topic
    old_topic = request.context_query
    from apps.api.purchase_context import retained_identity, refines_purchase
    query = retained_identity(request.messages[-1].content, old_topic, query)
    changed = False
    if query and old_topic and normalize_text(query) != normalize_text(old_topic):
        old_category = request.context_category or detect_category_intent(old_topic)
        new_category = detect_category_intent(query) or detect_category_intent(affirmative_purchase_text(request.messages[-1].content))
        if old_category is not None and new_category == old_category:
            changed = False
        elif old_category and await asyncio.to_thread(catalogue.matches_identity, query, old_category):
            changed = False
        else:
            changed = not is_constraint_followup(request.messages[-1].content) and not is_need_control(request.messages[-1].content)
    pending = list(request.context_need_state.pending_requirements) if request.context_need_state else []
    if not pending and fallback_source:
        pending = update_pending([], fallback_source).items
    if changed and pending:
        # A model selecting a new lexical fragment is insufficient evidence of a
        # product switch. Preserve unresolved needs for vague acknowledgments.
        latest = normalize_text(request.messages[-1].content)
        explicit_request = bool(re.search(r'می\s*(?:خواهم|خوام)|میخواهم|میخوام|دنبال|جست\s*وجو|جستجو', latest))
        category_names = await asyncio.to_thread(catalogue.category_names)
        if not explicit_request and clear_product_topic(query, category_names) is None:
            changed = False
            query = old_topic
    if changed:
        # Purchasing preference survives; size/memory do not transfer to shoes.
        pending = [item for item in pending if normalize_text(item.key) == 'قسطی']
    topic = query or old_topic
    semantic_category = category or (None if changed else request.context_category)
    latest = request.messages[-1].content
    from apps.api.source_filters import SourceFilters, edited_filters, FIELD_NAMES, requested_filters
    previous = request.context_need_state.source_filters if request.context_need_state and not changed else SourceFilters()
    supported = []
    if topic:
        wanted=set(requested_filters(latest)) | {key for key,value in previous.model_dump().items() if value is not None}
        for field in wanted:
            if await asyncio.to_thread(catalogue.supports_source_field, topic, semantic_category, field):
                supported.append(field)
    source_filters = edited_filters(previous, latest, lambda field: field in supported, has_pending=bool(pending))
    accepted_fields = tuple(FIELD_NAMES[field] for field in supported if getattr(source_filters, field) is not None)
    supported_platform = semantic_category == 'گوشی موبایل' and operating_system(topic or '') and not negated_operating_system(latest) and (operating_system(latest) or not any(p.key=='سیستم عامل' and negated_operating_system(p.source_text) for p in pending))
    # Seller credit conditions are supported by the offers API; approval of
    # financing is never inferred from this preference.
    # Phone minimum capacity is handled by its validated source predicate.
    # Other capacities remain explicit unresolved needs, never silent matches.
    capacity_fields = ('ظرفیت',) if semantic_category == 'گوشی موبایل' or 'ماشین لباسشویی' in (topic or '') and minimum_capacity(latest) is not None else ()
    update = update_pending(pending, latest, supported_fields=capacity_fields + accepted_fields + ('قسطی',) + (('سیستم عامل',) if supported_platform else ())) if topic else PendingUpdate([])
    if topic and negated_operating_system(latest):
        by_key = {item.key:item for item in update.items}
        by_key['سیستم عامل'] = PendingRequirement(key='سیستم عامل',source_text=latest)
        update = PendingUpdate(list(by_key.values()), update.clarification, update.controlled) if len(by_key)<=8 else PendingUpdate(update.items,'requirement_limit',True)
    reference = request.reference_product_id or (request.context_need_state.reference_product_id if request.context_need_state else None)
    if changed or query and old_topic and query != old_topic and not is_constraint_followup(latest):
        reference = request.reference_product_id
    previous_state = request.context_need_state
    keep_comparison = bool(previous_state and not changed and (
        is_constraint_followup(latest) or is_need_control(latest)
        or refines_purchase(latest, old_topic, request.context_category)
        or query == old_topic and re.search(r'بودجه|قیمت|تومان|میلیون', latest)))
    capacity = minimum_capacity(latest, previous_state.minimum_capacity_kg if previous_state and not changed else None) if 'ماشین لباسشویی' in (topic or '') else None
    resolved = AssistantNeedState(
        minimum_capacity_kg=capacity,
        excluded_kinds=update_excluded_kinds(previous_state.excluded_kinds if previous_state else [], latest, changed),
        comparison_queries=previous_state.comparison_queries if keep_comparison else [],
        preferences=update_preferences(
            request.context_need_state.preferences if request.context_need_state else [], latest, changed),
        reference_product_id=reference,
        source_filters=source_filters, topic_query=topic, category_name=semantic_category,
        category_cleared=request.category_cleared if category is None else False,
        max_price_toman=budget, offer_sort=offer_sort, battery_requirement=battery,
        budget_needs_input=budget_needs_input,
        review_topics=requested_review_topics(request) if semantic_category == 'گوشی موبایل' or detect_category_intent(topic) == 'گوشی موبایل' else [],
        pending_requirements=update.items,
    )
    clarification=update.clarification
    if generic_release(latest) and not pending and sum(v is not None for v in previous.model_dump().values())>1:
        clarification='requirement_choice'
    return NeedResolution(resolved, clarification, update.controlled)
