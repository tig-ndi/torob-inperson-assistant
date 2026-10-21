# قرارداد P1a — API کاتالوگ تاریخی

نسخهٔ محلی 0.1.0؛ فقط‌خواندنی، با مدل پاسخ strict. این API موجودی زنده یا تماس فروشنده ندارد. UI جست‌وجو/کارت ساخته شده؛ UI مقایسه/آفر و محدوده/فاصله در ادامهٔ P1b باقی‌اند.

## اجرا و تنظیمات

به‌روزرسانی P1b: UI جست‌وجو/کارت در apps/web اکنون endpoint جست‌وجو را مصرف می‌کند؛ مقایسه/آفر/بودجه در UI و محدوده/فاصله هنوز باقی‌اند. قرارداد backend این نوبت تغییر نکرده است.

نصب/run در README است. DB پیش‌فرض مستقل از cwd در ریشهٔ پروژه/.local/catalogue.sqlite3 است؛ متغیر اختیاری TOROB_DATABASE مسیر دیگر را تعیین می‌کند. .env خودکار بارگذاری نمی‌شود. اتصال mode=ro و query_only است؛ فایل ناموجود ساخته نمی‌شود. Uvicorn فقط روی 127.0.0.1 با --no-access-log اجرا شود. P1b از proxy Vite برای /api استفاده کند؛ CORS باز نداریم.

## endpointها

- `GET /api/products?q=گوشی&limit=20&offset=0&max_price_toman=10000000`: پاسخ items، has_more، limit، offset، provenance. query الزامی و حداکثر ۱۲۰ کاراکتر، بعد از نرمال‌سازی ۱–۱۲ واژهٔ حرفی/عددی؛ واژه‌ها literal با AND هستند. عملگر/prefix آزاد FTS نداریم. رتبهٔ FTS و product_id ترتیب را مشخص می‌کنند؛ جست‌وجوی معنایی نیست.
- `GET /api/products/{product_id}`: پاسخ product و provenance؛ محصول شامل product_id، persian_title، brand_name، model، category_name، image_urls، specs و offer_summary است. مقایسهٔ ۲–۳ محصول در UI از همین endpoint استفاده کند. عنوان null/خالی و specs/image_urls خالی مجازند؛ fallback لازم است.
- `GET /api/products/{product_id}/offers?limit=20&offset=0&max_price_toman=10000000&user_lat=35.7&user_lon=51.4&max_distance_km=5`: items با offer_id، product_id، shop_id، price_toman، price_quality، last_price_changed_at، seller_title، description، warranty، inventory_status، direct_distance_meters و shop شامل name/address/location_label/lat/lon. contact یا لینک تماس خروجی ندارد. category-only در فروشنده‌های محصول وارد نمی‌شود.

مختصات کاربر (user_lat بین ۹۰- و ۹۰، user_lon بین ۱۸۰- و ۱۸۰) باید هر دو با هم ارائه شوند. تعیین max_distance_km نیازمند ارائهٔ هر دو مختصات است و مقادیر نامتناهی یا کمتر/مساوی صفر با 422 رد می‌شوند. فاصله با فرمول کروی Haversine (شعاع ۶۳۷۱ کیلومتر) پیش از گردکردن محاسبه و شرط شعاع قبل از LIMIT و OFFSET اعمال می‌شود. has_more بر مبنای نتایج فیلترشده است. فروشگاه‌های فاقد مختصات در صورت فعال بودن شعاع حذف می‌شوند و در نبود شعاع با direct_distance_meters=null باقی می‌مانند (نبود مختصات به معنی فاصلهٔ صفر نیست). direct_distance_meters عدد صحیح به متر است و صرفاً فاصلهٔ مستقیم هوایی است، نه مسافت یا زمان مسیر رانندگی/پیاده‌روی.

شناسهٔ محصول opaque و طول آن ۱–۲۰۰ کاراکتر بدون control character است. limit بین ۱ و ۵۰ و offset بین صفر و یک میلیون است. has_more برای صفحهٔ بعد؛ شمارش کل جست‌وجو انجام نمی‌شود. budget رشتهٔ ASCII با ۱–۱۹ رقم و حداکثر 9223372036854775807 است. اعشار/منفی/بزرگ‌تر 422؛ مقایسه با integer دقیق SQLite انجام می‌شود.

بودجهٔ جست‌وجو فقط محصول با حداقل یک آفر قیمت‌دار زیر سقف را نگه می‌دارد؛ قیمت نامعلوم واجد شرط نیست. **offer_summary همیشه کل آفرهای منبع محصول است**: offer_count، min_price_toman، max_price_toman و missing_price_count. UI عنوان «بازهٔ کل قیمت‌های ثبت‌شده» بدهد؛ برای آفرهای واجد سقف endpoint آفر را با همان budget فراخوانی کند.

آفرها قیمت عددی صعودی، null در انتها، سپس offer_id مرتب می‌شوند؛ این ترتیب ادعای بهترین فروشنده نیست. چند آفر یک shop/product با عنوان/ضمانت متفاوت محفوظ می‌مانند.

## دقت و منشأ

همهٔ قیمت‌های JSON رشتهٔ دهدهی‌اند؛ null همان null است. UI قیمت را برای محاسبه به Number تبدیل نکند و از BigInt/رشته استفاده کند. price_quality برابر missing، above_js_safe_integer (بیش از ۲^۵۳−۱) یا not_assessed است؛ این مدل تشخیص قیمت بازار نیست. تاریخ خام منبع حفظ شده؛ عنوان نمایشی «آخرین تغییر قیمت ثبت‌شده» با timezone تهران باشد، نه تأیید موجودی.

هر پاسخ موفق provenance دارد: snapshot_id (SHA-256 متن metadata.profile)، dataset، generated_at_utc، currency=toman و inventory_status=unconfirmed. خود آفر نیز unconfirmed است. generated_at زمان ساخت snapshot است، نه تأیید فروشنده. متن/URL منبع نامطمئن‌اند؛ HTML فروشنده اجرا نشود. ساعات/اعتبار هنوز ارزیابی نمی‌شوند.

## خطا و بازیابی

- 200 با items خالی: مدرکی مطابق query/filter در این صفحه نیست.
- 404: محصول در snapshot نیست؛ محصول موجود بدون آفر 200 و لیست خالی است.
- 422: ورودی نامعتبر؛ UI فیلترها را برای اصلاح حفظ کند.
- 503 با code=catalogue_unavailable: DB ناموجود/خراب/ناسازگار، سقف اجرای SQLite یا nested data نامعتبر. نتیجهٔ خالی نیست؛ مسیر و snapshot بررسی و سپس retry شود. متن حساس منبع در خطا افشا نمی‌شود.

detail خطای 422 استاندارد FastAPI ممکن است رشته یا لیست باشد؛ UI فرض رشته نکند. پاسخ دیررس با AbortController/شناسهٔ درخواست در P1b کنترل شود. تست واقعی UI جست‌وجو/کارت در Chromium اجرا شده؛ مسیر کامل مقایسه/فروشنده هنوز بررسی نشده است.
