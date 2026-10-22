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
from tools.prepare_data import normalize_text

if TYPE_CHECKING:
    from apps.api.catalogue import Catalogue
    from apps.api.intent import AssistantRequest


FIELDS = ('رنگ', 'سایز', 'اندازه', 'جنس', 'حافظه', 'رم', 'وزن', 'توان', 'گارانتی', 'قسطی')
GENERIC_RELEASE = {'بدون این شرط', 'بدون این فیلتر'}
ALL_RELEASE = {'همه شرط های اجرا نشده را حذف کن', 'همه شرط های حل نشده را حذف کن',
               'همه فیلترهای اجرا نشده را حذف کن'}
CONTINUE = {'ادامه بده', 'ادامه', 'باشه', 'بله', 'آره', 'اره', 'اوکی'}
FIELD_PATTERN = re.compile(r'(?<!\w)(' + '|'.join(FIELDS) + r')(?:ش|اش|م|مون|و)?(?!\w)')


@dataclass(frozen=True)
class PendingUpdate:
    items: list[PendingRequirement]
    clarification: str | None = None
    controlled: bool = False


def is_need_control(text: str, *, include_ack: bool = False) -> bool:
    text = normalize_text(text)
    return (text in GENERIC_RELEASE | ALL_RELEASE or include_ack and text in CONTINUE or
            bool(re.search(r'(?:حذف|بردار|مهم نیست|بی خیال|صرف نظر)', text)
                 and (FIELD_PATTERN.search(text) or 'فاصله' in text
                      or 'شرط' in text and ('اجرا نشده' in text or 'حل نشده' in text))))


def update_pending(items: list[PendingRequirement], text: str) -> PendingUpdate:
    cleaned = normalize_text(text)
    if cleaned in ALL_RELEASE:
        return PendingUpdate([], controlled=True)
    if cleaned in GENERIC_RELEASE:
        if not items:
            # No pending source-field constraint: let battery/scope handling own
            # the phrase instead of interpreting it as a deletion of that state.
            return PendingUpdate([])
        if len(items) == 1:
            return PendingUpdate([], controlled=True)
        return PendingUpdate(list(items), 'requirement_choice', True)
    updated = {normalize_text(item.key): item for item in items}
    controlled = False
    operations: dict[str, set[str]] = {}
    # Segmentation affects only attribution of a removal operator; monetary and
    # physical quantities are still parsed by their existing independent modules.
    for clause in re.split(r'[،؛;.!?؟\n]|\s+و\s+', cleaned):
        matches = list(FIELD_PATTERN.finditer(clause))
        for index, match in enumerate(matches):
            key = match[1]
            literal = re.escape(match[0])
            field = rf'{literal}(?:\s+(?:را|رو))?\s+'
            tail = clause[match.start():matches[index + 1].start() if index + 1 < len(matches) else len(clause)]
            denied = bool(re.search(r'حذف\s*نکن|بر\s*ندار', tail)
                          or re.search(field + r'(?:همون|همان|قبلی|حفظ\s*کن|نگه\s*دار|تغییر\s*نده)', clause))
            removed = bool(re.search(field + r'(?:حذف\s*کن(?:ید)?|بردار(?:ید)?|مهم\s*نیست)', clause)
                           or re.search(r'(?:بی\s*خیال|صرف\s*نظر\s*از)\s+' + literal + r'(?!\w)', clause))
            if denied:
                operations.setdefault(key, set()).add('keep')
                controlled = True
            if removed:
                operations.setdefault(key, set()).add('remove')
                updated.pop(key, None)
                controlled = True
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
    changed = False
    if query and old_topic and normalize_text(query) != normalize_text(old_topic):
        old_category = request.context_category or detect_category_intent(old_topic)
        new_category = detect_category_intent(query) or detect_category_intent(request.messages[-1].content)
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
    update = update_pending(pending, request.messages[-1].content) if topic else PendingUpdate([])
    semantic_category = category or (None if changed else request.context_category)
    resolved = AssistantNeedState(
        topic_query=topic, category_name=semantic_category,
        category_cleared=request.category_cleared if category is None else False,
        max_price_toman=budget, offer_sort=offer_sort, battery_requirement=battery,
        budget_needs_input=budget_needs_input,
        review_topics=requested_review_topics(request) if semantic_category == 'گوشی موبایل' or detect_category_intent(topic) == 'گوشی موبایل' else [],
        pending_requirements=update.items,
    )
    return NeedResolution(resolved, update.clarification, update.controlled)
