import type { ReactNode } from 'react';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import type { Offer } from '../../base/domain/contracts.ts';
import { formatDistance, formatTehranDateTime, HOURS_REASON_TEXT } from '../../../api.ts';
import { Badge, Button, CreditBadge, Empty, OpenBadge, Price } from '../../base/ui/primitives.tsx';
import { formatCount, offerInCurrentPage, shopFacts, shopName } from './model.ts';
import { ReviewNotice } from './ReviewNotice.tsx';

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
      <p className="uv-small">نام فروشگاه‌ها نمایشی‌اند و هویت حقوقی یا تأییدشده نیستند.</p>
      <p className="uv-note uv-compare-hint">در موبایل جدول را افقی بکشید تا ستون آفرهای دیگر دیده شود.</p>
    </header>
    <ReviewNotice />
    <section className="uv-compare-summary" aria-label="خلاصهٔ گزینه‌های مقایسه">
      {offers.map((offer, index) => {
        // Comparison rows are historical: only offers still in the loaded page can be chosen from here,
        // and the previously selected offer needs its own review before it is reused.
        const inPage = offerInCurrentPage(state, offer);
        const waiting = inPage && state.selectionNeedsReview && state.selectedOffer?.offer_id === offer.offer_id;
        const selectable = inPage && !waiting;
        return <article key={offer.offer_id} className="uv-compare-option" aria-label={`آفر ${formatCount(index + 1)}`}>
          <span className="uv-small">آفر {formatCount(index + 1)}</span>
          <h3>{shopName(offer)}</h3>
          {offer.seller_title && <p className="uv-small">{offer.seller_title}</p>}
          <Price value={offer.price_toman} />
          <p className="uv-small">آخرین تغییر قیمت: {formatTehranDateTime(offer.last_price_changed_at)}</p>
          <dl>
            <div><dt>فاصلهٔ هوایی</dt><dd>{formatDistance(offer.direct_distance_meters)}</dd></div>
            <div><dt>ساعت اعلامی</dt><dd><OpenBadge offer={offer} /></dd></div>
            <div><dt>اعتبار حضوری</dt><dd><CreditBadge offer={offer} /></dd></div>
          </dl>
          {selectable
            ? <Button tone="secondary" aria-label={`انتخاب و پیگیری آفر ${formatCount(index + 1)}`} onClick={() => {
              dispatch({ type: 'selectOffer', value: offer });
              dispatch({ type: 'navigate', screen: 'contact' });
            }}>انتخاب و پیگیری</Button>
            : <><p className="uv-note">{waiting ? 'انتخاب قبلی با شرایط فعلی نیازمند تأیید است.' : 'این آفر با شرایط فعلی بازبینی نشده است؛ مشاهده و مقایسه آزاد است.'}</p>
              <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: 'stores' })}>بازبینی در فروشندگان</Button></>}
        </article>;
      })}
    </section>
    <h3 className="uv-compare-detail-title">جزئیات و شواهد هر آفر</h3>
    <div className="uv-compare-scroll" role="region" aria-label="جدول مقایسهٔ آفرها" tabIndex={0}>
      <table className="uv-table">
        <caption className="ub-sr-only">مقایسهٔ {formatCount(offers.length)} آفر از یک محصول</caption>
        <thead><tr><th scope="col">ویژگی</th>{offers.map(offer => <th scope="col" key={offer.offer_id}>
          <span className="uv-table-title">{shopName(offer)}</span>
          <Price value={offer.price_toman} />
        </th>)}</tr></thead>
        <tbody>
          <Row label="فروشگاه" offers={offers}>{offer => <>
            <span>{shopName(offer)}</span>
            <Small>{shopFacts(offer).title} · {shopFacts(offer).address || 'آدرس ثبت نشده'}</Small>
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
            // A changed condition must not turn a saved row into a selection or a destination by one click.
            const inPage = offerInCurrentPage(state, offer);
            const waiting = inPage && state.selectionNeedsReview && selected;
            const selectable = inPage && !waiting;
            return <div className="uv-column-actions">
              {selectable ? <>
                <Button tone={selected ? 'primary' : 'secondary'} onClick={() => dispatch({ type: 'selectOffer', value: offer })}>
                  {selected ? 'انتخاب‌شده' : 'انتخاب این آفر'}
                </Button>
                <Button tone="secondary" onClick={() => {
                  dispatch({ type: 'selectOffer', value: offer });
                  dispatch({ type: 'plan', primary: offer });
                  dispatch({ type: 'navigate', screen: 'trip' });
                }}>برنامهٔ مراجعه</Button>
              </> : <>
                <p className="uv-note">{waiting ? 'انتخاب قبلی نیازمند تأیید است.' : 'این آفر با شرایط فعلی بازبینی نشده است.'}</p>
                <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: 'stores' })}>بازبینی در فروشندگان</Button>
              </>}
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
