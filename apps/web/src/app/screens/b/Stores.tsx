import { useEffect } from 'react';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { useOffers } from '../../base/state/hooks.ts';
import type { Offer } from '../../base/domain/contracts.ts';
import { Button, Empty, ErrorCard, Skeleton } from '../../base/ui/primitives.tsx';import { MapPinIcon } from '../../../presentation/icons-motion/icons.tsx';
import { formatCount, storeGroups } from './model.ts';
import { useMapView } from '../../base/shell/MapView.tsx';
import { ReviewNotice } from './ReviewNotice.tsx';
import { StoreOfferCard } from './StoreOfferCard.tsx';

export function StoresScreen() {
  const { revealMap } = useMapView();
  const { state, dispatch } = useWorkspace();
  const offers = useOffers(state.product?.product_id ?? null, state.filters, state.position);
  const page = offers.result.data;
  const groups = page ? storeGroups(page.items) : [];
  const shops = new Set(page?.items.map(offer => offer.shop_id) ?? []).size;
  const focused = groups.find(group => group.shopId === state.focusedShopId);

  useEffect(() => {
    if (!state.focusedShopId) return;
    document.getElementById(`uv-shop-${state.focusedShopId}`)?.scrollIntoView({ block: 'nearest' });
  }, [state.focusedShopId, groups.length]);

  return <div className="uv-stores" aria-busy={offers.result.status === 'loading'}>
    <header className="uv-stores-head">
      <h2>فروشگاه‌های نزدیک</h2>
      <div className="uv-product-head">
        <div>
          <span className="uv-kicker">مدل انتخاب‌شده</span>
          <h3 className="uv-product-title">{state.product?.persian_title ?? 'فروشندگان همین محصول'}</h3>
        </div>
        <div className="uv-product-actions">
          <Button tone="ghost" onClick={() => dispatch({ type: 'navigate', screen: 'results' })}>تغییر مدل</Button>
          <Button className="uv-map-all-icon" tone="ghost" aria-label="نمایش همهٔ فروشگاه‌ها روی نقشه"
            onClick={() => { revealMap(); dispatch({ type: 'mapCamera', kind: 'all' }); }}>
            <MapPinIcon size={18} />
          </Button>
        </div>
      </div>
      <p className="ub-meta">{formatCount(offers.loadedCount)} آفر، {formatCount(shops)} فروشگاه</p>
      <div className="uv-sort" role="group" aria-label="مرتب‌سازی آفرها">
        <button type="button" aria-pressed={state.filters.sort === 'price'}
          onClick={() => dispatch({ type: 'filters', value: { sort: 'price' } })}>کمترین قیمت</button>
        <button type="button" aria-pressed={state.filters.sort === 'nearest'}
          onClick={() => dispatch({ type: 'filters', value: { sort: 'nearest' } })}>نزدیک‌ترین</button>
      </div>
      <div className="uv-quick-filters" role="group" aria-label="فیلترهای سریع">
        <button type="button" aria-pressed={state.filters.openNowOnly}
          onClick={() => dispatch({ type: 'filters', value: { openNowOnly: !state.filters.openNowOnly } })}>الان باز</button>
        <button type="button" aria-pressed={state.filters.creditOnly}
          onClick={() => dispatch({ type: 'filters', value: { creditOnly: !state.filters.creditOnly } })}>اعتبار حضوری</button>
      </div>
    </header>
    <ReviewNotice />
    {offers.result.status === 'loading' && !page && <Skeleton />}
    {offers.result.status === 'error' && <ErrorCard message={offers.result.error} failure={offers.result.failure} onRetry={offers.retry} />}
    {page && !page.items.length && <Empty title="آفری با این شرایط در صفحهٔ بارگذاری‌شده نیست">
      <p>بودجه، شعاع، ساعت یا اعتبار را تغییر دهید. این پیام نبود پوشش در تهران را اثبات نمی‌کند و موجودی زنده را نمی‌سنجد.</p>
    </Empty>}
    <p className="ub-sr-only" role="status" aria-live="polite">
      {focused ? `فروشگاه ${focused.title} از نقشه انتخاب شد؛ آفرهای آن در فهرست باز شده است.` : ''}
    </p>
    <div className="uv-shop-list">
      {groups.map(group => <ShopGroup key={group.shopId} groupId={group.shopId}
        title={group.title} offers={group.offers} focused={group.shopId === state.focusedShopId} />)}
    </div>
    {page?.has_more && <Button tone="secondary" disabled={offers.result.status === 'loading'} onClick={() => void offers.more()}>
      {offers.result.status === 'loading' ? 'در حال دریافت صفحهٔ بعد…' : 'آفرهای بیشتر'}
    </Button>}
    {state.compareOffers.length > 0 && <div className="uv-tray">
      <span>{formatCount(state.compareOffers.length)} آفر در سبد مقایسه</span>
      <Button onClick={() => dispatch({ type: 'navigate', screen: 'compare' })}>مقایسهٔ {formatCount(state.compareOffers.length)} آفر</Button>
    </div>}
    <p className="uv-note">این شمار، مجموعهٔ همین شرایط و صفحه است؛ شمار کل فروشگاه‌های تهران یا موجودی زنده نیست.</p>
    <p className="uv-note">در موبایل، نقشه و فهرست با دکمهٔ بالای پنل تعویض می‌شوند. اگر نقشه یا کاشی‌ها در دسترس نباشند، همین فهرست مسیر انتخاب، مقایسه، پیگیری و مراجعه را کامل نگه می‌دارد.</p>
  </div>;
}

function ShopGroup({ groupId, title, offers, focused }: {
  groupId: string; title: string; offers: Offer[]; focused: boolean;
}) {
  const { revealMap } = useMapView();
  const { state, dispatch } = useWorkspace();
  return <section id={`uv-shop-${groupId}`} className={`uv-shop${focused ? ' is-focused' : ''}`} aria-label={title}>
    {offers.length > 1 && <p className="uv-shop-count">{formatCount(offers.length)} آفر در همین فروشگاه</p>}
    <div className="uv-shop-offers">
      {offers.map(offer => {
        const selected = state.selectedOffer?.offer_id === offer.offer_id;
        const compared = state.compareOffers.some(item => item.offer_id === offer.offer_id);
        return <StoreOfferCard key={offer.offer_id} offer={offer} selected={selected} compared={compared}
          needsReview={selected && state.selectionNeedsReview}
          onSelect={() => dispatch({ type: 'selectOffer', value: offer })}
          onCompare={() => dispatch({ type: 'compareOffer', value: offer })}
          onFollowup={() => dispatch({ type: 'navigate', screen: 'contact' })}
          onPlan={() => {
            dispatch({ type: 'plan', primary: offer });
            dispatch({ type: 'navigate', screen: 'trip' });
          }}
          onMap={() => {
            revealMap();
            dispatch({ type: 'mapCamera', kind: 'selection' });
          }} />;
      })}
    </div>
  </section>;
}
