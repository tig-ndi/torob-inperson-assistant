# دستیار خرید حضوری ترب

پایهٔ پروژهٔ چالش ترب در Starcoach. کاربر از انتخاب محصول به مقایسهٔ فروشندگان، انتخاب محل مراجعه و پیگیری وضعیت می‌رسد.

مخزن: https://github.com/tig-ndi/torob-inperson-assistant — خصوصی طبق تنظیم کاربر. Push و تنظیمات مخزن با کاربر است.

## وضعیت فعلی

P1 برای ادامهٔ داخلی پروژه پذیرفته شده: جست‌وجو، مقایسهٔ ۲–۳ محصول، آفرهای واقعی، بودجه و محدوده/فاصله با UI فارسی/RTL و دو اصلاح UX بررسی‌شدهٔ کاربر موجودند. گام نخست P2 (ساعات مراجعه و فیلتر اعلام‌شدهٔ اکنون باز) نیز ساخته و محلی بررسی شده است؛ هنوز بررسی دستی ساعات توسط کاربر انجام نشده. خرید اعتباری، LLM، پیگیری واقعی و دیپلوی باقی‌اند؛ P2 کامل نیست. Git محلی/کامیت با عامل مجاز و push/remote فقط با کاربر است.

## شروع برای کدنویسی

`MASTER_PROMPT.md` و `NEXT_AGENT_PROMPT.md` فقط روی همین دستگاه نگهداری می‌شوند؛ اگر موجودند برای انتقال استفاده کن. در clone جدید، قواعد AGENTS و HANDOFF/TASKS مرجع‌اند. وضعیت جاری در `HANDOFF.md` و کار بعدی در `TASKS.md` است. یک عامل در هر زمان مالک کدنویسی باشد؛ Codex اولویت اول است.

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

## اجرای API محلی

محیط بررسی‌شده: Python 3.14.2 / Windows؛ وابستگی‌های دقیق API و تست در requirements.lock.txt هستند. از ریشهٔ پروژه:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -X utf8 -m tools.smoke_api
.\.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

venv موجود را دوباره نسازید. suite فعلی ۳۰ تست مصنوعی domain/API/import دارد؛ smoke_api جداگانه ۷ بررسی روی snapshot واقعی و حفظ hash را انجام می‌دهد. smoke از ASGI درون‌پردازشی استفاده می‌کند؛ جای تست مرورگر نیست. هشدار deprecation مربوط به TestClient/httpx در نسخهٔ نصب‌شده وجود دارد و مانع اجرای تست نیست. CI وابستگی‌ها را نصب می‌کند، ولی نتیجهٔ GitHub هنوز بررسی نشده است.

پس از اجرای سرور، مستندات تعاملی محلی در [API docs](http://127.0.0.1:8000/docs) است؛ `/api/products?q=...`، `/api/products/{product_id}` و `/api/products/{product_id}/offers` ساخته شده‌اند. قرارداد کامل در docs/API.md است. برای مسیر متفاوت DB، متغیر محیطی TOROB_DATABASE را در همان ترمینال تنظیم کنید؛ .env.example فقط نمونه است و خودکار بارگذاری نمی‌شود. داده/شمارهٔ تماس به سرویس خارجی ارسال نمی‌شود.

## اجرای رابط جست‌وجوی محلی

Node 24.12.0 / npm 11.19.1 این نوبت بررسی شدند؛ نسخه‌ها و resolvedها در apps/web/package.json و package-lock.json قفل‌اند. API بخش بالا را روی 8000 اجرا کنید؛ در ترمینال دیگر:

```powershell
Set-Location 'D:\starcoach\torob\apps\web'
npm ci --no-fund --no-audit
npm run dev
```

پیش‌نمایش: [رابط محلی](http://127.0.0.1:5173). Vite مسیر /api را به 127.0.0.1:8000 proxy می‌کند. `npm run build` شامل TypeScript strict است. build استاتیک API را میزبانی نمی‌کند؛ دیپلوی تنظیم نشده است.

برای تست مرورگر از apps/web با backend نصب‌شده و DB موجود، پورت‌های 18000 و 15173 آزاد باشند؛ تست سرورهای تازهٔ همین کد را اجرا/جمع می‌کند و به سرورهای کاربر روی 8000/5173 دست نمی‌زند. در صورت اشغال پورت تست، خطا می‌دهد و سرور ناشناس را reuse نمی‌کند:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='D:\starcoach\torob\.local\pw-browsers'
npx playwright install chromium
npm run test:e2e
```

Chromium در .local می‌ماند؛ دستگاه دیگر مسیر همان دستگاه را بدهد. تست headless تک‌worker است: ۱۷ تست شامل ۶ مسیر دیتاست واقعی، ۱۰ سناریوی پاسخ مصنوعی و یک تست ورودی UI بدون درخواست داده. ترکیب بودجه/شعاع/ساعت و صفحه‌بندی در تست API با زمان ثابت جدا بررسی می‌شود. تصاویر در .local/qa خارج Git هستند. UI تصاویر/فونت خارجی نمی‌گیرد؛ placeholder خنثی است. مقایسه/آفر/بودجه/محدوده و ساعات اکنون در UI موجودند؛ پرداخت اعتباری و مدل باقی‌اند.

## بررسی ساعات و دادهٔ واقعی

نصب requirements.lock.txt شامل tzdata برای IANA/Asia/Tehran روی Windows است. بعد از تغییر API، سرور توسعهٔ قبلی را خودتان با Ctrl+C متوقف و با فرمان بالاتر دوباره اجرا کنید؛ فرآیند قدیمی Python کد تازه را خودکار بارگذاری نمی‌کند. درخواست‌های تست از سرور مستقل استفاده می‌کنند.

```powershell
.\.venv\Scripts\python.exe -X utf8 -m tools.smoke_hours
```

این smoke زمان چهارشنبه ۲۰۲۶-۱۰-۲۱ ساعت ۱۲ تهران را ثابت می‌گیرد؛ وضعیت‌های دادهٔ واقعی و IDs آفرهای باز را با oracle مستقل SQL می‌سنجد و hash DB را کنترل می‌کند. زمان ثابت، تأیید بازبودن واقعی امروز نیست. جزئیات قرارداد و عدم قطعیت در docs/API.md است. در UI، آفر را باز کنید و فیلتر «فقط فروشگاه‌هایی که طبق ساعات ثبت‌شده اکنون بازند» را امتحان کنید؛ timestamp و دکمهٔ به‌روزرسانی نشان می‌دهند وضعیت چه زمانی محاسبه شده است. برای backend سفارشیِ توسعه، TOROB_API_PORT فقط پورت proxy محلی Vite را تعیین می‌کند؛ پیش‌فرض 8000 است.

## فایل‌های اصلی پروژه

- `project-overview.md`: نیازمندی‌ها، چهار گام خرید و ابهام‌ها.
- `ARCHITECTURE.md` و `DESIGN.md`: معماری و رفتار UI پیشنهادی.
- `TASKS.md` و `EVALUATION.md`: ترتیب کار و شواهد لازم برای پذیرش.
- `DECISIONS.md` و `HANDOFF.md`: تصمیم‌ها و انتقال وضعیت.
- `docs/DATA.md`: قرارداد CSV و خطرهای دادهٔ واقعی.
- `docs/SOURCES.md` و `docs/SKILLS.md`: منشأ اطلاعات و نتیجهٔ بررسی Skill.
- `docs/GIT.md`: قواعد کامیت محلی عامل و دستور push برای کاربر.
- `docs/API.md`: قرارداد جاری کاتالوگ، بودجه، فاصله و ساعات؛ `apps/api/hours.py` و `tests/test_hours.py` منطق و تست ساعات را دارند.
- `tools/prepare_data.py` و `tests/test_prepare_data.py`: ابزار واقعی و تست‌های مرزی آن.

فایل `.env.example` فقط تنظیم اختیاری مسیر واقعی snapshot را توضیح می‌دهد؛ متغیر یا secret سرویس LLM هنوز تعریف نشده است.
