import { useEffect } from 'react';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { useOffers } from '../../base/state/hooks.ts';
import type { Offer } from '../../base/domain/contracts.ts';
import { Badge, Button, Empty, ErrorCard, OfferCard, Skeleton } from '../../base/ui/primitives.tsx';
import { formatCount, storeGroups } from './model.ts';
import { revealMapOnMobile } from './revealMap.ts';
import { ReviewNotice } from './ReviewNotice.tsx';

export function StoresScreen() {
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

  return <div className="uv-stores">
    <header className="uv-stores-head">
      <h2>{state.product?.persian_title ?? 'فروشندگان همین محصول'}</h2>
      <p className="ub-meta">{formatCount(offers.loadedCount)} آفر در {formatCount(shops)} فروشگاه</p>
      <div className="uv-toolbar">
        {state.compareOffers.length > 0 && <Button tone="secondary" onClick={() => dispatch({ type: 'navigate', screen: 'compare' })}>
          مقایسهٔ {formatCount(state.compareOffers.length)} آفر
        </Button>}
        <Button className="uv-map-all" tone="ghost" onClick={() => dispatch({ type: 'mapCamera', kind: 'all' })}>نمایش همه روی نقشه</Button>
      </div>
    </header>
    <ReviewNotice />
    {offers.result.status === 'loading' && !page && <Skeleton />}
    {offers.result.status === 'error' && <ErrorCard message={offers.result.error} onRetry={offers.retry} />}
    {page && !page.items.length && <Empty title="آفری با این شرایط در صفحهٔ بارگذاری‌شده نیست">
      <p>بودجه، شعاع، ساعت یا اعتبار را تغییر دهید. این پیام نبود پوشش در تهران را اثبات نمی‌کند و موجودی زنده را نمی‌سنجد.</p>
    </Empty>}
    <p className="ub-sr-only" role="status" aria-live="polite">
      {focused ? `فروشگاه ${focused.title} از نقشه انتخاب شد؛ آفرهای آن در فهرست باز شده است.` : ''}
    </p>
    <div className="uv-shop-list">
      {groups.map(group => <ShopGroup key={group.shopId} groupId={group.shopId}
        title={group.title} address={group.address} offers={group.offers} focused={group.shopId === state.focusedShopId} />)}
    </div>
    {page?.has_more && <Button tone="secondary" disabled={offers.result.status === 'loading'} onClick={() => void offers.more()}>
      {offers.result.status === 'loading' ? 'در حال دریافت صفحهٔ بعد…' : 'آفرهای بیشتر'}
    </Button>}
    <p className="uv-note">این شمار، مجموعهٔ همین شرایط و صفحه است؛ شمار کل فروشگاه‌های تهران یا موجودی زنده نیست.</p>
    <p className="uv-note">در موبایل، نقشه و فهرست با دکمهٔ بالای پنل تعویض می‌شوند. اگر نقشه یا کاشی‌ها در دسترس نباشند، همین فهرست مسیر انتخاب، مقایسه، پیگیری و مراجعه را کامل نگه می‌دارد.</p>
  </div>;
}

function ShopGroup({ groupId, title, address, offers, focused }: {
  groupId: string; title: string; address: string | null; offers: Offer[]; focused: boolean;
}) {
  const { state, dispatch } = useWorkspace();
  return <section id={`uv-shop-${groupId}`} className={`uv-shop${focused ? ' is-focused' : ''}`}
    aria-labelledby={`uv-shop-${groupId}-title`}>
    <header className="uv-shop-head">
      <div className="uv-shop-title">
        <div className="uv-shop-title-line">
          <h3 id={`uv-shop-${groupId}-title`}>{title}</h3>
          <Badge tone="brand">{formatCount(offers.length)} آفر</Badge>
        </div>
        <p className="ub-meta">{address || 'آدرس ثبت نشده'}</p>
      </div>
    </header>
    <div className="uv-shop-offers">
      {offers.map(offer => {
        const selected = state.selectedOffer?.offer_id === offer.offer_id;
        const compared = state.compareOffers.some(item => item.offer_id === offer.offer_id);
        return <div className={`uv-offer-wrap${compared ? ' is-compared' : ''}`} key={offer.offer_id}>
          {offer.seller_title && <p className="uv-seller">{offer.seller_title}</p>}
          {compared && <p className="uv-compare-flag" role="status">در فهرست مقایسه</p>}
          <OfferCard offer={offer} selected={selected}
            onSelect={() => dispatch({ type: 'selectOffer', value: offer })}
            onCompare={() => dispatch({ type: 'compareOffer', value: offer })} />
          {selected && <div className="uv-next">
            {state.selectionNeedsReview
              ? <p className="uv-note">شرایط عوض شده است؛ پیش از پیگیری یا ثبت مقصد، انتخاب را تأیید کنید.</p>
              : <><Button onClick={() => dispatch({ type: 'navigate', screen: 'contact' })}>پیگیری این آفر</Button>
                <Button tone="secondary" onClick={() => {
                  dispatch({ type: 'plan', primary: offer });
                  dispatch({ type: 'navigate', screen: 'trip' });
                }}>برنامهٔ مراجعه</Button>
                <Button tone="ghost" onClick={() => {
                  revealMapOnMobile();
                  dispatch({ type: 'mapCamera', kind: 'selection' });
                }}>نمایش روی نقشه</Button></>}
          </div>}
        </div>;
      })}
    </div>
  </section>;
}
