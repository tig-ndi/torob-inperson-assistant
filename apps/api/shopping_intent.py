"""Conservative product families backed by the snapshot's own fields."""
import json
import re
from tools.prepare_data import normalize_text

# Orthographic equivalents, not inferred product features. Keep FTS operators
# literal and expand only these bounded brand/model spellings.
MODEL_WORDS = (('ردمی', 'redmi'), ('نوت', 'note'), ('گلکسی', 'galaxy'),
               ('پوکو', 'poco'), ('سامسونگ', 'samsung'), ('شیائومی', 'xiaomi'))


def model_edition_matches(query, title):
    """Do not substitute a Pro/Max/Lite edition for a named base model."""
    editions = {'pro':'pro','پرو':'pro','max':'max','مکس':'max','plus':'plus','پلاس':'plus',
                'mini':'mini','مینی':'mini','ultra':'ultra','اولترا':'ultra','lite':'lite','لایت':'lite','fe':'fe'}
    words = re.findall(r'[^\W_]+', normalize_text(query))
    anchor = next((word for word in words if any(c.isdigit() for c in word)), None)
    if anchor is None:
        return True
    def suffix(tokens, index):
        found = set()
        for word in tokens[index+1:index+4]:
            if word not in editions:break
            found.add(editions[word])
        return found
    wanted = suffix(words, words.index(anchor))
    for segment in re.split(r'[/|،؛]', normalize_text(title or '')):
        tokens = re.findall(r'[^\W_]+', segment)
        if any(word == anchor and suffix(tokens, index) == wanted for index,word in enumerate(tokens)):
            return True
    # An absent numeric token is already rejected by literal FTS; this guard
    # only distinguishes editions where the named model anchor is present.
    return not any(word == anchor for word in re.findall(r'[^\W_]+', normalize_text(title or '')))


def operating_system(text):
    text = normalize_text(text)
    android = bool(re.search(r'(?<!\w)(?:اندروید(?:ی)?|android)(?:\s*[0-9.]+)?(?!\w)', text))
    ios = bool(re.search(r'(?<!\w)(?:ios|آی\s*او\s*اس)(?:\s*[0-9.]+)?(?!\w)', text))
    return 'android' if android and not ios else 'ios' if ios and not android else None


def negated_operating_system(text):
    return bool(re.search(r'(?:اندروید(?:ی)?|android|ios)(?:\s+(?:را|رو))?\s+(?:نمی\s*خوا(?:هم|م)|نمی\s*خوام|نباش(?:د|ه))', normalize_text(text)))


def recorded_operating_system(specs):
    values = set()
    for spec in specs:
        key = normalize_text(spec.get('key') or '')
        if not re.search(r'سیستم\s*عامل|operating\s*system|^os$|^اندروید$', key):
            continue
        value = normalize_text(spec.get('value') or '')
        # Android phones imitating iOS must never pass an iOS requirement.
        value = re.split(r'شبیه|مشابه|ظاهر|طرح', value)[0]
        found = operating_system(value)
        if found:
            values.add(found)
    return next(iter(values)) if len(values) == 1 else None


def platform_topic(query, latest, previous, category):
    """Retain a supported source predicate through same-device refinements."""
    if category != 'گوشی موبایل' or not query:
        return query
    latest = normalize_text(latest)
    remove = bool(re.search(r'(?:سیستم\s*عامل|اندروید|android|ios).{0,18}(?:مهم نیست|حذف کن|بردار|فیلتر نکن)', latest))
    wanted = None if remove else (None if negated_operating_system(latest) else operating_system(latest)) or operating_system(query) or operating_system(previous or '')
    query = re.sub(r'(?<!\w)(?:اندروید(?:ی)?|android|ios|آی\s*او\s*اس)(?!\w)', ' ', normalize_text(query))
    query = re.sub(r'سیستم\s*عامل', ' ', query)
    query = ' '.join(query.split())
    if wanted:
        query += ' اندروید' if wanted == 'android' else ' ios'
    return query


def keypad_request(text):
    text=normalize_text(text)
    return bool(re.search(r'گوشی\s+دکمه\s*ای|دکمه\s*های?\s+درشت',text))


def retrieval_query(query):
    text=normalize_text(query)
    if operating_system(text):
        text = re.sub(r'(?<!\w)(?:اندروید(?:ی)?|android|ios|آی\s*او\s*اس)(?!\w)|سیستم\s*عامل', ' ', text)
        text = ' '.join(text.split()) or 'گوشی'
    if text in {'شارژر موبایل','شارژر گوشی'}:return 'شارژر'
    if re.search(r'گوشی\s+دکمه\s*ای',text):
        return re.sub(r'دکمه\s*ای','',text).strip()
    return text


def matches_product_kind(query,category,title,specs):
    query=normalize_text(query);category=normalize_text(category or '')
    if category in {'گوشی موبایل','باتری گوشی موبایل','تاچ و ال سی دی گوشی و تبلت','کیف و کاور گوشی','محافظ صفحه نمایش گوشی'} and not model_edition_matches(query,title):
        return 0
    platform = operating_system(query)
    if platform and (category != 'گوشی موبایل' or recorded_operating_system(json.loads(specs or '[]')) != platform):
        return 0
    if query in {'شارژر موبایل','شارژر گوشی'} and category!='شارژر گوشی':return 0
    if re.search(r'(?<!\w)کفش(?!\w)',query) and not re.search(r'بند|کفی|واکس|هولدر|جاکفشی|برس|بوگیر|کاور|لوازم',query):
        if not re.search(r'کفش|کتانی',category) or re.search(r'بند|کفی|زیره|واکس|هولدر|جاکفشی|برس|بوگیر|کاور|اکسسوری|دستگاه|اسکیت|کفشور|سگ|گربه',category):
            return 0
    if keypad_request(query):
        if category!='گوشی موبایل':return 0
        title=normalize_text(title or '')
        if re.search(r'دکمه\s*ای|گوشی\s+ساده',title):return 1
        for spec in json.loads(specs or '[]'):
            key=normalize_text(spec.get('key') or '');value=normalize_text(spec.get('value') or '')
            if key in ('نوع گوشی','نوع تلفن همراه') and value in ('ساده','دکمه ای'):return 1
            if re.search(r'صفحه\s*کلید|کیبورد',key) and re.search(r'دارد|فیزیکی|عددی|دکمه',value) and not re.search(r'ندارد|فاقد|مجازی',value):return 1
        return 0
    return 1


def preference_rank(query,category):
    if re.search(r'کفش|کتانی',normalize_text(query)):
        return 0 if re.search(r'کتانی|اسپرت|طبی',category or '') else 1
    return 0
