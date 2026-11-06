"""Bounded preferences retained independently of the truncated chat history."""
import re
from tools.prepare_data import normalize_text

PATTERNS = {
    'coding': r'برنامه\s*نویسی', 'lightweight': r'سبک|حمل',
    'walking': r'پیاده\s*روی|دویدن', 'anc': r'\banc\b|حذف\s+نویز\s+فعال',
    'energy': r'کم\s*مصرف|مصرف\s+انرژی', 'family': r'خانواده|پرجمعیت',
}
LABELS = dict(coding='برنامه نویسی', lightweight='سبک', walking='پیاده روی',
              anc='حذف نویز فعال ANC', energy='کم مصرف', family='خانواده پرجمعیت')


def update_preferences(previous, text, changed=False):
    result = set() if changed else set(previous)
    for clause in re.split(r'[؛;،,\n]|\b(?:اما|ولی)\b', normalize_text(text)):
        for key, pattern in PATTERNS.items():
            if re.search(pattern, clause):
                if re.search(r'مهم نیست|حذف کن|بردار|نیازی ندارم|نمی\s*خوا|لازم نیست', clause) or re.search(r'بدون\s+(?:'+pattern+r')',clause):
                    result.discard(key)
                else:
                    result.add(key)
    return [key for key in PATTERNS if key in result]


def preferences_context(preferences):
    return ' ؛ '.join(LABELS[key] for key in preferences if key in LABELS)


def minimum_capacity(text, previous=None):
    from apps.api.intent import AMOUNT, parse_toman
    text = normalize_text(text)
    if re.search(r'ظرفیت.*(?:مهم نیست|حذف کن|بردار)|بدون حداقل ظرفیت', text):
        return None
    match = re.search(r'حداقل\s+(?:ظرفیت\s+)?('+AMOUNT+r')\s*(?:کیلو(?:گرم)?|kg)(?!\w)', text)
    if match:
        try:
            value = parse_toman(match[1])
            return value if 0 < value <= 1000 else previous
        except ValueError:
            return previous
    return previous


def recorded_requirements_match(category, specs, require_anc=False, minimum_kg=None):
    import json
    from apps.api.recorded_preferences import recorded_need_evidence
    rows=json.loads(specs) if isinstance(specs,str) else specs
    if require_anc and not recorded_need_evidence(category, rows, 'حذف نویز فعال anc'):
        return 0
    if minimum_kg is not None:
        if normalize_text(category or '') != 'ماشین لباسشویی':
            return 0
        values=[]
        for row in rows:
            key=normalize_text(row.get('key') or '')
            value=normalize_text(row.get('value') or '')
            if re.fullmatch(r'ظرفیت(?: دیگ| شستشو)?(?: \(کیلوگرم\))?',key):
                match=re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)\s*(?:کیلوگرم|کیلو|kg)?',value)
                if not match or not (re.search(r'کیلو|kg',value) or 'کیلوگرم' in key):
                    return 0
                values.append(float(match[1]))
        if len(set(values))!=1 or values[0]<minimum_kg:
            return 0
    return 1
