"""Deterministic P3-A follow-up text and labels; no contact channel or model call."""

from typing import Literal


def _clean(value: str | None, fallback: str) -> str:
    text = ' '.join((value or '').split())
    return text[:200] or fallback


def draft_text(product: dict, offer: dict, visit_time: str | None = None) -> str:
    title = _clean(product.get('persian_title'), 'این کالا')
    shop_name = _clean(offer.get('shop', {}).get('name'), 'فروشگاه انتخابی')
    price = offer.get('price_toman')
    price_text = f'{price} تومان' if price is not None else 'قیمت ثبت‌شده‌ای ندارد'
    changed_at = _clean(offer.get('last_price_changed_at'), 'نامشخص')
    visit = f' قصد مراجعه در ساعت {visit_time} را دارم؛ امکان مراجعه در همین ساعت را هم تأیید می‌کنید؟' if visit_time else ''
    status = offer.get('opening_hours', {}).get('status')
    hours_note = (' طبق برنامهٔ ثبت‌شده، در زمان بررسی بسته است؛ بازبودن هنگام مراجعه باید تأیید شود.' if status == 'declared_closed' else
                  ' ساعت کاری ثبت‌شده نامشخص است؛ پیش از حرکت زمان پذیرش را تأیید کنید.' if status == 'unknown' else '')
    return (
        f'سلام، دربارهٔ «{title}» در {shop_name} پیگیری می‌کنم. '
        'آیا این کالا در حال حاضر موجود است؟ قیمت روز آن چقدر است و برای مراجعه '
        f'چه ساعتی یا شرایطی دارد؟ (قیمت تاریخی ثبت‌شده: {price_text}؛ زمان آخرین تغییر ثبت‌شدهٔ قیمت: {changed_at}؛ '
        f'این عدد موجودی یا قیمت روز را تأیید نمی‌کند.){visit}{hours_note}'
    )


def prepare_limitations() -> list[str]:
    return [
        'این پیش‌نویس ارسال نشده است؛ هیچ تماس، پاسخ یا تأیید فروشنده‌ای دریافت نشده است.',
        'قیمت و زمان تغییر آن تاریخی‌اند و موجودی یا قیمت روز را تأیید نمی‌کنند.',
        'فقط دادهٔ ثبت‌شدهٔ منبع نمایش داده می‌شود؛ ساعات و شرایط پرداخت تأیید زندهٔ فروشنده نیستند.',
        'شماره‌های تماس دیتاست ساختگی‌اند؛ این پاسخ هیچ شماره یا لینک تماس ارائه نمی‌دهد.',
    ]


def alternatives_limitations(source: Literal['simulated', 'user_report'], excluded_count: int,
                             has_alternatives: bool) -> list[str]:
    source_label = 'شبیه‌سازی‌شده' if source == 'simulated' else 'گزارش کاربر'
    limitations = [
        f'این نتیجه {source_label} است و تأیید خارجی یا تأیید فروشنده نیست.',
        'زمان دریافت گزارش، زمان تأیید فروشنده نیست؛ دادهٔ تاریخی منبع تغییر نکرده است.',
        f'همهٔ {excluded_count} آفر ثبت‌شدهٔ فروشگاه گزارش‌شده از جایگزین‌ها کنار گذاشته شد.',
        'بودجه، شعاع، ساعات، اعتبار و ترتیب دقیقاً با شرایط درخواست اعمال شدند و شل نشدند.',
        'موجودی آفرهای جایگزین همچنان تأییدنشده است و باید پیش از مراجعه بررسی شود.',
    ]
    if not has_alternatives:
        limitations.append('هیچ آفر جایگزینی برای همین محصول با این شرایط پیدا نشد؛ محصول دیگری جایگزین نشد.')
    return limitations
