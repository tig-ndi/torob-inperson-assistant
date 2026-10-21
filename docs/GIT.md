# Git دستی — اجرا با کاربر

ریپو: https://github.com/tig-ndi/torob-inperson-assistant

در زمان ساخت base، پوشهٔ محلی فاقد `.git` و ریپوی GitHub طبق تصویر خالی بود. هیچ دستور Git توسط این چت اجرا نشده است. اگر از آن زمان خودت init/clone/commit کرده‌ای، بلوک راه‌اندازی را دوباره اجرا نکن؛ وضعیت موجود را بررسی کن.

برای اولین انتشار base، در PowerShell:

```powershell
Set-Location 'D:\starcoach\torob'
git init -b main
git remote add origin https://github.com/tig-ndi/torob-inperson-assistant.git
git add .
git diff --cached --stat
```

فهرست staged را نگاه کن: `.local`، CSV، ZIP، DB، node_modules و `.env` واقعی نباید در آن باشند. `.agents/skills` فایل‌های متنی بررسی‌شدهٔ پروژه است و باید همراه قواعد و کد version شود.

سپس خودت اجرا کن:

```powershell
git commit -m "chore: establish Torob project base"
git push -u origin main
```

اگر نام/ایمیل Git هنوز تنظیم نشده، پیام Git را بررسی و اطلاعات خودت را وارد کن؛ هویت فرضی نساز. اگر remote موجود است یا push رد شد، خطا را اینجا بفرست؛ force-push نکن. احراز هویت از مسیر معمول GitHub انجام شود و token را در چت/کد قرار نده.

دفعات بعد، بعد از بررسی تغییرات: `git add` فایل‌های موردنظر، commit و push توسط کاربر. پذیرفته‌شدن دعوت هم‌تیمی‌ها و قواعد branch در GitHub به‌صورت دستی کنترل می‌شوند. هیچ ادعایی دربارهٔ فعال‌شدن CI تا اولین push و مشاهدهٔ نتیجه وجود ندارد.
