# تحویل جاری — P1a به عامل ترتیبی بعدی

تاریخ: ۲۰۲۶-۱۰-۲۱، Asia/Tehran. **B0 و P1a کامل؛ P1b شروع‌نشده؛ P1 کامل نیست.** بخش B0 پایین این فایل صرفاً سابقه است.

## مجوز و مرز فعلی

کاربر شروع P1 و تحویل کوچک پیش از مصرف سهمیه را خواست؛ حدود ۲۰٪ باقی‌مانده گزارش خود کاربر است، نه اندازه‌گیری ابزار. فقط یک مالک و بدون زیرعامل. **عملیات محلی Git و کامیت با عامل مجاز است؛ push و تغییر remote با کاربر.** قالب عنوان type(scope): summary و بدنهٔ bulletدار با فاصله، شامل تغییرات و بررسی‌های مهم. مجوز قبلی در AGENTS/MASTER_PROMPT/DECISIONS/docs/GIT یکدست شد. عامل push نکرده است. دیپلوی/provider/هزینه برای بعد؛ برای P1b دوباره سؤال نکنید.

در شروع این نوبت main، origin=https://github.com/tig-ndi/torob-inperson-assistant.git، HEAD=0422c54 و working tree تمیز بود. hash تحویل را با git log -1 بخوانید؛ hash خودارجاع در همان کامیت ثبت نمی‌شود. پیش از ادامه status/diff را بررسی و تغییرات بعدی کاربر را حفظ کنید. دعوت‌ها/remote CI بررسی نشده‌اند.

## ساخته‌شده در P1a

- apps/api/catalogue.py: SQLite mode=ro و query_only، query پارامتری، FTS فارسی literal/AND، بودجهٔ integer، صفحه‌بندی و سقف اجرای query، خلاصهٔ آفرها و provenance snapshot.
- apps/api/main.py و models.py: سه endpoint جست‌وجو/جزئیات/آفر، پاسخ strict، تفکیک خطای 404/422/503. قیمت decimal string، null مستقل، offer_idهای چندگانه محفوظ؛ هیچ contact/شماره/لینک تماس خروجی ندارد.
- tests/test_api.py: ۹ تست رفتار مصنوعی مستقل؛ tools/smoke_api.py: smoke جداگانهٔ dataset واقعی و hash بدون تغییر.
- requirements.lock.txt، .env.example مسیر DB و نصب وابستگی در workflow CI. قرارداد مصرف UI در docs/API.md؛ تصمیم D09/D10 و README/TASKS به‌روز شدند.

محیط .venv مجزا ساخته شد؛ global تغییر نکرد. FastAPI 0.157.0 / Pydantic 2.14.1 / Uvicorn 0.54.0 / httpx 0.28.1 روی Python 3.14.2 / Windows؛ تمام resolved dependencyها قفل‌اند و APIهای مصرف‌شده با کد نصب‌شده و تست تأیید شدند. frontend هنوز نصب نشده. نسخهٔ Node/npm پایین فایل مربوط به مشاهدهٔ B0 است و این نوبت دوباره اندازه‌گیری نشد.

خلاصهٔ محصول کل آفرهای منبع است؛ فیلتر بودجهٔ جست‌وجو فقط شرط وجود آفر واجد سقف دارد، endpoint آفر ردیف‌ها را فیلتر می‌کند. آفرها قیمت صعودی، null آخر، سپس offer_id؛ این بهترین‌فروشنده نیست. above_js_safe_integer هشدار precision است، نه تشخیص outlier بازار. قیمت و timestamp هیچ‌کدام موجودی تأییدشده نیستند.

## شواهد واقعی این نوبت

قبل از تغییر، تست پایه با Python سیستم اجرا شد: ۹ موفق. پس از ساخت API، از ریشه:

```powershell
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -X utf8 -m tools.smoke_api
```

۱۸ تست (۹ base + ۹ API) موفق، بدون skip؛ pip check بدون dependency خراب. smoke واقعی: ۷ بررسی موفق؛ صفحات «گوشی»، «کفش»، «سونی» هرکدام ۳ نتیجه و has_more=true؛ تطبیق مستقل null/قیمت بزرگ با SQL منبع، حفظ مجموعهٔ چندآفر یک زوج و بودجه. SHA-256 کل DB قبل/بعد برابر؛ زمان مشاهده‌شده حدود ۱٫۶۵ ثانیه روی این دستگاه بود، نه benchmark یا سنجش accuracy.

HTTP واقعی جدا: Uvicorn موقت فقط روی 127.0.0.1 با پورت آزاد و --no-access-log؛ ۴ بررسی موفق /openapi.json، جست‌وجو، جزئیات و آفر با دادهٔ واقعی. سرور در finally بسته شد؛ سرور تحویلِ پس‌زمینه عمداً باقی نمانده. فرمان run در README است.

هشدار باز: Starlette 1.9.0 مسیر httpx در TestClient را deprecated اعلام می‌کند؛ فعلاً کار می‌کند و تست‌ها موفق‌اند. Python 3.12/Linux فقط در CI تنظیم است؛ اجرا نشده. محیط محدود ترمینال پیش از فرمان خطای setup refresh/helper_unknown_error داشت؛ همان عملیات محلی با مسیر مجاز require_escalated اجرا شدند. apply_patch عادی کار کرد؛ کد را برای خطای ابزار بازنویسی نکنید.

**ساخته/اجرا نشده:** UI و نصب frontend، build/typecheck، مرورگر/موبایل، محدوده/فاصله، شرایط ساعات/اعتبار، مدل/eval معنایی، تماس فروشنده، GitHub CI، Docker runtime، دیپلوی/ویدئو. ASGI و HTTP محلی deployed journey نیستند. P1 کامل علامت نخورد.

## داده و قدم بعدی

snapshot موجود .local/catalogue.sqlite3 بازسازی نشد؛ فقط خوانده و hash کنترل شد. آمار import و مسیر دادهٔ B0 پایین فایل همچنان مرجع‌اند. CSV/DB/.venv/secrets در Git نباشند.

P1b طبق TASKS: React/TypeScript strict/Vite و lockfile، proxy /api، جست‌وجو/بودجه، کارت، مقایسهٔ ۲–۳ محصول و آفر، سپس محدودهٔ دستی/فاصلهٔ مستقیم با تست domain/API. loading/empty/error/retry، missing data، پاسخ دیررس و رد geolocation پوشش داده شوند. build/typecheck و مرورگر ۳۶۰/۳۹۰ قبل از پذیرش P1 لازم‌اند. ساعات/اعتبار/مدل در P2، دیپلوی بعد. پرامپت انتقال NEXT_AGENT_PROMPT.md است.

---

# سابقهٔ B0 — تحویل base به چت کدنویسی

تاریخ: ۲۰۲۶-۱۰-۲۱، Asia/Tehran. وضعیت: B0 کامل؛ P1 شروع نشده. این گزارش برای انتقال کار است، نه ادعای آماده‌بودن محصول.

## تصمیم‌های فعلی کاربر

- Base و MASTER_PROMPT آماده و توسعه در چت Codex ادامه پیدا کند.
- push با کاربر؛ دستور بدهید و اجرا نکنید. هیچ فرمان Git در این مأموریت اجرا نشده است.
- مهلت/بودجه/مدل هنوز اعلام نشده؛ دیپلوی برای بعد. این موارد را برای ادامهٔ مستقل محلی دوباره نپرسید.
- Codex اولویت اول؛ fallbackها ترتیبی و یک مالک کدنویسی.

## آنچه واقعاً انجام شد

پوشه در شروع خالی و فاقد Git بود. متن کامل چالش و رونویس ویدئو خوانده شدند؛ اصل ویدئو دیده نشد. صفحهٔ رسمی در ابزار وب در دسترس نبود. ZIP با یک Skill و چهار reference بررسی و بدون تغییر در .agents/skills نصب شد؛ استفادهٔ خودکار آن در چت تازه هنوز جدا باید بررسی شود.

اسناد ریشه، قرارداد داده، provenance، برنامهٔ اجرا و مستر پرامپت نوشته شدند. ابزار `tools/prepare_data.py`، ۹ تست مرزی، .gitignore و CI پایه ساخته شدند. هیچ dependency محصول نصب نشده است. .env.example تعریف نشده چون هنوز متغیر مصرف‌شدهٔ محصول نداریم.

## اجرا و شواهد

محیط مشاهده‌شده: Node v24.12.0، npm 11.19.1، Python 3.14.2، SQLite 3.50.4 با FTS5، Docker CLI 29.2.0. وجود CLI به معنی آماده‌بودن daemon یا تأیید deploy نیست.

فرمان تست: `python -X utf8 -m unittest discover -s tests -v` — اجرای نهایی ۹ تست، همه موفق، بدون skip. آزمون اولیه یک خطای cleanup اتصال SQLite در Windows داشت؛ با بستن صریح اتصال اصلاح و suite کامل دوباره اجرا شد. تست‌های اضافه، اعداد پول بزرگ و ترتیب زمانی timezoneهای متفاوت را پوشش می‌دهند.

فرمان import اولیه: `python -X utf8 -m tools.prepare_data --source 'D:\starcoach\starcoach-dataset-v16-cap300-csv'` — موفق. پس از تکمیل آمار قیمت/تاریخ، import کامل نهایی با خروجی موقت `.local/validated/` اجرا شد و پس از تأیید جای snapshot پایه قرار گرفت. مسیر نهایی: `.local/catalogue.sqlite3` و `.local/data-profile.json`؛ گزارش aggregate قابل‌نسخه‌بندی: `docs/data-profile.json`.

نتیجهٔ import: ۶۴۷۶ shops، ۲۲۵۹۰۳ products، ۳۳۱۵۰۶ offers؛ integrity=ok، FK error=0، FTS rows=225903. دادهٔ اصلی قبل/بعد hash شد و تغییر نکرد. SQLite حدود ۴۱۰ مگابایت است و داخل Git نیست.

Smoke واقعی FTS روی snapshot: «گوشی» ۹۵۸۴، «کفش» ۲۴۱۱ و «سونی» ۷۹۵ نتیجه داشت. این آزمون فقط وجود/کارکرد مسیر بازیابی را نشان می‌دهد، نه accuracy یا تناسب پیشنهاد.

**اجرا نشده:** UI/API محصول، build فرانت‌اند، تست مرورگر، اتصال LLM، eval معنایی، تماس فروشنده، GitHub CI، Docker runtime، دیپلوی و ویدئو. CI فقط فایل تنظیمات است و پس از push باید بررسی شود.

## ریسک‌های مهم برای P1

۱۵۰۸۳ قیمت null، مقادیر پول بسیار بزرگ، تاریخ‌های قدیمی، ۹۵۵۷ زوج shop/product با چند آفر، ۲۶۸۴ فروشگاه بدون آفر. دادهٔ پرداخت channel نامشخص و ساعات خالی دارد. شماره‌ها طبق شرح جعلی‌اند. متن کامل رفتار مطلوب در docs/DATA.md و EVALUATION.md است.

## اقدام بعدی

چت کدنویسی MASTER_PROMPT و اسناد مرتبط را بخواند و آمادهٔ P1 شود؛ با درخواست شروع از کاربر یک مسیر واقعی UI→API→SQLite را بسازد. قبل از تغییر، ۹ تست base را اجرا کند. کار P1 به budget/deploy وابسته نیست. این چت مدیر پروژه باقی می‌ماند؛ تا تحویل صریح، عامل دیگری روی همان فایل‌ها هم‌زمان ننویسد.
