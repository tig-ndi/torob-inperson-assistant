"""Exact recorded variants, independent of a model's interpretation of suitability."""
import json
import re
from pydantic import BaseModel, ConfigDict, Field
from tools.prepare_data import normalize_text


class SourceFilters(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    colour: str | None = Field(default=None, min_length=1, max_length=32)
    size: str | None = Field(default=None, pattern=r'^\d{1,2}(?:\.5)?$')
    connector: str | None = Field(default=None, pattern=r'^(usb-c|micro-usb|lightning)$')


FIELD_NAMES = {'colour': 'رنگ', 'size': 'سایز', 'connector': 'درگاه'}
COLOURS = ('سفید', 'مشکی', 'سیاه', 'آبی', 'قرمز', 'سبز', 'خاکستری', 'طوسی', 'صورتی', 'سرمه ای', 'قهوه ای')


def connector(value):
    text = normalize_text(value)
    if re.search(r'usb\s*[- ]?(?:type\s*[- ]?)?c\b|تایپ\s*(?:سی|c)\b|type\s*[- ]?c\b', text):
        return 'usb-c'
    if re.search(r'micro\s*[- ]?usb|میکرو\s*(?:یو\s*اس\s*بی|usb)', text):
        return 'micro-usb'
    if re.search(r'lightning|لایتنینگ|لایتینگ', text):
        return 'lightning'
    return None


def requested_filters(text):
    text = normalize_text(text)
    values = {}
    colours = [v for v in COLOURS if re.search(r'(?<!\w)' + v + r'(?:ش|اش)?(?!\w)', text)]
    if len(colours) == 1 and not re.search(r'نباش|نمی\s*خوا|نمیخوام', text):
        values['colour'] = 'مشکی' if colours[0] == 'سیاه' else colours[0]
    size = re.search(r'سایز(?:ش)?(?:\s+(?:را|رو|به))?\s*(\d{1,2}(?:\.5)?)(?![\d.])', text)
    if size and not re.match(r'\s*(?:تا|-|یا|و)\s*\d', text[size.end():]) and not re.search(r'نباش|نمی\s*خوا|نمیخوام', text):
        values['size'] = size[1]
    for clause in re.split(r'[؛;،,]|\b(?:اما|ولی)\b',text):
        port = connector(clause)
        if port and not re.search(r'نباش|نمی\s*خوا|نمیخوام', clause):
            values['connector'] = port
    return values


def recorded_values(specs, field):
    rows = (json.loads(specs) if isinstance(specs, str) else specs) or []
    result = set()
    for row in rows:
        key, value = normalize_text(row.get('key') or ''), normalize_text(row.get('value') or '')
        if re.search(r'نامشخص|ثبت نشده|ندارد|^تا\s+\d', value):
            continue
        if field == 'colour' and key in {'رنگ', 'رنگ بندی', 'رنگبندی'}:
            result.update('مشکی' if c == 'سیاه' else c for c in COLOURS if re.search(r'(?<!\w)' + c + r'(?!\w)', value))
        elif field == 'size' and re.fullmatch(r'سایز(?: بندی)?|اندازه', key):
            # Explicit lists and inclusive shoe-size ranges only; do not read
            # dimensions, RAM or a vague size description as a shoe size.
            for lo, hi in re.findall(r'(?<!\d)(\d{2})\s*(?:تا|-)\s*(\d{2})(?!\d)', value):
                if 15 <= int(lo) <= int(hi) <= 55:
                    result.update(str(n) for n in range(int(lo), int(hi) + 1))
            result.update(re.findall(r'(?<![\d.])\d{1,2}(?:\.5)?(?![\d.])', value))
        elif field == 'connector' and re.search(r'درگاه|رابط|کانکتور|اتصال', key):
            if re.search(r'ورودی', key) and not re.search(r'خروجی', key):
                continue  # Charger power input is not the device-side output.
            for token in re.split(r'[,،/؛]|\s+و\s+', value):
                port = connector(token)
                if port:
                    result.add(port)
    return result


def matches_source_filters(specs, filters):
    values = json.loads(filters) if isinstance(filters, str) else filters
    return int(all(wanted in recorded_values(specs, field) for field, wanted in values.items() if wanted is not None))


def edited_filters(previous, text, available, *, has_pending=False):
    """Remove only an explicitly waived field; retain the rest across turns."""
    text = normalize_text(text)
    values = previous.model_dump()
    if values['colour'] and re.search(re.escape(values['colour']) + r'(?:ش)?\s+(?:(?:را|رو)\s+)?(?:نباش|نمی\s*خوا|نمیخوام)', text):
        values['colour'] = None
    active = [key for key, value in values.items() if value is not None]
    if re.match(r'^بدون این (?:شرط|فیلتر)', text) and len(active) == 1 and not has_pending:
        values[active[0]] = None
    for field, label in FIELD_NAMES.items():
        if re.search(label + r'(?:ش|اش)?(?:\s+(?:را|رو|دیگه|دیگر|برای من|برام))*\s+(?:حذف کن|بردار|مهم نیست|فرقی ن(?:داره|دارد)|هر\s*چی)', text):
            values[field] = None
    for field, value in requested_filters(text).items():
        if available(field):
            values[field] = value
    return SourceFilters(**values)


def product_text(text):
    """Separate explicit source conditions from the lexical product identity."""
    cleaned=normalize_text(text)
    cleaned=re.sub(r'(?:خرید\s+)?(?:قسطی|اقساطی|اعتباری)|ترب\s*پی|torob\s*pay', ' ', cleaned)
    if not re.search(r'کفش|کتانی|گوشی|موبایل|شارژر|لپ\s*تاپ|هدفون',cleaned):
        return cleaned
    for field,value in requested_filters(cleaned).items():
        if field=='colour':
            colour='(?:مشکی|سیاه)' if value=='مشکی' else re.escape(value)
            cleaned=re.sub(r'(?:(?:به\s+)?رنگ(?:ش)?\s+)?(?<!\w)'+colour+r'(?:ش|اش)?(?!\w)',' ',cleaned)
        elif field=='size':
            cleaned=re.sub(r'سایز(?:ش)?\s*'+re.escape(value)+r'(?![\d.])',' ',cleaned)
        else:
            cleaned=re.sub(r'(?:usb\s*[- ]?(?:type\s*[- ]?)?c|تایپ\s*(?:سی|c)|type\s*[- ]?c|lightning|لایتنینگ|micro\s*[- ]?usb)',' ',cleaned,flags=re.I)
    return ' '.join(cleaned.split())
