# Git محلی با عامل؛ Push با کاربر

ریپو: https://github.com/tig-ndi/torob-inperson-assistant

اصلاح صریح کاربر در ۲۰۲۶-۱۰-۲۱ جایگزین ممنوعیت اولیه است: عملیات محلی Git و کامیت با عامل مجاز است؛ push و تغییرات remote فقط با کاربر. مخزن محلی روی main با origin موجود است؛ init یا remote add را تکرار نکنید. تغییرات کاربر را حفظ کنید و فقط فایل‌های بخش بررسی‌شده را stage کنید.

بررسی پیش از کامیت محلی:

```powershell
Set-Location 'D:\starcoach\torob'
git status --short
git diff --stat
git diff --cached --stat
```

فهرست staged را نگاه کن: `.local`، CSV، ZIP، DB، node_modules و `.env` واقعی نباید در آن باشند. `.agents/skills` فایل‌های متنی بررسی‌شدهٔ پروژه است و باید همراه قواعد و کد version شود.

هر کامیت یک بخش منسجم و بررسی‌شده باشد؛ نه ریز و پرتعداد، نه بزرگ و نامرتبط. قالب الزامی عنوان و بدنهٔ bulletدار با فاصله:

```text
feat(api): add read-only historical catalogue endpoints

- Describe important behavior and data safeguards.

- Record relevant checks and their actual results.
```

اگر نام/ایمیل Git هنوز تنظیم نشده، پیام Git را بررسی و اطلاعات خودت را وارد کن؛ هویت فرضی نساز. اگر remote موجود است یا push رد شد، خطا را اینجا بفرست؛ force-push نکن. احراز هویت از مسیر معمول GitHub انجام شود و token را در چت/کد قرار نده.

عامل پس از بررسی می‌تواند فایل‌های مشخص را stage و با پیام چندخطی از فایل موقت ignored و `git commit --file <path>` کامیت کند. سپس فقط کاربر این دستور را اجرا کند:

```powershell
Set-Location 'D:\starcoach\torob'
git log -2 --oneline
git push origin main
```

عامل push نمی‌کند. دعوت هم‌تیمی‌ها و قواعد branch با کاربر؛ نتیجهٔ GitHub CI پس از push جدا بررسی شود. فایل workflow و تست محلی شاهد اجرای remote CI نیستند.
