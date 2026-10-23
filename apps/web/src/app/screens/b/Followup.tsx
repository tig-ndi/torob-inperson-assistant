import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { useSellerFollowup } from '../../base/state/hooks.ts';
import type { FollowupOutcome, Offer } from '../../base/domain/contracts.ts';
import { formatDistance, formatTehranDateTime } from '../../../api.ts';
import { Badge, Button, CreditBadge, Empty, ErrorCard, FreshTag, OpenBadge, Price, SimBadge, Skeleton } from '../../base/ui/primitives.tsx';
import { formatCount, OUTCOME_LABEL, SOURCE_LABEL, shopFacts, shopName } from './model.ts';
import { ReviewNotice } from './ReviewNotice.tsx';
import { alternativeSearchKey } from '../../base/state/alternativePages.ts';

const outcomes: FollowupOutcome[] = ['no_answer', 'closed', 'out_of_stock'];

export function FollowupScreen() {
  const { state, dispatch } = useWorkspace();
  const selected = state.selectedOffer;
  const saved = selected ? state.followups[selected.offer_id] : undefined;
  const followup = useSellerFollowup();
  const [outcome, setOutcome] = useState<FollowupOutcome>(saved?.alternatives?.outcome.kind ?? 'no_answer');
  const [source, setSource] = useState<'simulated' | 'user_report'>(saved?.alternatives?.outcome.source ?? 'simulated');
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
  const draftBusy = followup.draft.status === 'loading';
  const reportBusy = followup.alternatives.status === 'loading';

  return <div className="uv-contact">
    <header className="uv-contact-head">
      <div>
        <h2>پیگیری همین آفر</h2>
        <p className="ub-meta">{shopName(selected)}
          {selected.shop.name ? ` · ${selected.shop.location_label || selected.shop.address || 'موقعیت ثبت نشده'}` : ''}
          {selected.seller_title ? ` · ${selected.seller_title}` : ''}</p>
      </div>
      {source === 'simulated' ? <SimBadge /> : <Badge tone="warning">حالت گزارش شما — تأیید بیرونی نشده</Badge>}
    </header>
    <p className="uv-note">شماره‌های دیتاست مصنوعی‌اند؛ تماس واقعی انجام نمی‌شود. پیش‌نویس ارسال نمی‌شود و موجودی یا قیمت روز را تأیید نمی‌کند.</p>
    <details className="uv-source-details"><summary>منبع داده و محدودیت پیگیری</summary>
      <p className="uv-small">نام فروشگاه، نام نمایشی دیتاست است و هویت حقوقی یا تأییدشده را نشان نمی‌دهد.</p>
      <p className="ub-meta">این صفحه هیچ شماره، لینک تماس، واتساپ یا کانال پیام نمی‌سازد. وضعیت بارگذاری و خطا مربوط به درخواست برنامه است، نه تماس با فروشنده. شبیه‌سازی و گزارش شما هر دو تأیید بیرونی نشده‌اند.</p>
    </details>
    <ReviewNotice />

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
      {followup.alternatives.status === 'error' && !followup.pageMode && <ErrorCard message={followup.alternatives.error} failure={followup.alternatives.failure}
        onRetry={() => void followup.report(selection, outcome, source)} />}
      {alternatives && <div className="uv-alternatives" aria-live="polite">
        <div className="uv-alternatives-head">
          <h4>{alternatives.status === 'alternatives_available' ? 'جایگزین‌های همین محصول' : 'جایگزینی با این شرایط نیست'}</h4>
          <Badge tone={alternatives.status === 'alternatives_available' ? 'positive' : 'warning'}>
            {alternatives.status === 'alternatives_available' ? `${formatCount(alternatives.alternatives.items.length)} آفر جایگزین بارگذاری‌شده` : 'بدون جایگزین'}
          </Badge>
        </div>
        <div className="uv-draft-badges">
          <Badge>نتیجه: {OUTCOME_LABEL[alternatives.outcome.kind]}</Badge>
          <Badge>منبع: {SOURCE_LABEL[alternatives.outcome.source]}</Badge>
          <Badge>تأیید بیرونی: خیر</Badge>
          <Badge>زمان ثبت: <bdi>{formatTehranDateTime(alternatives.outcome.received_at)}</bdi></Badge>
        </div>
        <p className="ub-meta">{formatCount(alternatives.excluded_offer_count)} آفر ثبت‌شده از فروشگاه گزارش‌شده، کامل کنار گذاشته شد. این نتایج متعلق به شرایط زمان دریافت‌اند؛ موجودی جایگزین‌ها تأییدنشده است.</p>
        {stale && <p className="uv-warning" role="status">شرایط، موقعیت یا نتیجهٔ گزارش تغییر کرده است؛ موارد زیر نتایج قبلی‌اند. برای ادامه یا انتخاب، جایگزین‌ها را با شرایط فعلی از ابتدا دریافت کنید.</p>}
        <p className="ub-meta" ref={count} tabIndex={-1} role="status">{formatCount(alternatives.alternatives.items.length)} آفر جایگزین بارگذاری‌شده؛ این شمارش کل نتایج یا تعداد فروشگاه‌های یکتا نیست.</p>
        {alternatives.status === 'no_alternatives' && <p className="uv-warning" role="status">
          جایگزینی در همین بودجه، شعاع و شرایط ثبت نشده است. بودجه یا شعاع به‌طور خودکار افزایش داده نشد؛ برای تغییر آن‌ها از «شرایط جست‌وجو» در بالای صفحه استفاده کنید.
        </p>}
        {alternatives.alternatives.items.map(offer => <AlternativeCard key={offer.offer_id} offer={offer} disabled={stale || reportBusy}
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
      </div>}
    </section>

    <p className="uv-note">گزارش شبیه‌سازی یا گزارش شما تأیید بیرونی، موجودی زنده یا پاسخ فروشنده نیست. پس از رفتن به صفحهٔ دیگر و بازگشت، پیش‌نویس و نتیجهٔ همین آفر باقی می‌مانند.</p>
  </div>;
}

function AlternativeCard({ offer, onChoose, disabled }: { offer: Offer; onChoose: () => void; disabled: boolean }) {
  const facts = shopFacts(offer);
  return <article className="uv-alt-card">
    <div className="uv-trip-head">
      <div><h5 id={`uv-alternative-${encodeURIComponent(offer.offer_id)}`} tabIndex={-1}>{shopName(offer)}</h5><p className="ub-meta">{facts.name ? `${facts.title} · ` : ''}{facts.address || 'آدرس ثبت نشده'}</p></div>
      <Price value={offer.price_toman} />
    </div>
    <div className="uv-draft-badges"><OpenBadge offer={offer} /><CreditBadge offer={offer} />
      <Badge>{formatDistance(offer.direct_distance_meters)} · هوایی</Badge><Badge>موجودی تأییدنشده</Badge></div>
    <FreshTag timestamp={offer.last_price_changed_at} />
    <Button onClick={onChoose} disabled={disabled}>ثبت این جایگزین به‌عنوان مقصد</Button>
  </article>;
}
