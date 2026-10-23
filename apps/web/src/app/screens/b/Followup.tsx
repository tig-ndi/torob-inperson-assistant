import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { useSellerFollowup } from '../../base/state/hooks.ts';
import type { FollowupOutcome, Offer } from '../../base/domain/contracts.ts';
import { formatDistance, formatTehranDateTime } from '../../../api.ts';
import { Badge, Button, CreditBadge, Empty, ErrorCard, FreshTag, OpenBadge, Price, SimBadge, Skeleton } from '../../base/ui/primitives.tsx';
import { formatCount, OUTCOME_LABEL, SOURCE_LABEL, shopFacts, shopName } from './model.ts';
import { ReviewNotice } from './ReviewNotice.tsx';
import { alternativeSearchKey } from '../../base/state/alternativePages.ts';
import { formatMoney } from '../../base/domain/presentation.ts';
import { canPlanOffer } from '../../base/state/model.ts';
import { SmartCallSimulator } from './SmartCallSimulator.tsx';

const outcomes: FollowupOutcome[] = ['no_answer', 'closed', 'out_of_stock'];

export function FollowupScreen() {
  const { state, dispatch } = useWorkspace();
  const selected = state.selectedOffer;
  const saved = selected ? state.followups[selected.offer_id] : undefined;
  const followup = useSellerFollowup();
  const [outcome, setOutcome] = useState<FollowupOutcome>(saved?.alternatives?.outcome.kind ?? 'no_answer');
  const [source, setSource] = useState<'simulated' | 'user_report'>(saved?.alternatives?.outcome.source ?? 'simulated');
  const [activeTab, setActiveTab] = useState<'smart_call' | 'manual_inquiry'>('smart_call');
  const [copiedNotice, setCopiedNotice] = useState(false);
  const count = useRef<HTMLParagraphElement>(null);
  const previous = useRef(saved?.alternatives);

  const currentSearch = selected ? { selection: { product_id: selected.product_id, offer_id: selected.offer_id, shop_id: selected.shop_id },
    outcome, source, filters: state.filters, position: state.position } : null;
  const stale = !!saved?.alternatives && (!saved.alternativesSearch || !currentSearch ||
    alternativeSearchKey(saved.alternativesSearch) !== alternativeSearchKey(currentSearch));

  useEffect(() => {
    const before = previous.current, next = saved?.alternatives;
    previous.current = next;
    if (stale || !before || !next || next.alternatives.offset <= before.alternatives.offset) return;
    const oldIds = new Set(before.alternatives.items.map(item => item.offer_id));
    const fresh = next.alternatives.items.find(item => !oldIds.has(item.offer_id));
    const target = fresh ? document.getElementById(`uv-alternative-${encodeURIComponent(fresh.offer_id)}`) : count.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [saved?.alternatives, stale]);

  if (!selected || !state.product) return <Empty title="آفری انتخاب نشده">
    <p>برای ساخت پیش‌نویس پیگیری، یک آفر مشخص از فروشندگان را انتخاب کنید.</p>
    <Button onClick={() => dispatch({ type: 'navigate', screen: 'stores' })}>رفتن به آفری فروشندگان</Button>
  </Empty>;

  const prepared = saved?.prepared ?? null;
  const alternatives = saved?.alternatives ?? null;
  const selection = { product_id: selected.product_id, offer_id: selected.offer_id, shop_id: selected.shop_id };
  const planVisit = (origin: 'simulated' | 'user_report') => {
    if (!canPlanOffer(state, selected)) { dispatch({ type: 'notice', value: 'ابتدا آفر را با شرایط فعلی بازبینی کنید.' }); return; }
    dispatch({ type: 'plan', primary: selected, source: origin });
    dispatch({ type: 'navigate', screen: 'trip' });
  };
  const draftBusy = followup.draft.status === 'loading';
  const reportBusy = followup.alternatives.status === 'loading';

  const formattedPrice = formatMoney(selected.price_toman);
  const defaultInquiryMessage = `سلام وقت بخیر، از خریداران ترب هستم. می‌خواستم بپرسم «${state.product.persian_title}» با قیمت حدود ${formattedPrice} در فروشگاه شما موجود هست؟ گارانتی و پلمپ بودن کالا چطور است؟ ممنون.`;

  const copyInquiryText = async () => {
    try {
      await navigator.clipboard.writeText(prepared?.draft.text || defaultInquiryMessage);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2500);
    } catch {
      // Fallback
    }
  };

  return <div className="uv-contact">
    <header className="uv-contact-head">
      <div>
        <h2>پیگیری و استعلام قبل از مراجعه</h2>
        <p className="ub-meta">{shopName(selected)}
          {selected.shop.name ? ` · ${selected.shop.location_label || selected.shop.address || 'موقعیت ثبت نشده'}` : ''}
          {selected.seller_title ? ` · ${selected.seller_title}` : ''}</p>
      </div>
      {source === 'simulated' ? <SimBadge /> : <Badge tone="warning">حالت گزارش شما — تأیید بیرونی نشده</Badge>}
    </header>

    <p className="uv-note">شماره‌های دیتاست مصنوعی‌اند؛ تماس واقعی انجام نمی‌شود. شبیه‌سازی تماس و استعلام هوشمند صرفاً برای سنجش فرآیند خودکار ایجنت است.</p>

    <details className="uv-source-details"><summary>منبع داده و محدودیت پیگیری</summary>
      <p className="uv-small">نام فروشگاه، نام نمایشی دیتاست است و هویت حقوقی یا تأییدشده را نشان نمی‌دهد.</p>
      <p className="ub-meta">این صفحه هیچ شماره، لینک تماس، واتساپ یا کانال پیام نمی‌سازد. وضعیت بارگذاری و خطا مربوط به درخواست برنامه است، نه تماس با فروشنده. شبیه‌سازی و گزارش شما هر دو تأیید بیرونی نشده‌اند.</p>
    </details>
    <ReviewNotice />
    {state.selectionNeedsReview && <p className="uv-note">این صفحه برای همین آفر انتخاب‌شده است؛ ساخت پیش‌نویس یا دیدن جایگزین‌ها تأیید شرایط فعلی برای این آفر نیست.</p>}

    {/* Follow-up Mode Tabs */}
    <div className="uv-followup-tabs" role="tablist" aria-label="روش پیگیری و استعلام">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'smart_call'}
        className={`uv-tab-btn ${activeTab === 'smart_call' ? 'is-active' : ''}`}
        onClick={() => setActiveTab('smart_call')}
      >
        📞 تماس شبیه‌سازی‌شده هوشمند با ایجنت
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'manual_inquiry'}
        className={`uv-tab-btn ${activeTab === 'manual_inquiry' ? 'is-active' : ''}`}
        onClick={() => setActiveTab('manual_inquiry')}
      >
        📝 استعلام خریدار و چک‌لیست حرکت
      </button>
    </div>

    {activeTab === 'smart_call' && (
      <section className="uv-panel-section" aria-label="تماس صوتی هوشمند">
        <SmartCallSimulator
          offer={selected}
          canPlanVisit={canPlanOffer(state, selected)}
          productTitle={state.product.persian_title}
          onOutcomeResolved={(newOutcome, newSource) => {
            setOutcome(newOutcome);
            setSource(newSource);
            void followup.report(selection, newOutcome, newSource);
          }}
          onConfirmedAvailable={() => {
            planVisit('simulated');
          }}
        />
      </section>
    )}

    {activeTab === 'manual_inquiry' && (
      <section className="uv-panel-section uv-manual-inquiry" aria-label="چک‌لیست استعلام خریدار">
        <div className="uv-checklist-card">
          <h4>چک‌لیست طلایی قبل از حرکت به سمت فروشگاه:</h4>
          <ul className="uv-checklist">
            <li><label><input type="checkbox"  /> استعلام رنگ، ظرفیت و مدل دقیق کالا</label></li>
            <li><label><input type="checkbox"  /> استعلام گارانتی معتبر و پلمپ بودن جعبه</label></li>
            <li><label><input type="checkbox"  /> هماهنگی ساعت حضور متصدی در فروشگاه</label></li>
            <li><label><input type="checkbox" /> بررسی امکان پرداخت با کارت‌خوان یا اعتبار حضوری</label></li>
          </ul>

          <div className="uv-inquiry-box">
            <span className="uv-inquiry-label">متن آماده جهت ارسال پیامک یا پیام‌رسان به فروشنده:</span>
            <p className="uv-inquiry-text">{prepared?.draft.text || defaultInquiryMessage}</p>
            <div className="uv-inquiry-actions">
              <Button tone="secondary" onClick={copyInquiryText}>
                {copiedNotice ? '✓ متن کپی شد!' : '📋 کپی کردن متن استعلام'}
              </Button>
              {!prepared && !draftBusy && (
                <Button tone="ghost" onClick={() => void followup.prepare(selection)}>
                  ساخت پیش‌نویس رسمی کاتالوگ
                </Button>
              )}
            </div>
          </div>

          <div className="uv-quick-outcome-grid">
            <span className="ub-meta">نتیجهٔ استعلام خود را مشخص کنید:</span>
            <div className="uv-outcome-buttons">
              <button
                type="button"
                className="uv-outcome-chip uv-outcome-chip--success"
                disabled={!canPlanOffer(state, selected)}
                onClick={() => {
                  planVisit('user_report');
                }}
              >
                طبق گزارش من موجود بود؛ ساخت برنامهٔ مراجعه
              </button>
              <button
                type="button"
                className="uv-outcome-chip uv-outcome-chip--danger"
                onClick={() => {
                  setOutcome('out_of_stock');
                  setSource('user_report');
                  void followup.report(selection, 'out_of_stock', 'user_report');
                }}
              >
                ❌ کالا موجود نبود (دیدن جایگزین‌ها)
              </button>
              <button
                type="button"
                className="uv-outcome-chip"
                onClick={() => {
                  setOutcome('no_answer');
                  setSource('user_report');
                  void followup.report(selection, 'no_answer', 'user_report');
                }}
              >
                📞 پاسخ نداد
              </button>
              <button
                type="button"
                className="uv-outcome-chip"
                onClick={() => {
                  setOutcome('closed');
                  setSource('user_report');
                  void followup.report(selection, 'closed', 'user_report');
                }}
              >
                🔒 فروشگاه بسته بود
              </button>
            </div>
          </div>
        </div>
      </section>
    )}

    {/* Expandable Advanced Draft & Radio Form for Full Backward Compatibility */}
    <details className="uv-advanced-details">
      <summary>تنظیمات سنتی و ساخت پیش‌نویس سیستمی</summary>
      <section className="uv-panel-section" aria-labelledby="uv-draft-title" aria-busy={draftBusy}>
        <h3 id="uv-draft-title">پیش‌نویس پیگیری</h3>
        <p className="ub-meta">پیش‌نویس پرسش موجودی/قیمت روز است و ارسال نمی‌شود. این عملیات هیچ تأیید موجودی یا پاسخ فروشنده‌ای تولید نمی‌کند.</p>
        {draftBusy && <><Skeleton /><Button tone="ghost" onClick={followup.cancel}>لغو درخواست پیش‌نویس</Button></>}
        {followup.draft.status === 'error' && <ErrorCard message={followup.draft.error} failure={followup.draft.failure} onRetry={() => void followup.prepare(selection)} />}
        {!prepared && !draftBusy && <Button onClick={() => void followup.prepare(selection)}>ساخت پیش‌نویس ارسال‌نشده</Button>}
        {prepared && <article className="uv-draft">
          <div className="uv-draft-badges"><Badge tone="warning">پیش‌نویس ارسال‌نشده</Badge><Badge>کانال تماس ندارد</Badge>
            <Badge>ارسال بیرونی انجام نشد</Badge></div>
          <p className="uv-draft-text">{prepared.draft.text}</p>
          {prepared.limitations.length > 0 && <details className="uv-source-details"><summary>محدودیت‌های این پیش‌نویس</summary>
            <ul className="uv-list">{prepared.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
          </details>}
          <p className="ub-meta">زمان ارزیابی ساعت‌ها: <bdi>{formatTehranDateTime(prepared.hours_evaluated_at)}</bdi></p>
        </article>}
      </section>

      <section className="uv-panel-section" aria-labelledby="uv-outcome-title" aria-busy={reportBusy}>
        <h3 id="uv-outcome-title">ثبت نتیجه و دیدن جایگزین‌ها</h3>
        <p className="ub-meta">نتیجه و منبع را انتخاب کنید؛ جایگزین‌ها فقط از سرویس جایگزین‌ها برای همان محصول و با حفظ بودجه/شعاع/ساعت/اعتبار می‌آیند.</p>
        <fieldset className="uv-fieldset"><legend>نتیجه</legend>
          {outcomes.map(item => <label key={item} className="uv-check">
            <input type="radio" name="uv-outcome" checked={outcome === item} onChange={() => setOutcome(item)} />
            {OUTCOME_LABEL[item]}
          </label>)}
        </fieldset>
        <fieldset className="uv-fieldset"><legend>منبع گزارش</legend>
          <label className="uv-check"><input type="radio" name="uv-source" checked={source === 'simulated'}
            onChange={() => setSource('simulated')} />{SOURCE_LABEL.simulated} — بدون تماس واقعی</label>
          <label className="uv-check"><input type="radio" name="uv-source" checked={source === 'user_report'}
            onChange={() => setSource('user_report')} />{SOURCE_LABEL.user_report} — تأیید بیرونی نیست</label>
        </fieldset>
        <div className="uv-inline-actions">
          <Button onClick={() => void followup.report(selection, outcome, source)} disabled={reportBusy}>
            {reportBusy && !followup.pageMode ? 'در حال دریافت جایگزین‌ها…' : 'دیدن جایگزین‌ها با این نتیجه'}
          </Button>
          {reportBusy && <Button tone="ghost" onClick={followup.cancel}>لغو درخواست جایگزین</Button>}
        </div>
      </section>
    </details>

    {/* Alternatives Section */}
    {followup.alternatives.status === 'error' && !followup.pageMode && (
      <ErrorCard message={followup.alternatives.error} failure={followup.alternatives.failure}
        onRetry={() => void followup.report(selection, outcome, source)} />
    )}

    {alternatives && <section className="uv-panel-section uv-alternatives-container" aria-busy={reportBusy}>
      <div className="uv-alternatives" aria-live="polite">
        <div className="uv-alternatives-head">
          <h4>{alternatives.status === 'alternatives_available' ? 'فروشگاه‌های جایگزین دارای همین کالا' : 'جایگزینی با این شرایط نیست'}</h4>
          <Badge tone={alternatives.status === 'alternatives_available' ? 'positive' : 'warning'}>
            {alternatives.status === 'alternatives_available' ? `${formatCount(alternatives.alternatives.items.length)} آفر جایگزین بارگذاری‌شده` : 'بدون جایگزین'}
          </Badge>
        </div>
        <div className="uv-draft-badges">
          <Badge>نتیجه قبلی: {OUTCOME_LABEL[alternatives.outcome.kind]}</Badge>
          <Badge>منبع: {SOURCE_LABEL[alternatives.outcome.source]}</Badge>
          <Badge>تأیید بیرونی: خیر</Badge>
          <Badge>زمان ثبت: <bdi>{formatTehranDateTime(alternatives.outcome.received_at)}</bdi></Badge>
        </div>
        <p className="ub-meta">{formatCount(alternatives.excluded_offer_count)} آفر ثبت‌شده از فروشگاه قبلی، به‌طور کامل کنار گذاشته شد تا آفر تکراری نبینید.</p>
        {stale && <p className="uv-warning" role="status">شرایط، موقعیت یا نتیجهٔ گزارش تغییر کرده است؛ موارد زیر نتایج قبلی‌اند. برای ادامه یا انتخاب، جایگزین‌ها را با شرایط فعلی از ابتدا دریافت کنید.</p>}
        <p className="ub-meta" ref={count} tabIndex={-1} role="status">{formatCount(alternatives.alternatives.items.length)} آفر جایگزین بارگذاری‌شده؛ این شمارش کل نتایج یا تعداد فروشگاه‌های یکتا نیست.</p>
        {alternatives.status === 'no_alternatives' && <p className="uv-warning" role="status">
          جایگزینی در همین بودجه، شعاع و شرایط ثبت نشده است. بودجه یا شعاع به‌طور خودکار افزایش داده نشد؛ برای تغییر آن‌ها از «شرایط جست‌وجو» در بالای صفحه استفاده کنید.
        </p>}
        {alternatives.alternatives.items.map(offer => <AlternativeCard key={offer.offer_id} offer={offer} baseOffer={selected} disabled={stale || reportBusy}
          onChoose={() => {
            dispatch({ type: 'selectOffer', value: offer });
            dispatch({ type: 'plan', primary: offer });
            dispatch({ type: 'navigate', screen: 'trip' });
          }} />)}
        {followup.alternatives.status === 'error' && followup.pageMode && <ErrorCard message={followup.alternatives.error} failure={followup.alternatives.failure}
          onRetry={!stale ? () => void followup.more(selection) : undefined} />}
        {followup.alternatives.status === 'error' && followup.pageMode && !followup.alternatives.failure.retryable &&
          <Button tone="secondary" disabled={reportBusy} onClick={() => void followup.report(selection, outcome, source)}>دریافت دوبارهٔ جایگزین‌ها از ابتدا</Button>}
        {alternatives.alternatives.has_more ? <Button tone="secondary" disabled={stale || reportBusy ||
          (followup.alternatives.status === 'error' && !followup.alternatives.failure.retryable)}
          onClick={() => void followup.more(selection)}>{reportBusy && followup.pageMode ? 'در حال دریافت جایگزین‌های بیشتر…' : 'جایگزین‌های بیشتر'}</Button>
          : alternatives.alternatives.items.length > 0 && <p className="ub-meta">پایان جایگزین‌های ثبت‌شده با این شرایط.</p>}
        {alternatives.alternatives.offset > 0 && <p className="ub-meta">ساعت‌های اعلامی هر صفحه هنگام دریافت همان صفحه ارزیابی شده‌اند؛ این اطلاعات تأیید زنده نیستند.</p>}
        <ul className="uv-list">{alternatives.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
      </div>
    </section>}

    <p className="uv-note">گزارش شبیه‌سازی یا گزارش شما تأیید بیرونی، موجودی زنده یا پاسخ فروشنده نیست. پس از رفتن به صفحهٔ دیگر و بازگشت، پیش‌نویس و نتیجهٔ همین آفر باقی می‌مانند.</p>
  </div>;
}

function AlternativeCard({
  offer,
  baseOffer,
  onChoose,
  disabled
}: {
  offer: Offer;
  baseOffer: Offer | null;
  onChoose: () => void;
  disabled: boolean;
}) {
  const facts = shopFacts(offer);

  let distanceDiffText = '';
  if (baseOffer && offer.direct_distance_meters !== null && baseOffer.direct_distance_meters !== null) {
    const diff = Math.round(offer.direct_distance_meters - baseOffer.direct_distance_meters);
    if (diff < -50) distanceDiffText = `${Math.abs(diff).toLocaleString('fa-IR')} متر نزدیک‌تر`;
    else if (diff > 50) distanceDiffText = `${diff.toLocaleString('fa-IR')} متر دورتر`;
  }

  let priceDiffText = '';
  if (baseOffer && offer.price_toman !== null && baseOffer.price_toman !== null) {
    try {
      const p1 = BigInt(offer.price_toman);
      const p0 = BigInt(baseOffer.price_toman);
      if (p1 < p0) {
        priceDiffText = `${(p0 - p1).toLocaleString('fa-IR')} تومان ارزان‌تر`;
      } else if (p1 > p0) {
        priceDiffText = `${(p1 - p0).toLocaleString('fa-IR')} تومان گران‌تر`;
      }
    } catch {
      // Safe fallback if price string contains non-numeric characters
    }
  }

  return <article className="uv-alt-card">
    <div className="uv-trip-head">
      <div>
        <h5 id={`uv-alternative-${encodeURIComponent(offer.offer_id)}`} tabIndex={-1}>{shopName(offer)}</h5>
        <p className="ub-meta">{facts.name ? `${facts.title} · ` : ''}{facts.address || 'آدرس ثبت نشده'}</p>
      </div>
      <Price value={offer.price_toman} />
    </div>
    <div className="uv-draft-badges">
      <OpenBadge offer={offer} />
      <CreditBadge offer={offer} />
      <Badge>{formatDistance(offer.direct_distance_meters)} · هوایی</Badge>
      {distanceDiffText && <Badge tone="positive">{distanceDiffText}</Badge>}
      {priceDiffText && <Badge tone="brand">{priceDiffText}</Badge>}
      <Badge>موجودی تأییدنشده</Badge>
    </div>
    <FreshTag timestamp={offer.last_price_changed_at} />
    <Button onClick={onChoose} disabled={disabled}>ثبت این جایگزین به‌عنوان مقصد</Button>
  </article>;
}
