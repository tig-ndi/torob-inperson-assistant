import { useWorkspace } from '../state/Workspace.tsx';
import { useOffers } from '../state/hooks.ts';
import { Button, Empty, ErrorCard, OfferCard, Price, Skeleton } from './primitives.tsx';
import type { CataloguePage } from '../domain/contracts.ts';

/** Real-data seam for Base acceptance; A/B replace their mount points, not base. */
export function CataloguePreview({ page }: { page: CataloguePage }) {
  const { dispatch } = useWorkspace();
  return <div className="ub-results">
    <p className="ub-meta">{page.items.length} محصول در این صفحه؛ بازهٔ قیمت شامل همهٔ آفرهای ثبت‌شدهٔ هر محصول است.</p>
    {!page.items.length && <Empty title="نتیجه‌ای با این عبارت و شرایط ثبت نشده"><p>عبارت یا فیلترها را بررسی کنید؛ این پیام، نبود پوشش جغرافیایی را اثبات نمی‌کند.</p></Empty>}
    {page.items.map(product => <article className="ub-product" key={product.product_id}>
      <h2>{product.persian_title ?? 'عنوان ثبت نشده'}</h2><Price value={product.offer_summary.min_price_toman} />
      <p className="ub-meta">کمترین قیمت ثبت‌شده · موجودی تأییدنشده</p>
      <Button tone="secondary" onClick={() => { dispatch({ type: 'product', value: product }); dispatch({ type: 'navigate', screen: 'stores' }); }}>دیدن فروشندگان</Button>
    </article>)}
    {page.has_more && <p className="ub-meta">نتایج ادامه دارند؛ صفحه‌بندی محصول در تسک A تکمیل می‌شود.</p>}
  </div>;
}
export function OffersPreview() {
  const { state, dispatch } = useWorkspace();
  const offers = useOffers(state.product?.product_id ?? null, state.filters, state.position);
  return <div className="ub-results"><h2 className="ub-section-title">{state.product?.persian_title}</h2>
    <p className="ub-meta">{offers.loadedCount} آفر بارگذاری‌شده؛ شمار کل فروشگاه‌ها نیست.</p>
    {state.selectionNeedsReview && <p className="ub-warning">شرایط تغییر کرده‌اند؛ انتخاب قبلی نیازمند بررسی دوباره است.</p>}
    {offers.result.status === 'loading' && <Skeleton />}
    {offers.result.status === 'error' && <ErrorCard message={offers.result.error} onRetry={offers.retry} />}
    {offers.result.status === 'success' && !offers.loadedCount && <Empty title="آفر منطبق ثبت نشده"><p>شرایط را تغییر دهید؛ موجودی زنده را از این نتیجه استنباط نمی‌کنیم.</p></Empty>}
    {offers.result.data?.items.map(offer => <OfferCard key={offer.offer_id} offer={offer} selected={state.selectedOffer?.offer_id === offer.offer_id}
      onSelect={() => dispatch({ type: 'selectOffer', value: offer })} onCompare={() => dispatch({ type: 'compareOffer', value: offer })} />)}
    {offers.result.data?.has_more && <Button tone="secondary" disabled={offers.result.status === 'loading'} onClick={() => void offers.more()}>آفرهای بیشتر</Button>}
  </div>;
}
