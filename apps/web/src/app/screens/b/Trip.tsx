import { useWorkspace } from '../../base/state/Workspace.tsx';
import type { Offer } from '../../base/domain/contracts.ts';
import { formatDistance, HOURS_REASON_TEXT } from '../../../api.ts';
import { Badge, Button, CreditBadge, Empty, FreshTag, OpenBadge, Price, SimBadge } from '../../base/ui/primitives.tsx';
import { ClockIcon, CreditCardIcon, MapPinIcon } from '../../../presentation/icons-motion/icons.tsx';
import { alternativeOrigin, mapLink, shopFacts, shopName, tripAlternatives } from './model.ts';
import { revealMapOnMobile } from './revealMap.ts';
import { ReviewNotice } from './ReviewNotice.tsx';

export function TripScreen() {
  const { state, dispatch } = useWorkspace();
  const plan = state.visitPlan;
  if (!plan) {
    const candidate = state.selectedOffer;
    if (!candidate) return <Empty title="مقصدی انتخاب نشده">
      <p>یک آفر مشخص را از فروشندگان انتخاب کنید؛ مراجعه با یک فروشگاه هم ممکن است و مقایسه اجباری نیست.</p>
      <Button onClick={() => dispatch({ type: 'navigate', screen: 'stores' })}>رفتن به آفری فروشندگان</Button>
    </Empty>;
    return <div className="uv-trip">
      <header><h2>برنامهٔ مراجعه</h2><p className="ub-meta">هنوز مقصدی ثبت نشده است. تأیید صریح شما برای ساختن برنامه لازم است.</p></header>
      <Candidate offer={candidate} />
      <ReviewNotice />
      <p className="uv-note">با یک فروشگاه هم مسیر مراجعه ممکن است؛ جایگزین اختیاری است.</p>
    </div>;
  }
  const alternatives = tripAlternatives(state.followups, plan.primary)
    .filter(item => item.offer.shop_id !== plan.primary.shop_id && item.offer.shop_id !== plan.alternative?.shop_id);
  const alternativeSource = plan.alternative ? alternativeOrigin(state.followups, plan.alternative) : undefined;
  const primarySource = alternativeOrigin(state.followups, plan.primary);
  return <div className="uv-trip">
    <header>
      <h2>برنامهٔ مراجعه</h2>
      {primarySource === 'simulated' ? <SimBadge />
        : primarySource === 'user_report' ? <Badge tone="warning">گزارش شما — تأیید بیرونی نشده</Badge> : null}
      <p className="ub-meta">فاصله‌ها هوایی‌اند. مسیر خیابانی، زمان رانندگی یا زمان پیاده‌روی بدون سرویس معتبر نمایش داده نمی‌شود.</p>
      {primarySource && <p className="uv-note">این مقصد از نتیجهٔ {primarySource === 'simulated' ? 'شبیه‌سازی' : 'گزارش خودتان'} در سرویس جایگزین‌ها انتخاب شده است؛ تأیید بیرونی نیست.</p>}
      {state.selectedOffer && state.selectedOffer.offer_id !== plan.primary.offer_id && <div className="uv-review" role="status">
        <p>انتخاب فعلی با مقصد ثبت‌شده متفاوت است. این برنامه خودکار عوض نمی‌شود.</p>
        <Button tone="secondary" onClick={() => dispatch({ type: 'plan', primary: state.selectedOffer! })}>ثبت انتخاب فعلی به‌عنوان مقصد</Button>
      </div>}
    </header>
    <TripCard role="مقصد اصلی" offer={plan.primary} source={primarySource} />
    {plan.alternative
      ? <TripCard role="جایگزین" offer={plan.alternative} source={alternativeSource}
        onRemove={() => dispatch({ type: 'plan', primary: plan.primary, alternative: null })} />
      : alternatives.length > 0 && <section className="uv-panel-section" aria-labelledby="uv-alt-add">
        <h3 id="uv-alt-add">افزودن جایگزین از نتیجهٔ پیگیری</h3>
        <p className="ub-meta">این جایگزین‌ها از سرویس جایگزین‌ها برای همان محصول آمده‌اند، نه از فهرست فعلی. فروشگاه گزارش‌شده کامل کنار گذاشته شده است.</p>
        {alternatives.map(item => <div key={item.offer.offer_id} className="uv-alt-add">
          <div><strong>{shopFacts(item.offer).title}</strong><Price value={item.offer.price_toman} />
            <p className="ub-meta">{shopFacts(item.offer).address || 'آدرس ثبت نشده'} · منبع: {item.source === 'simulated' ? 'شبیه‌سازی' : 'گزارش خودم'}</p></div>
          <Button tone="secondary" onClick={() => dispatch({ type: 'plan', primary: plan.primary, alternative: item.offer })}>
            افزودن به‌عنوان جایگزین
          </Button>
        </div>)}
      </section>}
    <p className="uv-note">ساعت نامعلوم به معنی بسته‌بودن نیست. شرایط اعتباری، اعلامی است و تأیید اعتبار خریدار نیست. قیمت، تاریخی است و موجودی تأیید نشده است.</p>
  </div>;
}

function Candidate({ offer }: { offer: Offer }) {
  const { state, dispatch } = useWorkspace();
  const facts = shopFacts(offer);
  return <article className="uv-candidate">
    <h3>{shopName(offer)}</h3>
    {facts.name && <span className="uv-card-location">{facts.title}</span>}
    <Price value={offer.price_toman} />
    <div className="uv-draft-badges"><OpenBadge offer={offer} /><CreditBadge offer={offer} /><Badge>موجودی تأییدنشده</Badge></div>
    <p className="ub-meta">{facts.address || 'آدرس ثبت نشده'}</p>
    {!state.selectionNeedsReview
      ? <Button onClick={() => dispatch({ type: 'plan', primary: offer })}>ثبت این آفر به‌عنوان مقصد</Button>
      : <p className="uv-note">ابتدا انتخاب را تأیید کنید؛ مقصد با انتخاب تأییدنشده ساخته نمی‌شود.</p>}
  </article>;
}

function TripCard({ role, offer, source, onRemove }: {
  role: string; offer: Offer; source?: 'simulated' | 'user_report'; onRemove?: () => void;
}) {
  const { dispatch } = useWorkspace();
  const facts = shopFacts(offer);
  const title = shopName(offer);
  const link = mapLink(offer);
  return <article className="uv-trip-card" aria-label={`${role}: ${title}`}>
    <div className="uv-trip-head">
      <div><Badge tone="brand">{role}</Badge><h3>{title}</h3>
        {facts.name && <span className="uv-card-location">{facts.title}</span>}</div>
      <Price value={offer.price_toman} />
    </div>
    <div className="uv-draft-badges">
      <OpenBadge offer={offer} /><CreditBadge offer={offer} /><Badge>موجودی تأییدنشده</Badge>
      {source && <Badge tone="warning">منبع انتخاب: {source === 'simulated' ? 'شبیه‌سازی' : 'گزارش خودم'}</Badge>}
    </div>
    {role === 'مقصد اصلی' && <div className="uv-metrics">
      <div className="uv-metric"><MapPinIcon size={18} /><strong>{formatDistance(offer.direct_distance_meters)}</strong><span>فاصلهٔ هوایی</span></div>
      <div className="uv-metric"><ClockIcon size={18} /><strong>{offer.opening_hours.status === 'unknown' ? 'نامشخص' : offer.opening_hours.status === 'declared_open' ? 'باز' : 'بسته'}</strong><span>ساعت اعلامی</span></div>
      <div className="uv-metric"><CreditCardIcon size={18} /><strong>{offer.in_person_credit.status === 'matches_declared_terms' ? 'منطبق' : offer.in_person_credit.status === 'unknown' ? 'نامشخص' : 'نامنطبق'}</strong><span>اعتبار اعلامی</span></div>
    </div>}
    {role === 'مقصد اصلی' && <Indoor facts={facts} />}
    <p className="ub-meta">{HOURS_REASON_TEXT[offer.opening_hours.reason]}{offer.opening_hours.status === 'unknown' ? '؛ ساعت نامعلوم به معنی بسته‌بودن نیست.' : ''}</p>
    <p className="ub-meta">آدرس ثبت‌شده: {facts.address || 'ثبت نشده'}</p>
    <p className="uv-small">نام فروشگاه، نام نمایشی دیتاست است و هویت حقوقی یا تأییدشده را نشان نمی‌دهد.</p>
    {role !== 'مقصد اصلی' && <dl className="uv-evidence">
      <Evidence label="پاساژ" part={facts.mall} />
      <Evidence label="طبقه" part={facts.floor} />
      <Evidence label="واحد" part={facts.unit} />
    </dl>}
    <FreshTag timestamp={offer.last_price_changed_at} />
    <p className="ub-meta">فاصلهٔ هوایی: <bdi>{formatDistance(offer.direct_distance_meters)}</bdi> · مسیر خیابانی محاسبه نشده است.</p>
    {offer.opening_hours.today_shifts.length > 0 && <p className="ub-meta">بازه‌های اعلام‌شدهٔ امروز: {offer.opening_hours.today_shifts.map(shift =>
      <bdi key={`${shift.start_time}-${shift.end_time}`} dir="ltr">{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}{shift.ends_next_day ? ' (+۱)' : ''} </bdi>)}</p>}
    <div className="uv-inline-actions">
      <Button tone="secondary" onClick={() => {
        revealMapOnMobile();
        dispatch({ type: 'selectOffer', value: offer });
        dispatch({ type: 'mapCamera', kind: 'selection' });
      }}>نمایش این مقصد روی نقشه</Button>
      {link
        ? <a className="uv-link-button" href={link} target="_blank" rel="noopener noreferrer">
          باز کردن در نقشهٔ OpenStreetMap <span className="ub-sr-only">(برگهٔ تازه؛ فقط با اقدام شما)</span>
        </a>
        : <span className="uv-note">مختصات ثبت نشده است؛ بازکردن نقشه ممکن نیست.</span>}
      {onRemove && <Button tone="ghost" onClick={onRemove}>حذف جایگزین</Button>}
    </div>
    <p className="uv-note">نقشه خط مستقیم هوایی را نشان می‌دهد؛ این مسیر خیابانی یا ETA نیست. بازکردن نقشه فقط با همین دکمه انجام می‌شود.</p>
  </article>;
}

function Evidence({ label, part }: { label: string; part: { value: string; matchedText: string } | null }) {
  return <div><dt>{label}</dt><dd>
    {part ? <>{part.value}<small className="uv-small">شاهد در متن آدرس: «{part.matchedText}»</small></>
      : <span className="uv-small">در متن آدرس مشخص نیست</span>}
  </dd></div>;
}

function Indoor({ facts }: { facts: ReturnType<typeof shopFacts> }) {
  return <section className="uv-indoor" aria-label="اطلاعات پاساژ از متن آدرس">
    <div className="uv-indoor-head">
      <strong>{facts.mall ? `داخل ${facts.mall.value}` : 'پاساژ در متن آدرس مشخص نیست'}</strong>
      <Badge>استخراج از متن آدرس</Badge>
    </div>
    <div className="uv-indoor-chips">
      {facts.floor && <span>طبقه {facts.floor.value}</span>}
      {facts.unit && <span>واحد {facts.unit.value}</span>}
      {!facts.floor && !facts.unit && <span>طبقه/واحد در آدرس مشخص نیست</span>}
    </div>
    {(facts.mall || facts.floor || facts.unit) && <p className="uv-small">شاهدهای متن آدرس: {[facts.mall, facts.floor, facts.unit]
      .filter((part): part is { value: string; matchedText: string } => part !== null)
      .map(part => `«${part.matchedText}»`).join(' · ')}</p>}
    <p className="uv-small">این اطلاعات فقط از متن آدرس ثبت‌شده استخراج شده‌اند؛ نقشهٔ داخلی، تعداد کل مغازه‌ها یا تأیید ساختمان را نشان نمی‌دهند.</p>
  </section>;
}
