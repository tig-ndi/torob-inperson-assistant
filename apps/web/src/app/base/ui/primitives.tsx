import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { CloseIcon } from '../../../presentation/icons-motion/icons.tsx';
import { formatMoney } from '../domain/presentation.ts';
import { formatDistance, formatTehranDateTime, HOURS_REASON_TEXT } from '../../../api.ts';
import type { Offer, RequestFailure } from '../domain/contracts.ts';

export function Button({ tone = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'ghost';
}) { return <button {...props} className={`ub-button ub-button--${tone} ${className}`} />; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'positive' | 'brand' }) {
  return <span className={`ub-badge ub-badge--${tone}`}>{children}</span>;
}
export function Price({ value }: { value: string | null }) {
  return <bdi className="ub-price">{formatMoney(value)}</bdi>;
}
export function OpenBadge({ offer }: { offer: Offer }) {
  const hours = offer.opening_hours;
  const label = { declared_open: 'طبق برنامه باز', declared_closed: 'طبق برنامه بسته', unknown: 'ساعت نامشخص' }[hours.status];
  return <Badge tone={hours.status === 'declared_open' ? 'positive' : hours.status === 'unknown' ? 'neutral' : 'warning'}>
    <span title={HOURS_REASON_TEXT[hours.reason]}>{label}</span>
  </Badge>;
}
export function FreshTag({ timestamp }: { timestamp: string | null }) {
  return <p className="ub-meta">آخرین تغییر قیمت ثبت‌شده: <bdi>{formatTehranDateTime(timestamp)}</bdi></p>;
}
export function CreditBadge({ offer }: { offer: Offer }) {
  return <Badge tone={offer.in_person_credit.status === 'matches_declared_terms' ? 'positive' : 'neutral'}>
    {offer.in_person_credit.status === 'matches_declared_terms' ? 'منطبق با شرایط اعتبار حضوری'
      : offer.in_person_credit.status === 'unknown' ? 'شرایط اعتبار نامشخص' : 'نامنطبق با شرایط اعتبار حضوری'}
  </Badge>;
}
export function SimBadge() { return <Badge tone="warning">شبیه‌سازی — تماس واقعی انجام نشد</Badge>; }
export function ErrorCard({ message, onRetry, failure }: { message: string; onRetry?: () => void; failure?: RequestFailure }) {
  return <div className="ub-error" role="alert"><p>{message}</p>{onRetry && failure?.retryable !== false && <Button tone="secondary" onClick={onRetry}>تلاش مجدد</Button>}</div>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="ub-empty"><h2>{title}</h2>{children}</div>;
}
export function Skeleton() {
  return <div role="status" aria-label="در حال دریافت" className="ub-skeleton"><span>در حال دریافت…</span></div>;
}
export function OfferCard({ offer, selected, onSelect, onCompare }: {
  offer: Offer; selected: boolean; onSelect: () => void; onCompare?: () => void;
}) {
  const name = offer.shop.location_label || offer.shop.address || 'موقعیت ثبت نشده';
  return <article className={`ub-offer ${selected ? 'is-selected' : ''}`} aria-label={name}>
    <div className="ub-card-heading"><h3>{name}</h3><Price value={offer.price_toman} /></div>
    {offer.shop.name && <p className="ub-meta">نام نمایشی دیتاست: {offer.shop.name}</p>}
    <div className="ub-badges"><OpenBadge offer={offer} /><Badge>{formatDistance(offer.direct_distance_meters)} · هوایی</Badge></div>
    <FreshTag timestamp={offer.last_price_changed_at} />
    <p className="ub-meta">موجودی تأییدنشده</p>
    <details><summary>آدرس و شرایط ثبت‌شده</summary><p>{offer.shop.address || 'آدرس ثبت نشده'}</p><CreditBadge offer={offer} />
      <p className="ub-meta">این اطلاعات، تأیید اعتبار یا موجودی فروشنده نیست.</p></details>
    <div className="ub-actions"><Button tone={selected ? 'primary' : 'secondary'} onClick={onSelect} aria-pressed={selected}>
      {selected ? 'انتخاب شده' : 'انتخاب این آفر'}</Button>{onCompare && <Button tone="ghost" onClick={onCompare}>مقایسه</Button>}</div>
  </article>;
}
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  return message ? <div className="ub-toast" role="status"><span>{message}</span>
    <Button tone="ghost" onClick={onClose} aria-label="بستن پیام"><CloseIcon /></Button></div> : null;
}
export function Dialog({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  const [trigger] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); queueMicrotask(() => { if (trigger?.isConnected) trigger.focus(); }); };
  }, [trigger]);
  return <dialog ref={ref} className={`ub-dialog ${className}`} aria-labelledby={id}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'
      ) ?? []).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      // Native modal makes the background inert; explicitly wrap Tab rather than
      // letting the final control yield focus to browser chrome.
      if (first && last && ((event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last))) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="ub-dialog-heading"><h2 id={id}>{title}</h2><Button tone="ghost" onClick={onClose} aria-label="بستن پنجره"><CloseIcon /></Button></div>
    {children}
  </dialog>;
}
