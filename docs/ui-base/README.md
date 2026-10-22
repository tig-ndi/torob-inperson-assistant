# پایهٔ مشترک رابط نقشه‌محور

## محدوده و وضعیت

Base در همان `apps/web` و روی backend موجود ساخته می‌شود؛ برنامه یا دیتای جدا ندارد.
ورودی `/design.html` برای توسعهٔ A/B است و `/` رابط موجود را نگه می‌دارد. پس از ادغام و پذیرش A/B، اتصال به ورودی اصلی یک کار صریحِ یکپارچه‌سازی است؛ Base به‌تنهایی ریفکتور کامل یا پایان P2/P3 نیست.

API schema و کد بک‌اند تغییر نمی‌کنند. فایل ZIP فقط مرجع بصری است؛ داده‌ها، ساعت نمایشی، درصد اطمینان، تماس و SVG نقشهٔ آن منتقل نشده‌اند. صفحه‌های A/B فعلاً mount point دارند؛ کاتالوگ/آفرهای پیش‌نمایش از API واقعی می‌آیند. نقشهٔ فعلی عمداً یک سطح خنثی با اعلام ناتمام‌بودن است.

## همکاری و Git

طبق تصمیم انسان، Base روی `main` آماده می‌شود. بعد از کامیت و push دستی او، A و B از **همان SHA نهایی Base** شاخه می‌سازند:

```powershell
git switch -c codex/ui-a-discovery <BASE_SHA>
# روی checkout مستقلِ عضو B:
git switch -c codex/ui-b-map-visit <BASE_SHA>
```

هر عضو PR خودش را به main می‌دهد. پس از ادغام، مالک یکپارچه‌سازی مسیر کامل را بررسی می‌کند؛ شاخهٔ integration جدا لازم نیست. عوامل push یا عملیات نوشتنی GitHub انجام نمی‌دهند. دو عامل نباید هم‌زمان در یک checkout فایل بنویسند؛ هر عضو clone یا worktree مستقل لازم دارد.

### مالکیت ثابت

- مشترک/هماهنگ‌کننده: `src/app/base/`، `src/app/main.tsx`، ورودی‌ها، package/lockfile، Vite/tsconfig، `unit/ui-base/`، `tests/ui-base/` و اسناد وضعیت اصلی.
- A: `src/app/screens/a/`، `unit/ui-a/`، `tests/ui-a/`، `docs/ui-base/log-A.md` و `requests-A.md`.
- B: `src/app/screens/b/`، `src/app/map/`، `unit/ui-b/`، `tests/ui-b/`، `docs/ui-base/log-B.md` و `requests-B.md`.
- `registry.tsx` از ابتدا هر دو mount point را می‌شناسد؛ هیچ عضو برای وصل‌کردن صفحه‌هایش آن را ویرایش نمی‌کند.
- تغییر لازم در فایل مشترک، در requests عضو ثبت و توسط هماهنگ‌کننده اعمال می‌شود. هیچ‌کس هم‌زمان lockfile یا فایل‌های عمومی اسناد را بازنویسی نمی‌کند.

## قراردادهای آماده

- `base/domain/contracts.ts`: نوع‌های UI شامل state، شواهد، offer/شناسه‌ها و عملیات پیگیری.
- `parsers.ts`: مرز unknown به دادهٔ معتبر؛ `limitations` آرایه است، نه رشته؛ قیمت رشتهٔ دقیق باقی می‌ماند.
- `client.ts`: `searchCatalogue`، `loadProduct`، `loadOffers`، `assistantStatus`، `sendAssistant`، `prepareFollowup` و `findAlternatives`.
- `state/Workspace.tsx`: `useWorkspace()`؛ فیلتر و گفت‌وگو مستقل از ناوبری هستند.
- `state/conversation.ts`: `conversationInput(state, message)`؛ حداکثر پنج پیام و ۳۰۰۰ نویسه با حذف جفت‌های قدیمی، بدون بریدن متن تازه. state کامل جدا حمل می‌شود.
- `hooks.ts`: `useCatalogue`، `useAssistant`، `useOffers` و `useSellerFollowup`؛ هیچ درخواست مدل در mount/effect/تایپ رخ نمی‌دهد. submit صریح لازم است.
- `RequestGate`: abort و شناسهٔ نسل درخواست؛ پاسخ قبلی حتی اگر transport به abort اعتنا نکند معتبر نمی‌شود. reducer نیز revision را می‌سنجد.
- `ui/`: دکمه، نشان، قیمت، خطا، empty/loading، toast، پنجرهٔ native، فیلتر و موقعیت؛ نمایش‌های ساعت/اعتبار/زمان منبع.

### نیاز و بودجه

`need_state` فقط از پاسخ معتبر میزبان می‌آید. جایگزین‌کردن آن با query یا متن آزاد ممنوع است.
`useAssistant().submit(conversationInput(state, message))` پاسخ معتبر را با revision فعلی در Workspace ثبت می‌کند؛ عضو A نباید دوباره همان پاسخ را dispatch کند.
تغییر فرم بودجه تاریخچه را پاک نمی‌کند. در request، حذف فیلد بودجه یعنی حفظ مقدار؛ `null` صریح یعنی حذف سقف. helper فقط تفاوت واقعی فرم را override می‌کند. موضوع و `category_cleared` را از هم جدا نگه دارید؛ دستهٔ semantic در state الزاماً فیلتر فعال SQL نیست.

### offer، انتخاب و نقشه

`offer_id` هویت انتخاب/مقایسه/پیگیری است. `shop_id` فقط گروه نمایش است؛ همهٔ آفرها داخل گروه حفظ می‌شوند. `groupOffers` و `minimumRecordedPrice` محاسبهٔ قیمت را با BigInt انجام می‌دهند. حداقل گروه، فقط در مجموعهٔ بارگذاری‌شده معنا دارد، نه تمام فروشگاه.
`useOffers` تمام پارامترهای مؤثر را در کلید حافظه‌ای درخواست لحاظ می‌کند؛ فیلترها قبل از صفحه‌بندی در backend اعمال می‌شوند. این کلید شامل موقعیت است؛ log یا persist نشود.
`loadedOffers`، فهرست و `pinsForWorkspace` از یک مجموعه‌اند. تعویض فیلتر، پین‌های نتیجهٔ قبلی را واجدشرایط معرفی نمی‌کند. انتخاب قبلی حفظ و `selectionNeedsReview` روشن می‌شود؛ تأیید مجدد یا خروج از فیلتر را صریح نشان دهید.
تغییر محصول، انتخاب آفر، برنامه و پیگیری کالای قبلی را از صفحهٔ جدید جدا می‌کند. مقایسه، خودکار برنامهٔ مراجعه نمی‌سازد. `back` مبدأ واقعی ثبت‌شده را دنبال می‌کند؛ حفظ scroll هر صفحه با عضو آن است.

### پیگیری

`useSellerFollowup` فقط prepare و گزارش simulated/user_report را می‌فرستد. پاسخ کامل‌شده در `state.followups[offer_id]` حفظ می‌شود؛ با برگشت به صفحه آن را بخوانید. loading/error/cancel، وضعیت درخواست HTTP هستند، نه تماس با فروشنده.
هیچ شماره، `tel:`، پیام‌رسان، ارسال واقعی یا «فروشنده تأیید کرد» وجود ندارد. حالت‌های outcome موجود `no_answer/closed/out_of_stock` هستند. `draft_not_sent` و false بودن تأیید بیرونی ثابت می‌مانند. در alternatives فیلترها بدون شل‌کردن ارسال و فروشگاه گزارش‌شده کامل کنار گذاشته می‌شود.

## نقشه و وابستگی‌ها

نسخه‌های pin‌شده از npm registry در زمان Base بررسی شدند: Leaflet 1.9.4، markercluster 1.5.3، انواع 1.9.22/1.5.6. B CSS این پکیج‌ها را محلی import می‌کند؛ CDN لازم نیست. React/Vite/TypeScript فعلی عوض نشده‌اند. Tailwind، Lucide، Next.js یا framework ایجنت تازه اضافه نشده‌اند؛ CSS و آیکون‌های موجود کافی‌اند.

پیشنهاد provider برای B: کاشی raster OSM با URL قابل‌تنظیم و attribution واضح؛ سرویس تضمین دسترس‌پذیری ندارد و prefetch/offline bulk ممنوع است. فهرست همیشه جایگزین نقشه است. دادهٔ خام دیتاست به provider نقشه فرستاده نمی‌شود؛ کاشی‌ها ناحیهٔ دیده‌شده را به سرویس بیرونی آشکار می‌کنند، پس ادعای «هیچ اطلاعات مکانی از مرورگر خارج نمی‌شود» نکنید. موقعیت به LLM ارسال نمی‌شود.

منابع: [Leaflet](https://leafletjs.com/examples/quick-start/)، [markercluster](https://github.com/Leaflet/Leaflet.markercluster)، [OSM tiles](https://operations.osmfoundation.org/policies/tiles/)، [modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## فونت و دارایی‌ها

WOFF2 فعلی با فونت ارائه‌شدهٔ کاربر یکسان است؛ از همان فایل محلی استفاده می‌شود. فقط وزن regular ارائه شده؛ خانواده/وزن‌های دیگر جعل نشده‌اند. مجوز توزیع فونت مستقلاً تأیید نشده؛ وجود فایل را معادل تأیید لایسنس معرفی نکنید. تصاویر محصول فقط از منبع معتبرِ همان محصول یا placeholder؛ عکس‌های نمونهٔ فیگما منتقل نشوند.

## اجرا و آزمون

در ترمینال API از ریشه:

```powershell
$env:TOROB_ASSISTANT_ENABLED='0'
.\.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

در `apps/web`:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run dev
# http://127.0.0.1:5173/design.html
npm run build
npm run test:ui-base
node --test unit/*.test.mjs
npm run test:e2e -- tests/ui-base/base.spec.mjs
```

Playwright سرورهای خودش را با مدل غیرفعال روی 18000/15173 اجرا می‌کند؛ نتیجهٔ آن real-model یا دستگاه واقعی نیست. lint script در پروژه وجود ندارد؛ اجرای lint ادعا نشود. تصاویر QA در `.local/qa/ui-base/` خارج Git هستند. تست‌های معمولی نباید provider credit مصرف کنند.

## موارد باز

- `TASK_A.md` و `TASK_B.md` محدودهٔ کار بعدی‌اند؛ شروع آن‌ها با تأیید انسان است.
- backend known issue: شرط پشتیبانی‌نشده قبل از مشخص‌شدن کالا ممکن است در turn بعد از دست برود؛ frontend Base آن را اصلاح نکرده است. متن خواستهٔ کاربر را حفظ و اجرای شرط را بی‌دلیل تأیید نکنید.
- آخرین ارزیابی جمعی بک‌اند پیش از live متوقف شد؛ از Base مجوز ادامهٔ آن نتیجه نمی‌شود.
- بررسی کامل موبایل/کیبورد/دو تم، نقشهٔ واقعی، پیگیری قابل‌مشاهده و سفر کامل کاربر بعد از A/B لازم است؛ Base آن‌ها را کامل اعلام نمی‌کند.
- ادغام نهایی، جایگزینی ورودی اصلی، پذیرش انسانی، دیپلوی و ویدئو هنوز انجام نشده‌اند.
