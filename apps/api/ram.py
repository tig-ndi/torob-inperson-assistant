"""Conservative RAM capacity from recorded laptop specifications."""

import re

from tools.prepare_data import normalize_text


_WORDS = {'هشت': 8, 'دوازده': 12, 'شانزده': 16, 'بیست': 20,
          'بیست و چهار': 24, 'سی و دو': 32, 'سی و شش': 36, 'چهل': 40,
          'شصت و چهار': 64}
_CAPACITY = re.compile(r'(?<!\w)(\d{1,3})(?:\s*)(?:gb|g\b|گیگ(?:ابایت)?)(?!\w)', re.I)


def recorded_ram_gb(category: str, specs: list[dict]) -> int | None:
    if normalize_text(category) != 'لپ تاپ و نوت بوک':
        return None
    values = set()
    for spec in specs:
        key = normalize_text(spec.get('key') or '')
        if not re.search(r'(?<!\w)(?:رم|ram)(?!\w)', key):
            continue
        if re.search(r'نوع|باس|اسلات|گرافیک|ارتقا|فرکانس|سرعت|حداکثر', key):
            continue
        value = normalize_text(spec.get('value') or '')
        found = {int(match[1]) for match in _CAPACITY.finditer(value)}
        found.update(number for word, number in _WORDS.items()
                     if re.search(r'(?<!\w)' + re.escape(word) + r'\s+گیگ(?:ابایت)?(?!\w)', value))
        values.update(number for number in found if 1 <= number <= 128)
    return next(iter(values)) if len(values) == 1 else None


def minimum_ram_gb(text: str, previous: int | None = None) -> int | None:
    from apps.api.intent import NUMBER_WORDS, parse_toman
    value = normalize_text(text)
    if re.search(r'(?:رم|ram).{0,25}(?:مهم نیست|حذف کن|بردار|فیلتر نکن)', value):
        return None
    amount = rf'(?:\d{{1,3}}|(?:{NUMBER_WORDS})(?:\s+(?:{NUMBER_WORDS}))*)'
    comparison = r'(?P<strict>بیشتر از)|حداقل'
    match = re.search(rf'(?<!\w)(?:رم|ram)(?:\s+(?:{comparison}))?\s+(?P<amount>{amount})(?:\s*(?:gb|g\b|گیگ(?:ابایت)?))?(?!\w)', value)
    if not match:
        match = re.search(rf'(?<!\w)(?:{comparison})\s+(?P<amount>{amount})\s*(?:gb|g\b|گیگ(?:ابایت)?)\s+(?:رم|ram)(?!\w)', value)
    if match:
        try:
            minimum = parse_toman(re.sub(r'\s+و$', '', match['amount'])) + bool(match['strict'])
        except ValueError:
            return None
        return minimum if 1 <= minimum <= 128 else None
    return previous
