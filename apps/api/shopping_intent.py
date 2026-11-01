"""Conservative product families backed by the snapshot's own fields."""
import json
import re
from tools.prepare_data import normalize_text


def keypad_request(text):
    text=normalize_text(text)
    return bool(re.search(r'گوشی\s+دکمه\s*ای|دکمه\s*های?\s+درشت',text))


def retrieval_query(query):
    text=normalize_text(query)
    if text in {'شارژر موبایل','شارژر گوشی'}:return 'شارژر'
    if re.search(r'گوشی\s+دکمه\s*ای',text):
        return re.sub(r'دکمه\s*ای','',text).strip()
    return query


def matches_product_kind(query,category,title,specs):
    query=normalize_text(query);category=normalize_text(category or '')
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
