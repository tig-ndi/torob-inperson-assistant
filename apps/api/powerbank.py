"""Source-backed nominal capacity for complete power banks, in mAh."""

import re

from apps.api.battery import NUMBER, UNIT, assess_capacity, MAX_CAPACITY_MAH
from tools.prepare_data import normalize_text


def powerbank_topic(text: str | None) -> bool:
    return bool(re.search(r'پاور\s*بانک|power\s*bank', normalize_text(text or '')))


def recorded_powerbank_mah(category: str, specs: list[dict], title: str = '') -> int | None:
    if not powerbank_topic(category) or re.search(r'باتری|باطری|قطعه|ماژول|برد|کیف|کاور', normalize_text(category)):
        return None
    title_values = list(re.finditer(rf'(?P<number>{NUMBER})\s*(?P<unit>{UNIT})(?!\w)', normalize_text(title)))
    rows = []
    for spec in specs:
        key = normalize_text(spec.get('key') or '')
        if 'ظرفیت' not in key or not re.search(r'اسمی|باتری|باطری|mah|میلی\s*آمپر', key):
            continue
        if re.search(r'خروجی|ورودی|توان|محدوده', key):
            continue
        value = normalize_text(spec.get('value') or '').replace('امپر', 'آمپر')
        value = re.sub(r'^اسمی\s*:\s*', '', value)
        # A bare nominal value needs a recorded unit witness; never assume Wh=mAh.
        if re.fullmatch(NUMBER, value) and title_values:
            units = {match['unit'] for match in title_values}
            if len(units) == 1:
                value += ' ' + next(iter(units))
        rows.append({'key': 'ظرفیت باتری ' + key, 'value': value})
    rows.extend({'key': 'ظرفیت باتری', 'value': match[0]} for match in title_values)
    return assess_capacity('گوشی موبایل', rows).capacity_mah


def minimum_powerbank_mah(text: str, previous: int | None = None) -> int | None:
    from apps.api.intent import NUMBER_WORDS, parse_toman
    from apps.api.battery import quantity_mah
    value = normalize_text(text)
    if re.search(r'ظرفیت.{0,25}(?:مهم نیست|حذف کن|بردار|فیلتر نکن)', value):
        return None
    amount = rf'(?:{NUMBER}|(?:{NUMBER_WORDS})(?:\s+(?:{NUMBER_WORDS}))*)'
    match = re.search(rf'(?:حداقل\s+)?ظرفیت(?:\s+(?:باتری|باطری))?\s*:?\s*(?:(?P<strict>بیشتر از)|حداقل)?\s*(?P<amount>{amount})(?:\s*(?P<unit>{UNIT}))?(?!\w)', value)
    if not match:
        return previous
    tail = value[match.end():].strip()
    if re.match(r'وات|wh|ولت|کیلو|گیگ', tail):
        return None
    try:
        raw = re.sub(r'\s+و$', '', match['amount'])
        number = str(parse_toman(raw)) if not re.fullmatch(NUMBER, raw) else raw
        minimum = quantity_mah(number, match['unit'] or 'mah') + bool(match['strict'])
        return minimum if 0 < minimum <= MAX_CAPACITY_MAH else None
    except ValueError:
        return None
