import type { ReactNode } from 'react';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import type { Offer } from '../../base/domain/contracts.ts';
import { formatDistance, formatTehranDateTime, HOURS_REASON_TEXT } from '../../../api.ts';
import { Badge, Button, CreditBadge, Empty, OpenBadge, Price } from '../../base/ui/primitives.tsx';
import { formatCount, shopFacts } from './model.ts';

export function CompareScreen() {
  const { state, dispatch } = useWorkspace();
  const offers = state.compareOffers;
  if (!state.product) return <Empty title="محصولی انتخاب نشده"><p>ابتدا یک محصول را از نتایج برگزینید.</p></Empty>;
  if (offers.length < 2) return <div className="uv-compare">
    <Empty title="برای مقایسه، ۲ تا ۳ آفر از همین محصول انتخاب کنید">
      <p>مقایسه اجباری نیست. با یک فروشگاه هم می‌توانید پیش‌نویس پیگیری و برنامهٔ مراجعه بسازید.</p>
    </Empty>
    <div className="uv-inline-actions">
      <Button onClick={() => dispatch({ type: 'navigate', screen: 'stores' })}>رفتن به آفرهای فروشندگان</Button>
      {offers.length === 1 && <Button tone="ghost" onClick={() => dispatch({ type: 'compareOffer', value: offers[0]! })}>پاک‌کردن انتخاب مقایسه</Button>}
    </div>
  </div>;
  return <div className="uv-compare">
    <header>
      <h2>مقایسهٔ آفرهای همین محصول</h2>
      <p className="ub-meta">قیمت‌ها و ساعت‌های ثبت‌شده‌اند، نه موجودی یا تأیید فروشنده. هر آفر مستقل مقایسه می‌شود و چند آفر یک فروشگاه جدا می‌مانند.</p>
    </header>
    <div className="uv-compare-scroll" role="region" aria-label="جدول مقایسهٔ آفرها" tabIndex={0}>
      <table className="uv-table">
        <caption className="ub-sr-only">مقایسهٔ {formatCount(offers.length)} آفر از یک محصول</caption>
        <thead><tr><th scope="col">ویژگی</th>{offers.map(offer => <th scope="col" key={offer.offer_id}>
          <span className="uv-table-title">{shopFacts(offer).title}</span>
          <Price value={offer.price_toman} />
        </th>)}</tr></thead>
        <tbody>
          <Row label="فروشگاه" offers={offers}>{offer => <>
            <span>{shopFacts(offer).title}</span>
            <Small>{shopFacts(offer).address || 'آدرس ثبت نشده'}</Small>
          </>}</Row>
          <Row label="قیمت ثبت‌شده" offers={offers}>{offer => <><Price value={offer.price_toman} /><Small>موجودی تأییدنشده</Small></>}</Row>
          <Row label="آخرین تغییر قیمت" offers={offers}>{offer => <Small>{formatTehranDateTime(offer.last_price_changed_at)}</Small>}</Row>
          <Row label="فاصلهٔ هوایی" offers={offers}>{offer => <Small>{formatDistance(offer.direct_distance_meters)} · هوایی</Small>}</Row>
          <Row label="ساعت اعلامی" offers={offers}>{offer => <><OpenBadge offer={offer} />
            <Small>{HOURS_REASON_TEXT[offer.opening_hours.reason]}؛ نامعلوم به معنی بسته‌بودن نیست.</Small></>}</Row>
          <Row label="شرایط اعتبار حضوری" offers={offers}>{offer => <><CreditBadge offer={offer} />
            <Small>تطابق با شرایط اعلامی است، نه تأیید اعتبار خریدار.</Small></>}</Row>
          <Row label="آدرس ثبت‌شده" offers={offers}>{offer => <Small>{offer.shop.address || 'ثبت نشده'}</Small>}</Row>
          <Row label="پاساژ" offers={offers}>{offer => <Evidence part={shopFacts(offer).mall} />}</Row>
          <Row label="طبقه" offers={offers}>{offer => <Evidence part={shopFacts(offer).floor} />}</Row>
          <Row label="واحد" offers={offers}>{offer => <Evidence part={shopFacts(offer).unit} />}</Row>
          <Row label="اقدام" offers={offers}>{offer => {
            const selected = state.selectedOffer?.offer_id === offer.offer_id;
            return <div className="uv-column-actions">
              <Button tone={selected ? 'primary' : 'secondary'} onClick={() => dispatch({ type: 'selectOffer', value: offer })}>
                {selected ? 'انتخاب‌شده' : 'انتخاب این آفر'}
              </Button>
              <Button tone="secondary" onClick={() => {
                dispatch({ type: 'selectOffer', value: offer });
                dispatch({ type: 'plan', primary: offer });
                dispatch({ type: 'navigate', screen: 'trip' });
              }}>برنامهٔ مراجعه</Button>
              <Button tone="ghost" onClick={() => dispatch({ type: 'compareOffer', value: offer })}>حذف از مقایسه</Button>
            </div>;
          }}</Row>
        </tbody>
      </table>
    </div>
    <div className="uv-inline-actions">
      <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: 'stores' })}>افزودن یا حذف آفر</Button>
      {state.visitPlan && <Badge>برنامهٔ مراجعهٔ ثبت‌شده از انتخاب قبلی مستقل است</Badge>}
    </div>
    <p className="uv-note">مقایسه برنامهٔ مراجعه نمی‌سازد؛ فقط اقدام صریح «برنامهٔ مراجعه» مقصد را ثبت می‌کند.</p>
  </div>;
}

function Row({ label, offers, children }: {
  label: string; offers: Offer[]; children: (offer: Offer) => ReactNode;
}) {
  return <tr><th scope="row">{label}</th>{offers.map(offer => <td key={offer.offer_id}>{children(offer)}</td>)}</tr>;
}
function Small({ children }: { children: ReactNode }) { return <span className="uv-small">{children}</span>; }
function Evidence({ part }: { part: { value: string; matchedText: string } | null }) {
  if (!part) return <Small>در متن آدرس مشخص نیست</Small>;
  return <><span>{part.value}</span><Small>شاهد در آدرس: «{part.matchedText}»</Small></>;
}
