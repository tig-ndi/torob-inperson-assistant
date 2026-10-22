import type { Offer } from './contracts.ts';
import { money } from './validation.ts';

export function formatMoney(value: string | null): string {
  const exact = money(value);
  return exact === null ? 'قیمت ثبت نشده' : `${new Intl.NumberFormat('fa-IR').format(BigInt(exact))} تومان`;
}
export type AddressPart = { value: string; matchedText: string };
export type AddressEvidence = { mall: AddressPart | null; floor: AddressPart | null; unit: AddressPart | null };
export function addressEvidence(address: string | null): AddressEvidence {
  const part = (pattern: RegExp): AddressPart | null => {
    const match = address?.match(pattern);
    return match?.[1]?.trim() ? { value: match[1].trim(), matchedText: match[0] } : null;
  };
  return {
    mall: part(/(?:پاساژ|مجتمع تجاری|مرکز خرید)\s+([^،,؛;\n]{1,70}?)(?=\s+(?:طبقه|واحد|پلاک|تلفن|کد پستی)|[،,؛;\n]|$)/u),
    floor: part(/طبقه\s*[:：]?\s*(همکف|زیرزمین|اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|[۰-۹٠-٩0-9]+)(?=\s|[،,؛;\n]|$)/u),
    unit: part(/واحد\s*[:：]?\s*([۰-۹٠-٩0-9]+(?:\s*[-/]\s*[۰-۹٠-٩0-9]+)?)(?=\s|[،,؛;\n]|$)/u),
  };
}
export function offerView(offer: Offer) {
  return { ...offer, addressEvidence: addressEvidence(offer.shop.address),
    displayName: offer.shop.location_label || offer.shop.address || offer.shop.name || 'موقعیت ثبت نشده',
    nameNote: offer.shop.name ? `نام نمایشی دیتاست: ${offer.shop.name}` : 'نام فروشگاه ثبت نشده' };
}
// Grouping is display-only. All source offers and IDs stay available inside each group.
export function groupOffers(offers: readonly Offer[]): { shopId: string; offers: Offer[] }[] {
  const groups = new Map<string, Offer[]>();
  for (const offer of offers) {
    const key = `${offer.product_id}\u0000${offer.shop_id}`;
    const group = groups.get(key) ?? [];
    if (!group.some(o => o.offer_id === offer.offer_id)) group.push(offer);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ shopId: group[0]!.shop_id, offers: group }));
}
export function minimumRecordedPrice(offers: readonly Offer[]): string | null {
  let result: string | null = null;
  for (const offer of offers) if (offer.price_toman !== null && (result === null || BigInt(offer.price_toman) < BigInt(result))) result = offer.price_toman;
  return result;
}
