# دستیار خرید حضوری ترب

پایهٔ پروژهٔ چالش ترب در Starcoach. کاربر از انتخاب محصول به مقایسهٔ فروشندگان، انتخاب محل مراجعه و پیگیری وضعیت می‌رسد.

مخزن: https://github.com/tig-ndi/torob-inperson-assistant — خصوصی طبق تنظیم کاربر. Push و تنظیمات مخزن با کاربر است.

## وضعیت فعلی

Base آماده است: قرارداد مسئله، معماری پیشنهادی، طراحی UX، برنامهٔ اجرا، معیار ارزیابی، Skill بررسی‌شده و ابزار آماده‌سازی داده وجود دارند. **هنوز UI محصول، HTTP API، اتصال LLM، تماس واقعی و دیپلوی پیاده‌سازی نشده‌اند.** این‌ها کار چت کدنویسی‌اند. مطابق تصمیم کاربر، دیپلوی و انتخاب بودجه/سرویس برای بعد هستند.

## شروع برای کدنویسی

`MASTER_PROMPT.md` را به چت کدنویسی بده. وضعیت جاری در `HANDOFF.md` و کار بعدی در `TASKS.md` است. یک عامل در هر زمان مالک کدنویسی باشد؛ Codex اولویت اول است.

## اجرای base

نیازمندی: Python 3.11+ با SQLite FTS5؛ بدون نصب پکیج. اجرای واقعی روی Python 3.14.2 / SQLite 3.50.4 انجام شده است. دستورات را در ریشهٔ پروژه اجرا کن.

```powershell
Set-Location 'D:\starcoach\torob'
python -X utf8 -m unittest discover -s tests -v
python -X utf8 -m tools.prepare_data --source 'D:\starcoach\starcoach-dataset-v16-cap300-csv'
```

دستور دوم در این محیط قبلاً اجرا شده و `.local/catalogue.sqlite3` و `.local/data-profile.json` ساخته شده‌اند. برای حفظ snapshot قبلی، خروجی موجود بازنویسی نمی‌شود. اگر نیاز به بازسازی داری، نام تازه انتخاب کن:

```powershell
python -X utf8 -m tools.prepare_data --source 'D:\starcoach\starcoach-dataset-v16-cap300-csv' --database '.local/catalogue-v2.sqlite3' --report '.local/data-profile-v2.json'
```

این مسیر دیتاست مختص سیستم فعلی است؛ هم‌تیمی‌ها مسیر نسخهٔ محلی خود را به `--source` بدهند. CSV و DB را به ریپو اضافه نکنید. ابزار هدر، JSON، نوع داده، شناسهٔ تکراری، روابط، سقف محصولات و integrity را بررسی می‌کند، SHA-256 منابع را ثبت می‌کند و ایندکس جست‌وجوی فارسی می‌سازد. این کار کیفیت معنایی همهٔ داده‌ها یا دقت یک ایجنت را اثبات نمی‌کند.

## فایل‌های اصلی

- `project-overview.md`: نیازمندی‌ها، چهار گام خرید و ابهام‌ها.
- `ARCHITECTURE.md` و `DESIGN.md`: معماری و رفتار UI پیشنهادی.
- `TASKS.md` و `EVALUATION.md`: ترتیب کار و شواهد لازم برای پذیرش.
- `DECISIONS.md` و `HANDOFF.md`: تصمیم‌ها و انتقال وضعیت.
- `docs/DATA.md`: قرارداد CSV و خطرهای دادهٔ واقعی.
- `docs/SOURCES.md` و `docs/SKILLS.md`: منشأ اطلاعات و نتیجهٔ بررسی Skill.
- `docs/GIT.md`: دستورهای دستی انتشار base؛ اجرا با کاربر.
- `tools/prepare_data.py` و `tests/test_prepare_data.py`: ابزار واقعی و تست‌های مرزی آن.

فایل `.env.example` پس از انتخاب متغیرهای واقعی API/LLM در فاز مربوط ساخته می‌شود؛ در base هیچ secret یا متغیر مصرف‌نشده‌ای تعریف نشده است.
