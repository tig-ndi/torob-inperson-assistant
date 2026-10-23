import type { Alternatives, AlternativeSearch } from '../domain/contracts.ts';
import { ContractError } from '../domain/validation.ts';
import { offerQueryKey } from './model.ts';

/** Memory-only; includes coordinates. Never log or persist this key. */
export function alternativeSearchKey(search: AlternativeSearch): string {
  return JSON.stringify([search.selection.offer_id, search.selection.shop_id, search.outcome, search.source,
    offerQueryKey(search.selection.product_id, search.filters, search.position)]);
}

export function appendAlternatives(base: Alternatives, next: Alternatives): Alternatives {
  const before = base.alternatives, page = next.alternatives;
  if (!before.has_more || page.offset !== before.offset + before.limit || page.limit !== before.limit ||
    (page.has_more && !page.items.length) || base.product_id !== next.product_id ||
    base.reported_offer_id !== next.reported_offer_id || base.reported_shop_id !== next.reported_shop_id ||
    base.excluded_offer_count !== next.excluded_offer_count || base.outcome.kind !== next.outcome.kind ||
    base.outcome.source !== next.outcome.source ||
    page.items.some(item => item.product_id !== base.product_id || item.shop_id === base.reported_shop_id)) {
    throw new ContractError('صفحهٔ جایگزین‌ها با این پیگیری سازگار نیست؛ دوباره جایگزین‌ها را دریافت کنید.');
  }
  if (before.provenance.snapshot_id !== page.provenance.snapshot_id ||
    before.provenance.dataset !== page.provenance.dataset || before.provenance.generated_at_utc !== page.provenance.generated_at_utc) {
    throw new ContractError('نسخهٔ کاتالوگ تغییر کرده است؛ جایگزین‌ها را از ابتدا دریافت کنید.');
  }
  const items = new Map(before.items.map(item => [item.offer_id, item]));
  for (const item of page.items) items.set(item.offer_id, item);
  // Keep the first report's timestamp/source, not a newly generated report time per page.
  return { ...base, alternatives: { ...page, items: [...items.values()] } };
}
