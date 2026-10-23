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
  if (screen === 'home') return <section className="ua-start" aria-labelledby="ua-start-title">
    <div className="ua-start-intro">
      <div className="ua-start-mark" aria-hidden="true"><SparklesIcon size={42} /></div>
      <p className="ua-eyebrow">همراه تصمیم‌های خرید</p>
      <p className="ua-start-title">{resume ? 'خریدت را از همین‌جا ادامه بده' : <>از «چی بخرم؟»<br />تا «از کجا بخرم؟»</>}</p>
      <p>اول گزینه‌ها را با هم بررسی می‌کنیم؛ بعد سراغ فروشگاه و برنامهٔ مراجعه می‌رویم.</p>
      <ol className="ua-start-journey">
        <li><strong>نیازت را روشن کن</strong><span>چه می‌خواهی و چه چیزی برایت مهم است؟</span></li>
        <li><strong>گزینه‌ها را مقایسه کن</strong><span>قیمت‌ها، مشخصات و شواهد ثبت‌شده را ببین.</span></li>
        <li><strong>برای مراجعه آماده شو</strong><span>فروشگاه، آدرس و جایگزین مناسب را بررسی کن.</span></li>
      </ol>
    </div>
    <div className="ua-start-options">
      <div className="ua-start-welcome">
        <p className="ua-eyebrow">دستیار خرید حضوری</p>
        <h1 id="ua-start-title">از کجا شروع کنیم؟</h1>
        <p>لازم نیست از قبل مدل را بدانی. از نیازت بگو، یا کالایی را که می‌شناسی جست‌وجو کن.</p>
      </div>
      {resume && <div className="ua-start-resume">
        <strong>خرید فعلی‌ات محفوظ است</strong>
        <p>{state.product?.persian_title || state.needState?.topic_query || state.productResults?.search.query || 'گفت‌وگو و انتخاب‌های همین نشست را ادامه بده.'}</p>
        <Button onClick={() => dispatch({ type: 'navigate', screen: resume })}>ادامهٔ خرید</Button>
      </div>}
      <div className="ua-start-option">
        <h2>هنوز تصمیم نگرفته‌اید؟</h2>
        <p>کاربرد و بودجه‌ات را بگو؛ اگر لازم باشد، دستیار سؤال کوتاهی می‌پرسد.</p>
        <Button onClick={() => dispatch({ type: 'navigate', screen: 'decide' })}>کمک برای انتخاب</Button>
      </div>
      <div className="ua-start-option">
        <h2>کالای مشخصی در نظر دارید؟</h2>
        <p>نام یا مدل را در کادر جست‌وجوی بالای صفحه وارد کن.</p>
        <Button tone="secondary" onClick={() => { const input = document.getElementById('workspace-query'); input?.focus(); input?.scrollIntoView({ block: 'center', behavior: 'instant' }); }}>جست‌وجوی کالا</Button>
      </div>
      <p className="ub-meta">پوشش فعلی داده‌ها: تهران. قیمت‌ها ثبت‌شده‌اند و موجودی زنده تأیید نشده است. برای شروع، موقعیت لازم نیست.</p>
    </div>
  </section>;
  if (screen === 'decide') return <DecideScreen />;
  if (screen === 'results') return <ResultsScreen />;
  return <Empty title="برای خرید حضوری، از نیازتان شروع کنید">
    <p>ورودی بالای صفحه به کاتالوگ واقعی وصل است. صفحه‌های نتایج و مقایسهٔ محصول در تسک A تکمیل می‌شوند.</p>
  </Empty>;
}
