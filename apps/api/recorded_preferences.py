"""Compare explicit recorded quantities without claiming real-world quality."""
import json
import math
import re
from tools.prepare_data import normalize_text
from apps.api.battery import assess_capacity


def recorded_need_evidence(category, specs, context):
    """Soft ranking witnesses only; absent/conflicting facts never imply capability."""
    rows = json.loads(specs) if isinstance(specs, str) else specs or []
    context = normalize_text(context)
    # A refused preference is not a positive ranking signal. Ambiguous mixed
    # clauses earn no soft bonus rather than inventing the user's priorities.
    context = ' ؛ '.join(clause for clause in re.split(r'[؛;،,\n]|\b(?:اما|ولی)\b', context)
                         if not re.search(r'بدون|مهم نیست|اهمیتی ندارد|نمی\s*خوا|نیازی ندارم', clause))
    category = normalize_text(category or '')
    grouped = {}
    for row in rows:
        key = normalize_text(row.get('key') or '')
        grouped.setdefault(key, set()).add(normalize_text(row.get('value') or ''))
    evidence = []
    use_cases = ('برنامه نویسی', 'دانشجویی', 'اداری', 'حسابداری', 'گیمینگ', 'تدوین',
                 'پیاده روی', 'دویدن', 'ورزش')
    for row in rows:
        key, value = normalize_text(row.get('key') or ''), normalize_text(row.get('value') or '')
        if not key or not value or len(grouped[key]) != 1 or re.search(r'ندارد|فاقد|بدون|نامشخص|ثبت نشده|نیست|نامناسب|غیر\s*فعال|نمی', value):
            continue
        weight = 0.0
        if re.search(r'کاربری|کاربرد|مناسب برای', key):
            if any(term in context and term in value for term in use_cases):
                weight = 8.0
        if category == 'لپ تاپ و نوت بوک':
            if re.search(r'برنامه نویسی|رم بیشتر|حافظه رم', context) and re.search(r'ظرفیت.*(?:رم|ram)|حافظه رم', key) and not re.search(r'گرافیک|مجازی|ارتقا', key):
                match = re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)\s*(?:گیگابایت|گیگ|gb)', value)
                if match:
                    weight = min(float(match[1]), 64) / 16
            if re.search(r'سبک|حمل', context) and re.fullmatch(r'وزن(?: \(کیلوگرم\))?', key):
                match = re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)\s*(کیلوگرم|kg|گرم|g)?', value)
                if match:
                    kg = float(match[1]) / (1000 if match[2] in {'گرم', 'g'} else 1)
                    # A bare quantity is usable only when the key supplies its unit.
                    if kg > 0 and (match[2] or 'کیلوگرم' in key):
                        weight = 4 / (1 + kg)
        if category == 'هدفون، هدست و هندزفری' and re.search(r'حذف نویز|\banc\b', context):
            if re.search(r'نویز|مشخصات|قابلیت', key) and re.search(r'\banc\b|حذف نویز فعال|نویز کنسلینگ فعال', value):
                weight = 8.0  # ENC/microphone noise reduction alone is not ANC.
        if category == 'ماشین لباسشویی':
            if re.search(r'کم مصرف|مصرف انرژی', context) and 'انرژی' in key and re.fullmatch(r'a\+{1,3}(?:\s*-\s*[0-9]+%)?', value):
                weight = value.count('+') * 2.0
            if re.search(r'خانواده پرجمعیت|ظرفیت بیشتر', context) and re.fullmatch(r'ظرفیت(?: دیگ)?', key):
                match = re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)\s*(?:کیلوگرم|kg)', value)
                if match:
                    weight = min(float(match[1]), 20) / 4
        if weight:
            evidence.append((weight, row))
    return evidence


def recorded_preference_score(category, specs, context):
    if category != 'گوشی موبایل':
        return sum(weight for weight, _ in recorded_need_evidence(category, specs, context))
    rows = json.loads(specs) if isinstance(specs, str) else specs or []
    context = normalize_text(context)
    camera = bool(re.search(r'دوربین|عکاسی|عکس گرفتن|سلفی', context))
    battery = bool(re.search(r'باتری|باطری|شارژدهی', context))
    camera_weight, battery_weight = 1, 1
    if re.search(r'(?:دوام\s+)?باتری\s+از\s+دوربین\s+مهم', context):
        camera_weight, battery_weight = 0, 2
    elif re.search(r'دوربین\s+از\s+باتری\s+مهم', context):
        camera_weight, battery_weight = 2, 0
    score = 0.0
    if battery:
        capacity = assess_capacity(category, rows)
        if capacity.capacity_mah is not None:
            score += battery_weight * min(capacity.capacity_mah, 10000) / 1000
    if camera:
        values = []
        for row in rows:
            key, value = normalize_text(row.get('key') or ''), normalize_text(row.get('value') or '')
            if re.search(r'رزولوشن دوربین اصلی|دوربین اصلی', key):
                if re.search(r'ندارد|فاقد|نامشخص', value):
                    return score
                match = re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)\s*(?:مگا\s*پیکسل|mp)', value)
                if match:
                    values.append(float(match[1]))
        if len(set(values)) == 1:
            score += camera_weight * math.log2(1 + min(values[0], 250))
    return score
