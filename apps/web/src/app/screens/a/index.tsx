import { Button, Empty } from '../../base/ui/primitives.tsx';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import './discovery.css';
import type { Screen } from '../../base/domain/contracts.ts';
import type { CataloguePage } from '../../base/domain/contracts.ts';
import { DecideScreen } from './decide.tsx';
import { ResultsScreen } from './results.tsx';
import { SparklesIcon } from '../../../presentation/icons-motion/icons.tsx';
import { resumeScreen } from '../../base/state/model.ts';

/** Stable mount point. A may replace this file and add files only in screens/a. */
export function DiscoveryScreen({ screen }: { screen: Screen; catalogue: CataloguePage | null }) {
  const { state, dispatch } = useWorkspace();
  const resume = resumeScreen(state);
  const active = !!(state.product || state.productResults || state.needState || state.lastTurn || state.history.length);
  const start = screen === 'home' && !active;
  if (screen === 'home' || screen === 'decide') return <section className={start ? 'ua-start' : 'ua-discovery'} aria-labelledby={screen === 'home' ? 'ua-start-title' : undefined}>
    {start && <div className="ua-start-intro">
      <div className="ua-start-mark" aria-hidden="true"><SparklesIcon size={42} /></div>
      <p className="ua-eyebrow">همراه تصمیم‌های خرید</p>
      <p className="ua-start-title">{active ? 'خریدت را از همین‌جا ادامه بده' : <>از «چی بخرم؟»<br />تا «از کجا بخرم؟»</>}</p>
      <p>اول گزینه‌ها را با هم بررسی می‌کنیم؛ بعد سراغ فروشگاه و برنامهٔ مراجعه می‌رویم.</p>
      <ol className="ua-start-journey">
        <li><strong>نیازت را روشن کن</strong><span>چه می‌خواهی و چه چیزی برایت مهم است؟</span></li>
        <li><strong>گزینه‌ها را مقایسه کن</strong><span>قیمت‌ها، مشخصات و شواهد ثبت‌شده را ببین.</span></li>
        <li><strong>برای مراجعه آماده شو</strong><span>فروشگاه، آدرس و جایگزین مناسب را بررسی کن.</span></li>
      </ol>
    </div>}
    <div className={start ? 'ua-start-options' : undefined}>
      {screen === 'home' && <div className="ua-start-welcome">
        <p className="ua-eyebrow">دستیار خرید حضوری</p>
        <h1 id="ua-start-title">{active ? 'خرید فعلی شما' : 'از کجا شروع کنیم؟'}</h1>
        <p>{active ? 'انتخاب‌ها و گفت‌وگوی همین نشست محفوظ‌اند؛ از همان مرحله ادامه بده.' : 'لازم نیست از قبل مدل را بدانی. از نیازت بگو، یا کالایی را که می‌شناسی جست‌وجو کن.'}</p>
      </div>}
      {screen === 'home' && active && resume && <div className="ua-start-resume">
        <strong>خرید فعلی‌ات محفوظ است</strong>
        <p>{state.product?.persian_title || state.needState?.topic_query || state.productResults?.search.query || 'گفت‌وگو و انتخاب‌های همین نشست را ادامه بده.'}</p>
        <Button onClick={() => dispatch({ type: 'navigate', screen: resume })}>ادامهٔ خرید</Button>
      </div>}
      <div hidden={screen === 'home' && active}><DecideScreen start={start} /></div>
      {screen === 'home' && <div className="ua-start-option">
        <p>مدل را می‌دانید؟ از جست‌وجوی مستقیم کالا استفاده کنید.</p>
        <Button tone="secondary" onClick={() => { const input = document.getElementById('workspace-query'); input?.focus(); input?.scrollIntoView({ block: 'center', behavior: 'instant' }); }}>جست‌وجوی کالا</Button>
      </div>}
      {screen === 'home' && <p className="ub-meta">پوشش فعلی داده‌ها: تهران. قیمت‌ها ثبت‌شده‌اند و موجودی زنده تأیید نشده است. برای شروع، موقعیت لازم نیست.</p>}
    </div>
  </section>;
  if (screen === 'results') return <ResultsScreen />;
  return <Empty title="برای خرید حضوری، از نیازتان شروع کنید">
    <p>ورودی بالای صفحه به کاتالوگ واقعی وصل است. صفحه‌های نتایج و مقایسهٔ محصول در تسک A تکمیل می‌شوند.</p>
  </Empty>;
}
