# دستیار خرید حضوری ترب

پایهٔ پروژهٔ چالش ترب در Starcoach. کاربر از انتخاب محصول به مقایسهٔ فروشندگان، انتخاب محل مراجعه و پیگیری وضعیت می‌رسد.

مخزن: https://github.com/tig-ndi/torob-inperson-assistant — خصوصی طبق تنظیم کاربر. Push و تنظیمات مخزن با کاربر است.

## وضعیت فعلی

Base و P1a آماده‌اند: import واقعی و API فقط‌خواندنی جست‌وجو/جزئیات/آفر با فیلتر بودجه و تست. **UI، محدوده/فاصله، اتصال LLM، تماس واقعی و دیپلوی هنوز پیاده‌سازی نشده‌اند؛ P1 کامل نیست.** قدم بعد P1b در TASKS است. دیپلوی و انتخاب بودجه/سرویس برای بعد هستند. عملیات محلی Git و کامیت با عامل مجاز است؛ push با کاربر.

## شروع برای کدنویسی

`MASTER_PROMPT.md` را به چت کدنویسی بده. وضعیت جاری در `HANDOFF.md` و کار بعدی در `TASKS.md` است. یک عامل در هر زمان مالک کدنویسی باشد؛ Codex اولویت اول است.

## اجرای base

نیازمندی: Python 3.11+ با SQLite FTS5؛ بدون نصب پکیج. اجرای واقعی روی Python 3.14.2 / SQLite 3.50.4 انجام شده است. دستورات را در ریشهٔ پروژه اجرا کن.

این توضیح بی‌نیازی از نصب فقط برای importer و ۹ تست base است. suite کامل اکنون API را هم تست می‌کند و نصب requirements.lock.txt مطابق بخش بعد لازم دارد.

```powershell
Set-Location 'D:\starcoach\torob'
python -X utf8 -m unittest discover -s tests -p test_prepare_data.py -v
python -X utf8 -m tools.prepare_data --source 'D:\starcoach\starcoach-dataset-v16-cap300-csv'
```

دستور دوم در این محیط قبلاً اجرا شده و `.local/catalogue.sqlite3` و `.local/data-profile.json` ساخته شده‌اند. برای حفظ snapshot قبلی، خروجی موجود بازنویسی نمی‌شود. اگر نیاز به بازسازی داری، نام تازه انتخاب کن:

```powershell
python -X utf8 -m tools.prepare_data --source 'D:\starcoach\starcoach-dataset-v16-cap300-csv' --database '.local/catalogue-v2.sqlite3' --report '.local/data-profile-v2.json'
```

این مسیر دیتاست مختص سیستم فعلی است؛ هم‌تیمی‌ها مسیر نسخهٔ محلی خود را به `--source` بدهند. CSV و DB را به ریپو اضافه نکنید. ابزار هدر، JSON، نوع داده، شناسهٔ تکراری، روابط، سقف محصولات و integrity را بررسی می‌کند، SHA-256 منابع را ثبت می‌کند و ایندکس جست‌وجوی فارسی می‌سازد. این کار کیفیت معنایی همهٔ داده‌ها یا دقت یک ایجنت را اثبات نمی‌کند.

## اجرای P1a محلی

محیط بررسی‌شده: Python 3.14.2 / Windows؛ وابستگی‌های دقیق API و تست در requirements.lock.txt هستند. از ریشهٔ پروژه:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -X utf8 -m tools.smoke_api
.\.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

venv موجود را دوباره نسازید. تست‌ها ۱۸ مورد مصنوعی‌اند؛ smoke جداگانه ۷ بررسی روی snapshot واقعی و حفظ hash را انجام می‌دهد. smoke از ASGI درون‌پردازشی استفاده می‌کند؛ جای تست مرورگر نیست. هشدار deprecation مربوط به TestClient/httpx در نسخهٔ نصب‌شده وجود دارد و مانع اجرای تست نیست. CI وابستگی‌ها را نصب می‌کند، ولی نتیجهٔ GitHub هنوز بررسی نشده است.

پس از اجرای سرور، مستندات تعاملی محلی در [API docs](http://127.0.0.1:8000/docs) است؛ `/api/products?q=...`، `/api/products/{product_id}` و `/api/products/{product_id}/offers` ساخته شده‌اند. قرارداد کامل در docs/API.md است. برای مسیر متفاوت DB، متغیر محیطی TOROB_DATABASE را در همان ترمینال تنظیم کنید؛ .env.example فقط نمونه است و خودکار بارگذاری نمی‌شود. داده/شمارهٔ تماس به سرویس خارجی ارسال نمی‌شود.

## فایل‌های اصلی

- `project-overview.md`: نیازمندی‌ها، چهار گام خرید و ابهام‌ها.
- `ARCHITECTURE.md` و `DESIGN.md`: معماری و رفتار UI پیشنهادی.
- `TASKS.md` و `EVALUATION.md`: ترتیب کار و شواهد لازم برای پذیرش.
- `DECISIONS.md` و `HANDOFF.md`: تصمیم‌ها و انتقال وضعیت.
- `docs/DATA.md`: قرارداد CSV و خطرهای دادهٔ واقعی.
- `docs/SOURCES.md` و `docs/SKILLS.md`: منشأ اطلاعات و نتیجهٔ بررسی Skill.
- `docs/GIT.md`: قواعد کامیت محلی عامل و دستور push برای کاربر.
- `docs/API.md`: قرارداد قابل‌مصرف P1a برای UI بعدی.
- `tools/prepare_data.py` و `tests/test_prepare_data.py`: ابزار واقعی و تست‌های مرزی آن.

فایل `.env.example` فقط تنظیم اختیاری مسیر واقعی snapshot را توضیح می‌دهد؛ متغیر یا secret سرویس LLM هنوز تعریف نشده است.
