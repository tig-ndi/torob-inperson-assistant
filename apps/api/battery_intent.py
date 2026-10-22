"""Bounded phone-capacity dialogue. Only explicit quantities establish a minimum."""

import re

from apps.api.battery import MAX_CAPACITY_MAH, UNIT, capacity_clause, quantity_mah
from apps.api.category import CAT_MOBILE_PHONE, detect_category_intent
from apps.api.intent import AMOUNT, NUMBER_WORDS, AssistantRequest, QUESTIONS, _strip_budget_phrases, parse_toman
from apps.api.models import BatteryRequirement
from tools.prepare_data import normalize_text


def phone_topic(query: str | None, category: str | None) -> bool:
    return category == CAT_MOBILE_PHONE or (category is None and detect_category_intent(query or '') == CAT_MOBILE_PHONE)


BATTERY_LABEL = r'(?:باتری|باطری)'
REMOVAL_LABEL = rf'(?:فیلتر|شرط|حداقل)\s+(?:ظرفیت\s+)?{BATTERY_LABEL}(?:\s+(?:را|رو))?\s+'


def _capacity_clauses(text: str) -> list[str]:
    """Bound local edits without splitting decimal/grouped digits or number words.

    This is a conservative clause boundary, not general Persian negation parsing.
    """
    separator = (r'(?<![0-9])[،,.]|[،,.](?![0-9])|[؛;\n!?؟]|'
                 r'\b(?:اما|ولی|فقط)\b|'
                 rf'\s+و\s+(?!(?:[0-9]|(?:{NUMBER_WORDS})(?!\w)))')
    return [part.strip() for part in re.split(separator, text) if part.strip()]


def _clause_update(text: str, current: BatteryRequirement, allow_bare: bool) -> BatteryRequirement | None:
    text = _strip_budget_phrases(text).strip()
    mentioned = bool(re.search(r'باتری|باطری|' + UNIT + r'\b', text))
    waiting = current.status == 'awaiting_minimum'
    keep = re.search(REMOVAL_LABEL + r'حذف\s+(?:نکن(?:ید)?|نشود|نشه)\b', text)
    remove = re.search(REMOVAL_LABEL + r'حذف\s+(?:بکن(?:ید)?|کن(?:ید)?|شود|بشه)\b', text)
    unimportant = re.search(rf'(?:ظرفیت\s+)?{BATTERY_LABEL}\s+(?:(?:دیگه|دیگر|اصلا|برای من)\s+)*(?:مهم نیست|اهمیتی ندارد)\b', text)
    if (keep or remove or unimportant) and re.search(rf'\bحداقل\s+{AMOUNT}', text):
        return BatteryRequirement(status='awaiting_minimum')
    if keep:
        return current
    if (allow_bare and re.fullmatch(r'(?:بدون حداقل|حداقلی ندارم|حداقل ندارم)', text)) or remove or unimportant:
        return BatteryRequirement(status='no_minimum')
    if not mentioned and not allow_bare:
        return None
    capacity_intent = bool(re.search(r'ظرفیت\s+(?:باتری|باطری)|(?:باتری|باطری)\s+(?:حداقل|حداکثر|قوی|خوب|مناسب|با\s*کیفیت|بین|[0-9])|(?<!\w)' + UNIT + r'(?!\w)', text))
    if not waiting and not capacity_intent:
        return None  # Replaceability/charging features are not a capacity request.
    # Explicit units are required except for an answer to this exact capacity question.
    matches = list(re.finditer(rf'(?<![\w+−.\-])(?P<number>{AMOUNT})\s*(?P<unit>{UNIT})(?!\w)', text))
    try:
        if len(matches) == 1:
            match = matches[0]
            if not waiting and not re.search(r'\bحداقل\b', text):
                raise ValueError('an inclusive minimum must be explicit')
            # Do not reinterpret a range, upper bound or strict inequality as >=.
            if re.search(r'حداکثر|کمتر|بیشتر از|بالاتر از|بین|\bتا\s+' + AMOUNT + r'\s*' + UNIT, text):
                raise ValueError('not an inclusive minimum')
            number = match['number'].strip()
            if re.fullmatch(r'[0-9٬,،.٫]+', number):
                value = quantity_mah(number, match['unit'])
            else:
                value = quantity_mah(str(parse_toman(number)), match['unit'])
            # No hidden second quantity without a unit (e.g. 4000 تا 5000 mAh).
            prefix = text[:match.start()]
            if re.search(r'[0-9].*\bتا\b', prefix):
                raise ValueError('ambiguous range')
            return BatteryRequirement(status='minimum', minimum_mah=value)
        if allow_bare and re.fullmatch(AMOUNT, text):
            value = parse_toman(text)
            if value > MAX_CAPACITY_MAH:
                raise ValueError('unsupported capacity')
            return BatteryRequirement(status='minimum', minimum_mah=value)
    except ValueError:
        return BatteryRequirement(status='awaiting_minimum')
    if mentioned:
        return BatteryRequirement(status='awaiting_minimum')
    return None


def capacity_update(text: str, current: BatteryRequirement) -> BatteryRequirement:
    text = normalize_text(text).strip(' .،؛؟!')
    allow_bare = current.status == 'awaiting_minimum'
    updates = [update for clause in _capacity_clauses(text)
               if (update := _clause_update(clause, current, allow_bare)) is not None]
    if not updates:
        return current
    if any(update != updates[0] for update in updates[1:]):
        # Conflicting edits must never produce a silently unfiltered search.
        return BatteryRequirement(status='awaiting_minimum')
    return updates[0]


def resolve_requirement(request: AssistantRequest, is_phone: bool) -> BatteryRequirement:
    if not is_phone:
        return BatteryRequirement()
    current = request.context_battery_requirement or BatteryRequirement()
    messages = request.messages[-1:] if request.context_battery_requirement is not None else request.messages
    for message in messages:
        if message.role == 'assistant':
            if message.content == QUESTIONS['battery_capacity']:
                current = BatteryRequirement(status='awaiting_minimum')
            continue
        category = detect_category_intent(message.content)
        if category is not None and category != CAT_MOBILE_PHONE:
            current = BatteryRequirement()
            continue
        current = capacity_update(message.content, current)
    return current


def capacity_followup(request: AssistantRequest) -> bool:
    """Distinguish capacity-only replies from a newly named product."""
    latest = normalize_text(request.messages[-1].content)
    if request.context_battery_requirement is not None and request.context_battery_requirement.status == 'awaiting_minimum':
        if re.fullmatch(rf'{AMOUNT}(?:\s*{UNIT})?[ .،؛؟!]*|بدون حداقل', latest):
            return True
    if len(request.messages) > 1 and request.messages[-2].content == QUESTIONS['battery_capacity']:
        if re.fullmatch(rf'{AMOUNT}(?:\s*{UNIT})?[ .،؛؟!]*|بدون حداقل', latest):
            return True
    return bool(re.search(capacity_clause(AMOUNT), latest) or re.search(r'^(?:با\s+)?(?:ظرفیت\s*)?(?:باتری|باطری)\s+(?:قوی|خوب)|^(?:فیلتر|شرط|حداقل)\s+(?:ظرفیت\s+)?(?:باتری|باطری).*حذف', latest))
