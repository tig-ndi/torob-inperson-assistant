import type { WorkspaceState } from '../state/model.ts';
import { offerQueryKey } from '../state/model.ts';
import { formatMoney, groupOffers, minimumRecordedPrice } from './presentation.ts';
import type { MapPin } from '../../map/MapLayer.tsx';

export function pinsForWorkspace(state: WorkspaceState): MapPin[] {
  const key = offerQueryKey(state.product?.product_id ?? null, state.filters, state.position);
  if (state.loadedOffers?.key !== key) return [];
  return groupOffers(state.loadedOffers.page.items).flatMap(group => {
    const shop = group.offers[0]?.shop;
    if (!shop || shop.lat === null || shop.lon === null) return [];
    const statuses = new Set(group.offers.map(o => o.opening_hours.status));
    return [{ id: group.shopId, lat: shop.lat, lon: shop.lon,
      label: `از ${formatMoney(minimumRecordedPrice(group.offers))} · آفرهای بارگذاری‌شده`,
      offerIds: group.offers.map(o => o.offer_id), state: statuses.size === 1 ? group.offers[0]!.opening_hours.status : 'unknown' as const }];
  });
}
