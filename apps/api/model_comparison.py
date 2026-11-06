"""Separate literal model retrievals; never AND two competing model names."""
import re
from tools.prepare_data import normalize_text
from apps.api.shopping_intent import MODEL_WORDS


def comparison_queries(text):
    text = normalize_text(text)
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
