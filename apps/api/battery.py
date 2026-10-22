"""Exact declared phone battery capacity. Unknown source values never pass a filter."""

from dataclasses import dataclass
from decimal import Decimal, localcontext
import re

from tools.prepare_data import normalize_text


MAX_CAPACITY_MAH = 1_000_000  # API/parser resource bound, not a quality threshold.
UNIT = r'(?:mah|میلی\s*آمپر\s*ساعت|ah|آمپر\s*ساعت)'
NUMBER = r'[0-9]+(?:[٬,،][0-9]{3})*(?:[.٫][0-9]+)?'


def capacity_clause(amount: str) -> str:
    """A physical capacity clause, never a price or an accessory product name."""
    label = r'(?:ظرفیت\s*)?(?:باتری|باطری)(?:\s+گوشی)?'
    return rf'(?:{label}\s*:?\s*(?:حداقل\s*)?{amount}(?:\s*{UNIT})?|حداقل\s+(?:{label}\s*)?{amount}\s*{UNIT})'


def strip_capacity_clause(text: str, amount: str) -> str:
    text = re.sub(capacity_clause(amount), ' ', text)
    return re.sub(r'(?:ظرفیت\s*)?(?:باتری|باطری)\s+(?:قوی|خوب|مناسب|با\s*کیفیت)', ' ', text)


def quantity_mah(number: str, unit: str) -> int:
    raw = normalize_text(number)
    if re.search(r'[٬,،]', raw):
        integer = re.split(r'[.٫]', raw)[0]
        parts = re.split(r'[٬,،]', integer)
        if not 1 <= len(parts[0]) <= 3 or any(len(part) != 3 for part in parts[1:]):
            raise ValueError('invalid capacity grouping')
    raw = re.sub(r'[٬,،]', '', raw).replace('٫', '.')
    if not re.fullmatch(r'[0-9]+(?:\.[0-9]+)?', raw):
        raise ValueError('invalid capacity number')
    normalized_unit = normalize_text(unit)
    if not re.fullmatch(UNIT, normalized_unit):
        raise ValueError('unsupported capacity unit')
    with localcontext() as context:
        # Do not round tiny non-integral fractions into an apparently exact mAh.
        context.prec = max(28, len(raw) + 4)
        result = Decimal(raw) * (1000 if normalized_unit in {'ah', 'آمپر ساعت', 'آمپرساعت'} else 1)
    if result != result.to_integral_value() or not 0 <= result <= MAX_CAPACITY_MAH:
        raise ValueError('unsupported capacity amount')
    return int(result)


def unit_from_key(key: str) -> str | None:
    match = re.search(r'\((?P<unit>' + UNIT + r')\)', key)
    return match['unit'] if match else None


@dataclass(frozen=True)
class Capacity:
    status: str
    capacity_mah: int | None
    reason: str
    references: tuple[tuple[int, str | None, str | None, str | None, int | None], ...] = ()

    def as_dict(self) -> dict:
        return {'status': self.status, 'capacity_mah': self.capacity_mah, 'reason': self.reason,
                'evidence_count': len(self.references),
                'evidence': [dict(zip(['source_index', 'section', 'key', 'value', 'parsed_mah'], row)) for row in self.references[:4]]}


def assess_capacity(category: str | None, specs: list) -> Capacity:
    if normalize_text(category or '') != 'گوشی موبایل':
        return Capacity('not_applicable', None, 'not_phone')
    values, references = set(), []
    unsupported = False
    absent = False
    for index, spec in enumerate(specs):
        if not isinstance(spec, dict) or any(spec.get(key) is not None and not isinstance(spec[key], str) for key in ['key', 'section', 'value']):
            raise ValueError('invalid source specs')
        key = normalize_text(spec.get('key') or '')
        if 'ظرفیت' not in key or not re.search(r'باتری|باطری', key):
            continue
        raw = spec.get('value')
        text = normalize_text(raw or '')
        parsed = None
        if text in {'', '-', '—', 'null', 'none', 'undefined', 'title', 'n/a', 'نامشخص', 'ثبت نشده'}:
            pass  # A missing duplicate field does not contradict another exact source value.
        elif text in {'ندارد', 'بدون باتری', 'فاقد باتری'}:
            absent = True
        else:
            match = re.fullmatch(rf'(?P<number>{NUMBER})\s*(?P<unit>{UNIT})?', text)
            unit = (match['unit'] or unit_from_key(key)) if match else None
            if match and unit and 'محدوده' not in key:
                try:
                    parsed = quantity_mah(match['number'], unit)
                    values.add(parsed)
                except ValueError:
                    unsupported = True
            else:
                unsupported = True
        references.append((index, spec.get('section'), spec.get('key'), raw, parsed))
    refs = tuple(references)
    if len(values) > 1 or (values and absent):
        # Put at least two differing witnesses in the bounded evidence preview.
        ordered = sorted(refs, key=lambda row: (row[4] is None, row[4] or 0, row[0]))
        first = next((row for row in ordered if row[4] is not None), None)
        other = next((row for row in refs if first is not None and (
            (row[4] is not None and row[4] != first[4]) or normalize_text(row[3] or '') in {'ندارد', 'بدون باتری', 'فاقد باتری'})), None)
        witnesses = [row for row in [first, other] if row is not None]
        refs = tuple(witnesses + [row for row in refs if row not in witnesses])
        return Capacity('conflicting', None, 'conflicting_values', refs)
    if unsupported:
        # Keep the unparseable source witness visible, even after missing duplicates.
        refs = tuple(sorted(refs, key=lambda row: (0 if row[4] is None and normalize_text(row[3] or '') not in {
            '', '-', '—', 'null', 'none', 'undefined', 'title', 'n/a', 'نامشخص', 'ثبت نشده', 'ندارد', 'بدون باتری', 'فاقد باتری'} else 1, row[0])))
        return Capacity('unknown', None, 'unsupported_source_value', refs)
    if values:
        return Capacity('known', next(iter(values)), 'exact_source_value', refs)
    return Capacity('unknown', None, 'missing_or_absent_capacity' if refs else 'no_capacity_field', refs)
