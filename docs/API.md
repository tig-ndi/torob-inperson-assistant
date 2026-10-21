# قرارداد API کاتالوگ تاریخی — P1 و شرایط مراجعهٔ P2

نسخهٔ محلی 0.1.0؛ فقط‌خواندنی، با مدل پاسخ strict. UI جست‌وجو/مقایسه/آفر/بودجه/محدوده و ساعات/شرایط ثبت‌شدهٔ خرید اعتباری ساخته شده‌اند؛ این API موجودی زنده، بازبودن تأییدشده، پرداخت یا تماس فروشنده ندارد.

## اجرا و تنظیمات

apps/web endpointهای کاتالوگ را مصرف می‌کند؛ فیلتر ساعات در همین مسیر آفر افزوده شده و مستقل از LLM/provider است. API قدیمی برای parser جدید UI کافی نیست؛ پس از تغییر کد سرور توسعهٔ Python را دوباره اجرا کنید.

نصب/run در README است. DB پیش‌فرض مستقل از cwd در ریشهٔ پروژه/.local/catalogue.sqlite3 است؛ متغیر اختیاری TOROB_DATABASE مسیر دیگر را تعیین می‌کند. .env خودکار بارگذاری نمی‌شود. اتصال mode=ro و query_only است؛ فایل ناموجود ساخته نمی‌شود. Uvicorn فقط روی 127.0.0.1 با --no-access-log اجرا شود. P1b از proxy Vite برای /api استفاده کند؛ CORS باز نداریم.

## endpointها

- `GET /api/products?q=گوشی&limit=20&offset=0&max_price_toman=10000000`: پاسخ items، has_more، limit، offset، provenance. query الزامی و حداکثر ۱۲۰ کاراکتر، بعد از نرمال‌سازی ۱–۱۲ واژهٔ حرفی/عددی؛ واژه‌ها literal با AND هستند. عملگر/prefix آزاد FTS نداریم. رتبهٔ FTS و product_id ترتیب را مشخص می‌کنند؛ جست‌وجوی معنایی نیست.
- `GET /api/products/{product_id}`: پاسخ product و provenance؛ محصول شامل product_id، persian_title، brand_name، model، category_name، image_urls، specs و offer_summary است. مقایسهٔ ۲–۳ محصول در UI از همین endpoint استفاده کند. عنوان null/خالی و specs/image_urls خالی مجازند؛ fallback لازم است.
- `GET /api/products/{product_id}/offers?limit=20&offset=0&max_price_toman=10000000&user_lat=35.7&user_lon=51.4&max_distance_km=5`: items با offer_id، product_id، shop_id، price_toman، price_quality، last_price_changed_at، seller_title، description، warranty، inventory_status، direct_distance_meters و shop شامل name/address/location_label/lat/lon. contact یا لینک تماس خروجی ندارد. category-only در فروشنده‌های محصول وارد نمی‌شود.

مختصات کاربر (user_lat بین ۹۰- و ۹۰، user_lon بین ۱۸۰- و ۱۸۰) باید هر دو با هم ارائه شوند. تعیین max_distance_km نیازمند ارائهٔ هر دو مختصات است و مقادیر نامتناهی یا کمتر/مساوی صفر با 422 رد می‌شوند. فاصله با فرمول کروی Haversine (شعاع ۶۳۷۱ کیلومتر) پیش از گردکردن محاسبه و شرط شعاع قبل از LIMIT و OFFSET اعمال می‌شود. has_more بر مبنای نتایج فیلترشده است. فروشگاه‌های فاقد مختصات در صورت فعال بودن شعاع حذف می‌شوند و در نبود شعاع با direct_distance_meters=null باقی می‌مانند (نبود مختصات به معنی فاصلهٔ صفر نیست). direct_distance_meters عدد صحیح به متر است و صرفاً فاصلهٔ مستقیم هوایی است، نه مسافت یا زمان مسیر رانندگی/پیاده‌روی.

شناسهٔ محصول opaque و طول آن ۱–۲۰۰ کاراکتر بدون control character است. limit بین ۱ و ۵۰ و offset بین صفر و یک میلیون است. has_more برای صفحهٔ بعد؛ شمارش کل جست‌وجو انجام نمی‌شود. budget رشتهٔ ASCII با ۱–۱۹ رقم و حداکثر 9223372036854775807 است. اعشار/منفی/بزرگ‌تر 422؛ مقایسه با integer دقیق SQLite انجام می‌شود.

بودجهٔ جست‌وجو فقط محصول با حداقل یک آفر قیمت‌دار زیر سقف را نگه می‌دارد؛ قیمت نامعلوم واجد شرط نیست. **offer_summary همیشه کل آفرهای منبع محصول است**: offer_count، min_price_toman، max_price_toman و missing_price_count. UI عنوان «بازهٔ کل قیمت‌های ثبت‌شده» بدهد؛ برای آفرهای واجد سقف endpoint آفر را با همان budget فراخوانی کند.

آفرها قیمت عددی صعودی، null در انتها، سپس offer_id مرتب می‌شوند؛ این ترتیب ادعای بهترین فروشنده نیست. چند آفر یک shop/product با عنوان/ضمانت متفاوت محفوظ می‌مانند.

## ساعات مراجعه — گام نخست P2

در `GET /api/products/{product_id}/offers` پارامتر اختیاری `open_now_only=true` فقط آفرهای فروشگاه با وضعیت declared_open را نگه می‌دارد. پیش‌فرض false و همهٔ وضعیت‌ها قابل‌نمایش‌اند. فیلتر ساعت همراه بودجه/شعاع پیش از LIMIT/OFFSET اعمال می‌شود؛ ترتیب قیمت و حفظ همهٔ offer_idها تغییر نکرده است. زمان از سرور گرفته می‌شود و پارامتر عمومی تغییر زمان وجود ندارد. یک لحظهٔ ثابت برای همهٔ ردیف‌ها، predicate SQL و timestamp پاسخ هر درخواست استفاده می‌شود.

فیلد جدید صفحه `hours_evaluated_at` یک timestamp دارای offset به وقت Asia/Tehran است؛ حتی صفحهٔ خالی آن را دارد. زمان محاسبهٔ وضعیت است، نه زمان تأیید فروشنده یا به‌روزشدن برنامهٔ منبع. هر آفر `opening_hours` دارد:

پاسخ آفر Cache-Control: no-store دارد و fetch فرانت‌اند نیز no-store است؛ refresh نباید صفحهٔ زمان‌دار قبلی را از cache استفاده کند. زمان بررسی در UI تا ثانیه نمایش داده می‌شود.

- status: یکی از declared_open / declared_closed / unknown؛ همگی برداشت از برنامهٔ منبع‌اند.
- reason: within_declared_shift، outside_declared_shifts، declared_closed_day، missing_schedule، unsupported_schedule، invalid_schedule، no_valid_shifts یا previous_day_unknown.
- local_day: کلید mon…sun روز محاسبه‌شده در تهران.
- today_shifts و previous_day_overnight_shifts: بازه‌های معتبر با start_time/end_time در قالب HH:MM:SS و ends_next_day. لیست دوم شیفت‌هایی است که روز قبل شروع و روز جاری پایان می‌یابند؛ امروز ممکن است شیفت جدیدی نداشته باشد اما ادامهٔ شیفت دیروز هنوز فعال باشد.

شروع بازه شامل و پایان آن خارج است؛ بازهٔ شبانه روی دو تاریخ محلی محاسبه می‌شود. unknown برای برنامهٔ خالی/unsupported/ناسازگار/فاقد بازهٔ معتبر است. بازهٔ 00:00 تا 00:00 صفرمدت است و ۲۴ساعته تعبیر نمی‌شود؛ اگر کنار بازهٔ معتبر باشد حذف می‌شود، اما اگر تنها بازهٔ declared باشد وضعیت نامشخص است. closed همراه بازهٔ غیرصفر ناسازگار و unknown است. شیفت‌های روز با دادهٔ نامعتبر قابل اتکا نیستند. اگر شیفت معتبر فعلی یا ادامهٔ روز قبل بازبودن را نشان بدهد، declared_open است؛ در نبود بازهٔ فعال، برنامهٔ نامشخص روز قبل اجازهٔ نتیجه‌گیری قطعی بسته‌بودن نمی‌دهد (previous_day_unknown). این قواعد محافظه‌کارانهٔ محصول‌اند، نه تضمین یا تفسیر تأییدشدهٔ برگزارکننده.

unknown با closed فرق دارد؛ هر دو فقط با فعال‌کردن فیلتر ساعت از نتایج باز کنار می‌روند. UI علت و زمان بررسی را نشان می‌دهد و با «به‌روزرسانی وضعیت ساعت» درخواست جدید می‌فرستد؛ زمان به‌طور خودکار تازه نمی‌شود. تعطیلات، تغییر برنامه و بازبودن واقعی از این داده قابل اثبات نیستند. یک ساعت نامعتبر در منبع به unknown با reason صریح تبدیل می‌شود، نه نتیجهٔ خالی یا خطای کل سرویس. خطای DB/قرارداد سایر داده‌ها همچنان 503 است.

## دقت و منشأ

همهٔ قیمت‌های JSON رشتهٔ دهدهی‌اند؛ null همان null است. UI قیمت را برای محاسبه به Number تبدیل نکند و از BigInt/رشته استفاده کند. price_quality برابر missing، above_js_safe_integer (بیش از ۲^۵۳−۱) یا not_assessed است؛ این مدل تشخیص قیمت بازار نیست. تاریخ خام منبع حفظ شده؛ عنوان نمایشی «آخرین تغییر قیمت ثبت‌شده» با timezone تهران باشد، نه تأیید موجودی.

هر پاسخ موفق provenance دارد: snapshot_id (SHA-256 متن metadata.profile)، dataset، generated_at_utc، currency=toman و inventory_status=unconfirmed. خود آفر نیز unconfirmed است. generated_at زمان ساخت snapshot است، نه تأیید فروشنده. متن/URL منبع نامطمئن‌اند؛ HTML فروشنده اجرا نشود. ساعات و قیود اعتباری منبع ارزیابی می‌شوند؛ هیچ‌کدام تأیید زنده نیستند.

## شرایط خرید اعتباری حضوری — گام دوم P2

در مسیر offers، in_person_credit_only=true اختیاری است (پیش‌فرض false). فقط matches_declared_terms را پیش از LIMIT/OFFSET، همراه ساعت/بودجه/شعاع نگه می‌دارد. بدون این فیلتر همهٔ وضعیت‌ها باقی‌اند. ترتیب و offer_idهای چندگانه حفظ و has_more از نتیجهٔ فیلترشده است. پارامتر نامعتبر 422 است.

هر آفر in_person_credit با status، reason و options دارد. status یکی از matches_declared_terms / does_not_match / unknown است. reason کل یکی از matching_option، all_recorded_options_mismatch، incomplete_conditions، not_recorded یا invalid_data است. options تمام روش‌ها را با option_index صفرمبنا، provider_name، channel، min_price_toman/max_price_toman (رشتهٔ دهدهی یا null)، category_names (لیست رشته یا null برای اطلاعات خراب)، status و reason همان روش نگه می‌دارد. روش‌های هم‌نام ادغام نمی‌شوند.

reason روش: matched، channel_unknown، unsupported_channel، price_unknown، product_category_unknown، category_mismatch، below_minimum، above_maximum یا invalid_conditions. همهٔ کلیدها و قیود پیش از ارزیابی اعتبارسنجی می‌شوند؛ مبلغ منفی/اعشار/boolean/رشته در JSON منبع، بازهٔ وارونه، نام خالی و دستهٔ نامعتبر unknown می‌سازند. نمونهٔ خراب به نتیجهٔ معتبر خالی تبدیل نمی‌شود؛ وضعیت unknown با علت دارد.

تطابق فقط با channel=in_person، قیمت معلوم، قیود صحیح و دستهٔ مجاز همان محصول است. مرز مبلغ شامل است و مقایسه با integer دقیق انجام می‌شود. null در فیلد موجود یعنی قید مبلغ ثبت نشده، نه صفر یا اعتبار نامحدود واقعی؛ [] یعنی محدودیت دسته در منبع ثبت نشده، نه پذیرش قطعی هر کالا. key غایب unknown است. دستهٔ غیرخالی باید پس از نرمال‌سازی دقیقاً با category_name محصول برابر باشد؛ دستهٔ فعالیت فروشگاه/والد حدسی استفاده نمی‌شود. unknown channel حضوری فرض نمی‌شود.

وجود یک روش منطبق کافی است؛ بدون آن، وجود unknown وضعیت کل را unknown می‌کند؛ فقط عدم تطابق تمام روش‌ها does_not_match است. فهرست منبع خالی/غایب not_recorded است و نبود خدمت را اثبات نمی‌کند. UI فقط قیود ثبت‌شده را نمایش می‌دهد؛ تأیید اعتبار شخص، موجودی، پرداخت یا پذیرش فروشنده و هیچ اتصال واقعی provider در این قرارداد نیست.

## دستیار محدود — گام سوم P2

`GET /api/assistant/status`: ready، reason (ready/disabled/missing_key/invalid_config/attempt_limit)، model، remaining_calls و attempt_limit. این سهمیهٔ تعداد تلاش محلی است، نه موجودی دلاری پنل. کلید و مسیر فایل خروجی ندارد.

`POST /api/assistant/turn`: request_id با UUID کوچک‌نویس، messages با role=user/assistant متناوب (۱–۵ پیام، پایان user، هر محتوا ۱–۱۰۰۰ و مجموع حداکثر ۳۰۰۰ نویسه)، max_price_toman اختیاری رشتهٔ صحیح تا 9223372036854775807. نقش system/tool و کلیدهای اضافی 422 هستند. تاریخچه دادهٔ نامطمئن است و server history ندارد؛ پیام‌ها/بودجه به provider فرستاده می‌شوند، دادهٔ تماس و مختصات کاتالوگ خیر.

طرح مدل فقط action/query/budget_text/question دارد. query از enum حداکثر ۶ عبارت لفظی متن انسان است و host هم عضویت را می‌سنجد؛ ابزار آزاد و فیلد محصول/قیمت/شناسه مجاز نیست. budget_text نقل‌قول انسانی است؛ عبارت صریح یکتای سقف هم مستقیم parse می‌شود. مبلغ با Decimal/integer و تومان، نه حساب مدل، تعیین می‌شود؛ ریال/ابهام نیازمند سؤال است. سؤال‌های فارسی host از product_kind/budget/priority/specific_model ساخته می‌شوند.

پاسخ: request_id، status=needs_input/results/no_evidence، query، max_price_toman، question، products و model. needs_input سؤال و products=null دارد؛ results/no_evidence یک ProductPage واقعی با provenance و question=null دارند. query/بودجهٔ نهایی برای صفحه‌بندی بعدی همان endpoint قطعی products استفاده می‌شوند؛ هیچ فراخوان مدل برای صفحهٔ بعد لازم نیست. هر دو endpoint no-store هستند.

خطاها: 422 ورودی بد؛ 409 duplicate_request؛ 429 attempt_limit/busy؛ 503 disabled/missing_key/invalid_config/usage_unavailable/provider_auth/provider_rate_limit/provider_failed؛ 502 invalid_output/incomplete_output/provider_model_mismatch؛ 504 provider_timeout. خطای DB همان catalogue_unavailable است؛ هرگز no_evidence نیست. قطع client کار را لغو می‌کند؛ attempt رزروشده مصرف‌شده/احتمال هزینه باقی می‌ماند. client retry صریح درخواست جدید است؛ retry خودکار وجود ندارد.

مدل پیش‌فرض gpt-5-mini با low reasoning و حداکثر ۱۲۰۰ completion token، یک call و ۳۰ ثانیه برای مدل، پاسخ شبکه ۶۴KiB؛ query/data هم حدهای قبلی repository را دارند. ledger رزرو تراکنشی، UUID و یک تلاش فعال دارد؛ cap کلی با restart/reset گفتگو تغییر نمی‌کند. اگر مصرف/مدل در پاسخ گزارش نشود، نامعلوم باقی است و صفر/تأییدشده فرض نمی‌شود. مدل متفاوت پذیرفته نمی‌شود. هیچ نرخ رسمی یا سقف دلاری دقیق از cap تعداد قابل نتیجه‌گیری نیست.

## خطا و بازیابی

- 200 با items خالی: مدرکی مطابق query/filter در این صفحه نیست.
- 404: محصول در snapshot نیست؛ محصول موجود بدون آفر 200 و لیست خالی است.
- 422: ورودی نامعتبر؛ UI فیلترها را برای اصلاح حفظ کند.
- 503 با code=catalogue_unavailable: DB ناموجود/خراب/ناسازگار، سقف اجرای SQLite یا nested data نامعتبر. نتیجهٔ خالی نیست؛ مسیر و snapshot بررسی و سپس retry شود. متن حساس منبع در خطا افشا نمی‌شود.

detail خطای 422 استاندارد FastAPI ممکن است رشته یا لیست باشد؛ UI فرض رشته نکند. پاسخ دیررس با AbortController کنترل می‌شود. مسیر محلی جست‌وجو/مقایسه/آفر/بودجه/محدوده و ساعات در Chromium بررسی شده؛ شواهد جاری در HANDOFF است و deployed journey نیست.
