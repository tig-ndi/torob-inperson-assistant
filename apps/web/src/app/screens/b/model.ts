import type { Alternatives, FollowupOutcome, Offer, PreparedFollowup } from '../../base/domain/contracts.ts';
import { addressEvidence, groupOffers } from '../../base/domain/presentation.ts';

export type StoreGroup = {
  shopId: string;
  title: string;
  address: string | null;
  offers: Offer[];
};

/** Groups loaded offers for display only; every offer_id stays selectable. */
export function storeGroups(offers: readonly Offer[]): StoreGroup[] {
  return groupOffers(offers).map(group => {
    const first = group.offers[0]!;
    return {
      shopId: group.shopId,
      title: first.shop.name || first.shop.location_label || first.shop.address || 'موقعیت ثبت نشده',
      address: first.shop.address,
      offers: group.offers,
    };
  });
}

export type SelectionReview = 'none' | 'visible' | 'outside';
// Identity is offer_id; a shop or a first row cannot stand in for the chosen offer.
export function selectionReview(selected: Offer | null, offers: readonly Offer[]): SelectionReview {
  if (!selected) return 'none';
  return offers.some(offer => offer.offer_id === selected.offer_id) ? 'visible' : 'outside';
}

export type TripAlternative = { offer: Offer; source: 'simulated' | 'user_report' };

/** Alternatives must come from the recorded follow-up endpoint result of the same product. */
export function tripAlternatives(
  followups: Record<string, { prepared: PreparedFollowup | null; alternatives: Alternatives | null }>,
  primary: Offer,
): TripAlternative[] {
  const result: TripAlternative[] = [];
  for (const entry of Object.values(followups)) {
    const alternatives = entry.alternatives;
    if (!alternatives) continue;
    for (const offer of alternatives.alternatives.items) {
      if (offer.product_id !== primary.product_id || offer.shop_id === primary.shop_id) continue;
      if (result.some(item => item.offer.offer_id === offer.offer_id)) continue;
      result.push({ offer, source: alternatives.outcome.source });
    }
  }
  return result;
}

/** Where a planned destination came from, independent of which shop is primary now. */
export function alternativeOrigin(
  followups: Record<string, { prepared: PreparedFollowup | null; alternatives: Alternatives | null }>,
  offer: Offer,
): 'simulated' | 'user_report' | undefined {
  for (const entry of Object.values(followups)) {
    const alternatives = entry.alternatives;
    if (!alternatives) continue;
    if (alternatives.alternatives.items.some(item => item.offer_id === offer.offer_id)) return alternatives.outcome.source;
  }
  return undefined;
}

export function offerCoordinates(offer: Offer): { lat: number; lon: number } | null {
  const { lat, lon } = offer.shop;
  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function mapLink(offer: Offer): string | null {
  const point = offerCoordinates(offer);
  if (!point) return null;
  return `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=17/${point.lat}/${point.lon}`;
}

export function neshanLink(offer: Offer): string | null {
  const point = offerCoordinates(offer);
  if (!point) return null;
  return `https://nshn.ir/?lat=${point.lat}&lng=${point.lon}`;
}

export function baladLink(offer: Offer): string | null {
  const point = offerCoordinates(offer);
  if (!point) return null;
  return `https://balad.ir/location?latitude=${point.lat}&longitude=${point.lon}`;
}

export function googleMapsLink(offer: Offer): string | null {
  const point = offerCoordinates(offer);
  if (!point) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lon}`;
}

const faNumbers = new Intl.NumberFormat('fa-IR');
export function formatCount(value: number): string { return faNumbers.format(value); }

export const OUTCOME_LABEL: Record<FollowupOutcome, string> = {
  no_answer: 'پاسخی دریافت نشد',
  closed: 'فروشگاه بسته بود',
  out_of_stock: 'کالا موجود نبود',
};

export const SOURCE_LABEL: Record<'simulated' | 'user_report', string> = {
  simulated: 'شبیه‌سازی',
  user_report: 'گزارش خودم از مراجعه',
};

export type ShopFacts = {
  name: string | null;
  title: string;
  address: string | null;
  mall: ReturnType<typeof addressEvidence>['mall'];
  floor: ReturnType<typeof addressEvidence>['floor'];
  unit: ReturnType<typeof addressEvidence>['unit'];
};

export function shopFacts(offer: Offer): ShopFacts {
  return {
    name: offer.shop.name,
    title: offer.shop.location_label || offer.shop.address || offer.shop.name || 'موقعیت ثبت نشده',
    address: offer.shop.address,
    ...addressEvidence(offer.shop.address),
  };
}

export function shopName(offer: Offer): string {
  const facts = shopFacts(offer);
  return facts.name || facts.title;
}
