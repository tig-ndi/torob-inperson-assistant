import type { Offer } from '../../base/domain/contracts.ts';
import { formatDistance, formatTehranDateTime, HOURS_REASON_TEXT } from '../../../api.ts';
import { MapPinIcon, ClockIcon, CreditCardIcon } from '../../../presentation/icons-motion/icons.tsx';
import { Badge, Button, CreditBadge, Price } from '../../base/ui/primitives.tsx';
import { shopFacts } from './model.ts';

export function StoreOfferCard({ offer, selected, compared, needsReview, onSelect, onCompare,
  onFollowup, onPlan, onMap }: {
  offer: Offer; selected: boolean; compared: boolean; needsReview: boolean;
  onSelect: () => void; onCompare: () => void;
  onFollowup: () => void; onPlan: () => void; onMap: () => void;
}) {
  const facts = shopFacts(offer);
  const displayName = facts.name || facts.title;
  return <article className={`uv-card ub-offer${selected ? ' is-selected' : ''}`} aria-label={displayName}>
    <div className="uv-card-head">
      <div className="uv-card-title">
        {offer.seller_title && <span className="uv-card-kicker" title={offer.seller_title}>{offer.seller_title}</span>}
        <h4>{displayName}</h4>
        {facts.name && <span className="uv-card-location">{facts.title}</span>}
        <p className="uv-card-address"><MapPinIcon size={14} /><span>{facts.address || 'آدرس ثبت نشده'}</span></p>
      </div>
      <div className="uv-card-price">
        <Price value={offer.price_toman} />
        <span>قیمت ثبت‌شده · موجودی تأییدنشده</span>
      </div>
    </div>
    <div className="uv-card-facts">
      <span title="فاصلهٔ مستقیم هوایی"><MapPinIcon size={14} />{formatDistance(offer.direct_distance_meters)} · هوایی</span>
      <span><ClockIcon size={14} />{offer.opening_hours.status === 'unknown' ? 'ساعت نامشخص' : offer.opening_hours.status === 'declared_open' ? 'طبق برنامه باز' : 'طبق برنامه بسته'}</span>
      <span><CreditCardIcon size={14} />{offer.in_person_credit.status === 'matches_declared_terms' ? 'اعتبار حضوری منطبق' : offer.in_person_credit.status === 'unknown' ? 'اعتبار نامشخص' : 'اعتبار نامنطبق'}</span>
    </div>
    <div className="uv-card-actions">
      <Button onClick={onSelect} aria-pressed={selected}>{selected ? 'انتخاب شده' : 'انتخاب این آفر'}</Button>
      <Button tone="secondary" aria-pressed={compared} onClick={onCompare}>{compared ? 'در مقایسه' : 'مقایسه'}</Button>
    </div>
    {selected && <div className="uv-next">
      {needsReview
        ? <p className="uv-note">شرایط عوض شده است؛ پیش از پیگیری یا ثبت مقصد، انتخاب را تأیید کنید.</p>
        : <><Button onClick={onFollowup}>پیگیری</Button>
          <Button tone="secondary" onClick={onPlan}>برنامهٔ مراجعه</Button>
          <Button tone="ghost" onClick={onMap}>نمایش روی نقشه</Button></>}
    </div>}
    <div className="uv-card-tags">
      {facts.mall && <Badge>پاساژ {facts.mall.value}</Badge>}
      {facts.floor && <Badge>طبقه {facts.floor.value}</Badge>}
      {facts.unit && <Badge>واحد {facts.unit.value}</Badge>}
      <Badge>آخرین تغییر قیمت: {formatTehranDateTime(offer.last_price_changed_at)}</Badge>
    </div>
    <details className="uv-card-details">
      <summary>جزئیات و شاهد آدرس</summary>
      <p>{facts.address || 'آدرس ثبت نشده'}</p>
      <dl className="uv-evidence">
        <Evidence label="پاساژ" part={facts.mall} />
        <Evidence label="طبقه" part={facts.floor} />
        <Evidence label="واحد" part={facts.unit} />
      </dl>
      <p className="uv-small">فاصلهٔ هوایی: {formatDistance(offer.direct_distance_meters)}؛ {HOURS_REASON_TEXT[offer.opening_hours.reason]}.</p>
      <CreditBadge offer={offer} />
      <p className="uv-small">نام فروشگاه، نام نمایشی دیتاست است و هویت حقوقی یا تأییدشده را نشان نمی‌دهد.</p>
      <p className="uv-small">اطلاعات ساعت/اعتبار اعلامی است؛ قیمت تاریخی موجودی یا قیمت روز را تأیید نمی‌کند.</p>
    </details>
  </article>;
}

function Evidence({ label, part }: { label: string; part: { value: string; matchedText: string } | null }) {
  return <div><dt>{label}</dt><dd>
    {part ? <>{part.value}<small className="uv-small">شاهد در متن آدرس: «{part.matchedText}»</small></>
      : <span className="uv-small">در متن آدرس مشخص نیست</span>}
  </dd></div>;
}
