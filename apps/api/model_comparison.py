"""Separate literal model retrievals; never AND two competing model names."""
import re
from tools.prepare_data import normalize_text
from apps.api.shopping_intent import MODEL_WORDS


def comparison_queries(text):
    text = normalize_text(text)
    for alias in ('آیفون', 'ایفون'):
        text = re.sub(r'(?<!\w)'+alias+r'\s*(?=\d)', 'iphone ', text)
    for alias, latin in {'پرو':'pro','مکس':'max','پلاس':'plus','مینی':'mini','اولترا':'ultra','لایت':'lite'}.items():
        text = re.sub(r'(?<!\w)'+alias+r'(?!\w)', latin, text)
    if not re.search(r'مقایسه|فرق|تفاوت|بین', text):
        return []
    subject = re.split(r'برای|تا|بودجه|مقایسه|فرق|تفاوت', text, maxsplit=1)[0]
    models = list(re.finditer(r'(?<!\w)[a-z]{1,8}\s*-?\s*\d{1,5}(?:\s+(?:pro|max|plus|mini|ultra|lite|fe))*(?!\w)', subject))
    if not 2 <= len(models) <= 3:
        return []
    queries,brand,start=[], '',0
    for model in models:
        prefix=subject[start:model.start()]
        names=[(match.start(),word) for group in MODEL_WORDS for word in group
               for match in re.finditer(r'(?<!\w)'+re.escape(word)+r'(?!\w)',prefix)]
        if names:
            brand=max(names)[1]
        queries.append(' '.join((brand+' '+model[0]).split()))
        start=model.end()
    return list(dict.fromkeys(queries))


def revised_comparison_queries(text, previous):
    """Apply an explicit one-for-one model edit without losing the other model."""
    if not 2 <= len(previous) <= 3:
        return []
    text = normalize_text(text)
    model = (r'(?:(?:redmi|samsung|xiaomi|iphone|سامسونگ|ردمی|شیائومی|آیفون)\s+)?'
             r'[a-z]{1,8}\s*-?\s*\d{1,5}(?:\s+(?:pro|max|plus|mini|ultra|lite|fe))*')
    old, new = rf'(?P<old>{model})', rf'(?P<new>{model})'
    patterns = [
        old + r'\s+(?:را|رو)\s+حذف\s+کن\s+و\s+' + new
        + r'\s+(?:را|رو)\s+(?:جایش|جاش)\s+(?:بگذار|بذار|بذارش)',
        r'(?:به\s+جای|بجای)\s+' + old + r'\s*[,،]?\s+' + new
        + r'(?:\s+(?:را|رو))?\s+(?:بگذار|بذار|بذارش|جایگزین کن)',
        old + r'\s+(?:را|رو)\s+با\s+' + new + r'\s+(?:عوض|جایگزین)\s+کن',
    ]
    edit = next((match for pattern in patterns
                 if (match := re.search(pattern, text, re.I))), None)
    if not edit:
        return []
    old = re.sub(r'\s+', '', edit['old']).casefold()
    matching = [index for index, query in enumerate(previous)
                if re.sub(r'\s+', '', normalize_text(query)).casefold().endswith(old)]
    if len(matching) != 1:
        return []
    updated = list(previous)
    updated[matching[0]] = ' '.join(edit['new'].split())
    replacement = re.sub(r'\s+', '', updated[matching[0]]).casefold()
    if any(re.sub(r'\s+', '', query).casefold().endswith(replacement)
           for index, query in enumerate(previous) if index != matching[0]):
        return []
    return updated if len(set(updated)) == len(updated) else []


def comparison_summary(pages):
    lines=[]
    for query,page in pages:
        if not page['items']:
            lines.append(f'«{query}»: مدل دقیق در این بودجه و شرایط پیدا نشد؛ جایگزین نشده است.')
            continue
        product=page['items'][0]
        price=product['offer_summary']['min_price_toman']
        facts=[f'{row["key"]}: {row["value"]}' for row in product['specs']
               if row.get('key') and row.get('value') and re.search(r'دوربین اصلی|ظرفیت باتری|ظرفیت.*رم|حافظه رم',row['key'])][:3]
        lines.append(f'«{query}»: {product["persian_title"]}؛ قیمت ثبت‌شده {price or "نامشخص"} تومان.' + (' مشخصات منبع: '+'؛ '.join(facts)+'.' if facts else ' مشخصات مقایسه‌ای کافی ثبت نشده است.'))
    return '\n'.join(lines)+'\nاین مقایسه فقط بر دادهٔ ثبت‌شده است؛ مگاپیکسل، کیفیت واقعی عکاسی را ثابت نمی‌کند و موجودی باید بررسی شود.'
