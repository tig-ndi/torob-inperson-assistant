import { Button, Empty } from '../../base/ui/primitives.tsx';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import './discovery.css';
import type { Screen } from '../../base/domain/contracts.ts';
import type { CataloguePage } from '../../base/domain/contracts.ts';
import { CataloguePreview } from '../../base/ui/ContractPreview.tsx';

/** Stable mount point. A may replace this file and add files only in screens/a. */
export function DiscoveryScreen({ screen, catalogue }: { screen: Screen; catalogue: CataloguePage | null }) {
  const { dispatch } = useWorkspace();
  if (screen === 'home') return <section className="ua-start" aria-labelledby="ua-start-title">
    <p className="ub-meta">انتخاب کالا برای خرید حضوری در تهران</p>
    <h2 id="ua-start-title">از کجا شروع کنیم؟</h2>
    <p>اگر نام کالا را می‌دانید، مستقیم جست‌وجو کنید. برای روشن‌تر کردن نیازتان، مسیر کمک برای انتخاب را باز کنید.</p>
    <div className="ua-start-options">
      <div className="ua-start-option">
        <h3>کالای مشخصی در نظر دارید؟</h3>
        <p>نام یا مدل را در کادر جست‌وجوی بالای صفحه وارد کنید.</p>
        <Button onClick={() => document.getElementById('workspace-query')?.focus()}>جست‌وجوی کالا</Button>
      </div>
      <div className="ua-start-option">
        <h3>هنوز تصمیم نگرفته‌اید؟</h3>
        <p>بخش گفت‌وگو در گام بعد تکمیل می‌شود؛ فعلاً می‌توانید از جست‌وجوی مستقیم استفاده کنید.</p>
        <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: 'decide' })}>کمک برای انتخاب</Button>
      </div>
    </div>
    <p className="ub-meta">نتایج از کاتالوگ ثبت‌شده می‌آیند؛ قیمت و موجودی زنده تأیید نشده‌اند. برای شروع، دسترسی به موقعیت لازم نیست.</p>
  </section>;
  if (screen === 'results' && catalogue) return <CataloguePreview page={catalogue} />;
  return <Empty title={screen === 'decide' ? 'نیازتان را دقیق‌تر بررسی کنیم' : screen === 'results' ? 'انتخاب محصول' : 'برای خرید حضوری، از نیازتان شروع کنید'}>
    <p>ورودی بالای صفحه به کاتالوگ واقعی وصل است. صفحه‌های کشف، گفت‌وگو و مقایسهٔ محصول در تسک A تکمیل می‌شوند.</p>
  </Empty>;
}
