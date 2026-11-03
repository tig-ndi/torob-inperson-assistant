"""Compare explicit recorded quantities without claiming real-world quality."""
import json
import math
import re
from tools.prepare_data import normalize_text
from apps.api.battery import assess_capacity


def recorded_preference_score(category, specs, context):
    if category != 'گوشی موبایل':
        return 0.0
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
