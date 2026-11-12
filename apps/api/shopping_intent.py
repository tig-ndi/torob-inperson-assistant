"""Conservative product families backed by the snapshot's own fields."""
import json
import re
from tools.prepare_data import normalize_text

# Orthographic equivalents, not inferred product features. Keep FTS operators
# literal and expand only these bounded brand/model spellings.
MODEL_WORDS = (('ردمی', 'redmi'), ('نوت', 'note'), ('گلکسی', 'galaxy'),
               ('پوکو', 'poco'), ('سامسونگ', 'samsung'), ('شیائومی', 'xiaomi'), ('آیفون', 'ایفون', 'iphone'))


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
    # FTS also indexes compatibility/specification prose; absence from the
    # recorded identity must fail even if those other fields mention the model.
    return False


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
    latest_smart=bool(re.search(r'گوشی\s+هوشمند',latest))
    keep_smart=bool(re.search(r'گوشی\s+هوشمند',normalize_text(previous or '')))
    any_kind=bool(re.search(r'نوع گوشی.*فرقی ن(?:دارد|داره)',latest))
    if latest_smart or keep_smart and not keypad_request(latest) and not any_kind:
        query=re.sub(r'دکمه\s*ای|هوشمند','',query).strip()
        query=re.sub(r'^گوشی', 'گوشی هوشمند',query)
    elif any_kind:
        query=re.sub(r'دکمه\s*ای|هوشمند','',query).strip()
    return query


def keypad_request(text):
    text=normalize_text(text)
    return bool(re.search(r'گوشی\s+دکمه\s*ای|دکمه\s*های?\s+درشت',text))


def brand_exclusions(query):
    """Keep exclusions in the existing literal topic, apply them to recorded identity."""
    text = normalize_text(query)
    return [aliases for aliases in MODEL_WORDS if any(re.search(
        r'(?<!\w)(?:غیر\s*|به\s*جز\s+|بجز\s+|بدون\s+)' + re.escape(word) + r'(?!\w)', text)
        for word in aliases)]


def positive_brand_query(query):
    text = normalize_text(query)
    for aliases in brand_exclusions(text):
        for word in aliases:
            text = re.sub(r'(?<!\w)(?:غیر\s*|به\s*جز\s+|بجز\s+|بدون\s+)' + re.escape(word) + r'(?!\w)', ' ', text)
    return ' '.join(text.split())


def contradictory_brands(text):
    """An explicit positive brand and a rejection require a user decision."""
    text = normalize_text(text)
    conflicts = []
    for aliases in MODEL_WORDS:
        words = '(?:' + '|'.join(re.escape(word) for word in aliases) + ')'
        rejection = (rf'(?<!\w)(?:(?:غیر\s*|بدون\s+|به\s*جز\s+|بجز\s+){words}'
                     rf'|{words}(?:\s+(?:را|رو))?\s+(?:نباش(?:ه|د)|نمی\s*خوا(?:هم|م)|نمی\s*خوام))(?!\w)')
        if re.search(rejection, text) and re.search(rf'(?<!\w){words}(?!\w)', re.sub(rejection, '', text)):
            conflicts.append(aliases)
    return conflicts


def brand_choice_reply(text, context):
    """A short brand answer edits the current item rather than naming a new item."""
    if not context:
        return None
    text = normalize_text(text).strip(' .!؟')
    for aliases in MODEL_WORDS:
        words = '(?:' + '|'.join(re.escape(word) for word in aliases) + ')'
        match = re.fullmatch(rf'(?P<brand>{words})\s+(?P<negative>ن)?باش(?:ه|د)', text)
        if not match:
            continue
        topic = positive_brand_query(context)
        for word in aliases:
            topic = re.sub(r'(?<!\w)' + re.escape(word) + r'(?!\w)', ' ', topic)
        topic = ' '.join(topic.split())
        topic += ''.join(' غیر' + other[0] for other in brand_exclusions(context) if other != aliases)
        return topic + ' ' + ('غیر' if match['negative'] else '') + match['brand']
    return None


def retrieval_query(query):
    text=positive_brand_query(query)
    text=re.sub(r'(?<!\w)(?:لپ\s*تاپ|لپتاب|لب\s*تاپ|لبتاب)(?!\w)', 'لپ تاپ', text)
    if text.startswith('کابل') and re.search(r'گوشی|موبایل',text):
        text=re.sub(r'گوشی|موبایل',' ',text)
        text=' '.join(text.split())
    if operating_system(text):
        text = re.sub(r'(?<!\w)(?:اندروید(?:ی)?|android|ios|آی\s*او\s*اس)(?!\w)|سیستم\s*عامل', ' ', text)
        text = ' '.join(text.split()) or 'گوشی'
    if re.search(r'گوشی\s+هوشمند',text):
        text=re.sub(r'هوشمند','',text).strip()
    if text in {'شارژر موبایل','شارژر گوشی'}:return 'شارژر'
    if re.search(r'گوشی\s+دکمه\s*ای',text):
        return re.sub(r'دکمه\s*ای','',text).strip()
    return text


def matches_product_kind(query,category,title,specs,brand=None,model=None):
    query=normalize_text(query);category=normalize_text(category or '')
    query=re.sub(r'(?<!\w)(?:لپ\s*تاپ|لپتاب|لب\s*تاپ|لبتاب)(?!\w)', 'لپ تاپ', query)
    # A matching compatibility/specification row is not the identity being bought.
    name = normalize_text(' '.join(filter(None,(title,brand,model))))
    for aliases in brand_exclusions(query):
        if any(re.search(r'(?<!\w)' + re.escape(word) + r'(?!\w)', name) for word in aliases):
            return 0
    query = positive_brand_query(query)
    if re.search(r'پاور\s*بانک',query) and not re.search(r'(?<!\w)(?:باتری|باطری|ماژول|برد|قطعه|کابل|کیف|کاور|قاب|مدار|پوسته)(?!\w)',query):
        if not re.search(r'پاور\s*بانک',category) or re.search(r'(?<!\w)(?:باتری|باطری|ماژول|برد|کابل|کیف|کاور|قاب|مدار|پوسته|قطعه)(?!\w)',normalize_text(title or '')):
            return 0
    for aliases in MODEL_WORDS:
        if any(re.search(r'(?<!\w)' + re.escape(word) + r'(?!\w)', query) for word in aliases):
            if not any(re.search(r'(?<!\w)' + re.escape(word) + r'(?!\w)', name) for word in aliases):
                return 0
            if category == 'گوشی موبایل':
                title_name=normalize_text(title or '').split('|')[0]
                if re.search(r'طرح|مشابه',title_name) and not re.search(r'طرح|مشابه',query):
                    return 0
                if not any(re.search(r'(?<!\w)'+re.escape(word)+r'(?!\w)',title_name) for word in aliases):
                    # The snapshot can mislabel a Univa/Swiss title as Samsung.
                    # Accept a brand-only identity only with a generic/model title,
                    # never override a different literal name in the title.
                    remainder=re.sub(r'(?<!\w)(?:گوشی|موبایل|هوشمند|تلفن|همراه|مدل)(?!\w)',' ',title_name).strip()
                    first=remainder.split()[0] if remainder else ''
                    if first and not any(c.isdigit() for c in first) and not re.fullmatch(r'[a-z]',first):
                        return 0
    if re.search(r'ماشین\s+لباسشویی|یخچال',query) and not re.search(r'قطعه|قطعات|لوازم|یدکی|فن|پروانه|شلنگ|چپقی|برد|فیلتر|درب|دستگیره',query):
        if re.search(r'ماشین\s+لباسشویی',query) and not re.match(r'^ماشین لباسشویی(?:\s|$)',category):
            return 0
        if 'یخچال' in query and not re.match(r'^(?:یخچال|فریزر)(?:\s|$)',category):
            return 0
        if 'یخچال' in query and not re.search(r'یخچال|فریزر',normalize_text(title or '')):
            return 0  # An icebox filed under travel fridges is not a refrigerator.
        if re.search(r'قطعه|قطعات|لوازم|یدکی|فن|پروانه|شلنگ|چپقی|برد|فیلتر|دستگیره',category):
            return 0
    if re.match(r'^کابل(?:\s|$)',query) and not re.search(r'کابل|سیم',category):
        return 0
    if query.startswith('کابل') and re.search(r'گوشی|موبایل',query):
        from apps.api.source_filters import recorded_values
        if not recorded_values(specs,'connector'):
            return 0
    if category in {'گوشی موبایل','باتری گوشی موبایل','تاچ و ال سی دی گوشی و تبلت','کیف و کاور گوشی','محافظ صفحه نمایش گوشی'} and not model_edition_matches(query,name):
        return 0
    platform = operating_system(query)
    if platform and (category != 'گوشی موبایل' or recorded_operating_system(json.loads(specs or '[]')) != platform):
        return 0
    if query in {'شارژر موبایل','شارژر گوشی'} and category!='شارژر گوشی':return 0
    if re.search(r'(?<!\w)کفش(?!\w)',query) and not re.search(r'بند|کفی|واکس|هولدر|جاکفشی|برس|بوگیر|کاور|لوازم',query):
        if not re.search(r'کفش|کتانی',category) or re.search(r'بند|کفی|زیره|واکس|هولدر|جاکفشی|برس|بوگیر|کاور|اکسسوری|دستگاه|اسکیت|کفشور|سگ|گربه',category):
            return 0
    if re.search(r'گوشی\s+هوشمند',query):
        if category!='گوشی موبایل':return 0
        recorded=json.loads(specs or '[]')
        return int(recorded_operating_system(recorded) in {'android','ios'} or any(
            normalize_text(spec.get('key') or '') in {'نوع گوشی','نوع تلفن همراه'} and
            normalize_text(spec.get('value') or '') in {'هوشمند','smartphone'} for spec in recorded))
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
