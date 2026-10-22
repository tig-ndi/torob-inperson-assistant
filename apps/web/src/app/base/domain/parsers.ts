import { parseProduct, parseOfferPage } from '../../../api.ts';
import type { Alternatives, AssistantTurn, BatteryRequirement, CataloguePage, CatalogueProduct, Explanation,
  NeedState, NearestOffer, Offer, OfferPage, PreparedFollowup } from './contracts.ts';
import { bool, ContractError, identifier, instant, integer, list, money, nullableText, oneOf,
  pairedCoordinates, provenance, record, text } from './validation.ts';

const topics = ['camera', 'battery'] as const;
const sorts = ['price', 'nearest'] as const;
export function parseBattery(value: unknown): BatteryRequirement {
  const b = record(value);
  const status = oneOf(b.status, ['unspecified', 'awaiting_minimum', 'no_minimum', 'minimum']);
  const minimum_mah = b.minimum_mah === null ? null : integer(b.minimum_mah, 0, 1000000);
  if ((status === 'minimum') !== (minimum_mah !== null)) throw new ContractError();
  return { status, minimum_mah };
}
export function parseNeedState(value: unknown): NeedState {
  const s = record(value);
  if (s.version !== 1) throw new ContractError('نسخهٔ وضعیت گفت‌وگو پشتیبانی نمی‌شود.');
  const topic_query = nullableText(s.topic_query, 120);
  const category_name = nullableText(s.category_name, 120);
  if (topic_query === '' || category_name === '') throw new ContractError();
  const pending_requirements = list(s.pending_requirements, item => {
    const p = record(item);
    const key = text(p.key, 64), source_text = text(p.source_text, 1000);
    if (!key.trim() || !source_text.trim() || p.status !== 'unsupported') throw new ContractError();
    return { key, source_text, status: 'unsupported' as const };
  }, 8);
  const normalized = pending_requirements.map(p => p.key.normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim());
  if (new Set(normalized).size !== normalized.length || (pending_requirements.length && !topic_query)) throw new ContractError();
  const review_topics = list(s.review_topics, x => oneOf(x, topics), 2);
  if (new Set(review_topics).size !== review_topics.length) throw new ContractError();
  return { version: 1, topic_query, category_name, pending_requirements, review_topics,
    category_cleared: bool(s.category_cleared), max_price_toman: money(s.max_price_toman),
    budget_needs_input: bool(s.budget_needs_input), offer_sort: oneOf(s.offer_sort, sorts),
    battery_requirement: parseBattery(s.battery_requirement) };
}
function parseNearest(value: unknown, productId: string): NearestOffer | null {
  if (value === null || value === undefined) return null;
  const o = record(value);
  if (o.inventory_status !== 'unconfirmed' || o.product_id !== productId) throw new ContractError();
  return { offer_id: identifier(o.offer_id), product_id: productId, shop_id: identifier(o.shop_id),
    price_toman: money(o.price_toman), last_price_changed_at: o.last_price_changed_at === null ? null : instant(o.last_price_changed_at),
    direct_distance_meters: integer(o.direct_distance_meters), inventory_status: 'unconfirmed' };
}
export function parseCatalogueProduct(value: unknown): CatalogueProduct {
  const raw = record(value);
  const product = parseProduct(value);
  money(product.offer_summary.min_price_toman); money(product.offer_summary.max_price_toman);
  if (raw.battery_capacity !== null && raw.battery_capacity !== undefined) {
    const b = record(raw.battery_capacity);
    const status = oneOf(b.status, ['known', 'unknown', 'conflicting', 'not_applicable']);
    const capacity = b.capacity_mah === null ? null : integer(b.capacity_mah, 0, 1000000);
    if ((status === 'known') !== (capacity !== null)) throw new ContractError();
  }
  return { ...product, nearest_offer: parseNearest(raw.nearest_offer, product.product_id) };
}
export function parseCataloguePage(value: unknown): CataloguePage {
  const p = record(value); provenance(p.provenance);
  return { items: list(p.items, parseCatalogueProduct, 50), has_more: bool(p.has_more),
    limit: integer(p.limit, 1, 50), offset: integer(p.offset, 0, 1000000),
    provenance: provenance(p.provenance),
    category_name: nullableText(p.category_name), min_battery_capacity_mah: p.min_battery_capacity_mah == null
      ? null : integer(p.min_battery_capacity_mah, 0, 1000000) };
}
function validateOffer(value: unknown): void {
  const o = record(value), shop = record(o.shop);
  if (o.inventory_status !== 'unconfirmed') throw new ContractError();
  identifier(o.offer_id); identifier(o.product_id); identifier(o.shop_id); money(o.price_toman);
  pairedCoordinates(shop.lat, shop.lon);
  if (o.direct_distance_meters !== null) integer(o.direct_distance_meters);
  if (o.last_price_changed_at !== null) instant(o.last_price_changed_at);
}
export function parseOffers(value: unknown): OfferPage {
  const p = record(value); provenance(p.provenance);
  list(p.items, validateOffer, 50); integer(p.limit, 1, 50); integer(p.offset, 0, 1000000);
  const result = parseOfferPage(value);
  if (new Set(result.items.map(o => o.offer_id)).size !== result.items.length) throw new ContractError();
  return { ...result, provenance: provenance(p.provenance) };
}
function parseExplanation(value: unknown): Explanation | null {
  if (value === null) return null;
  const e = record(value); provenance(e.provenance);
  return { query: text(e.query, 120), category_name: nullableText(e.category_name), max_price_toman: money(e.max_price_toman),
    ranking_basis: oneOf(e.ranking_basis, ['lexical_match_then_product_id']),
    topics: list(e.topics, x => oneOf(x, topics), 2), summary: text(e.summary),
    limitations: list(e.limitations, x => text(x), 30),
    provenance: provenance(e.provenance),
    products: list(e.products, item => {
      const p = record(item), product_id = identifier(p.product_id);
      let budget_offer = null;
      if (p.budget_offer !== null) {
        const b = record(p.budget_offer), price = money(b.price_toman);
        if (price === null || b.product_id !== product_id || b.inventory_status !== 'unconfirmed') throw new ContractError();
        budget_offer = { offer_id: identifier(b.offer_id), product_id, shop_id: identifier(b.shop_id), price_toman: price,
          last_price_changed_at: b.last_price_changed_at === null ? null : instant(b.last_price_changed_at),
          inventory_status: 'unconfirmed' as const,
          selection_basis: oneOf(b.selection_basis, ['lowest_recorded_qualifying_price_then_offer_id']) };
      }
      return { product_id, budget_offer, reasons: list(p.reasons, x => text(x), 30),
        suitability: oneOf(p.suitability, ['not_verified']),
        topics: list(p.topics, item => {
          const t = record(item);
          return { topic: oneOf(t.topic, topics), status: oneOf(t.status, ['recorded', 'missing', 'source_warning', 'conflicting', 'not_assessed']),
            summary: text(t.summary), evidence_count: integer(t.evidence_count),
            evidence: list(t.evidence, item => {
              const r = record(item);
              return { source_index: integer(r.source_index), section: nullableText(r.section), key: nullableText(r.key),
                value: nullableText(r.value), state: oneOf(r.state, ['recorded', 'negative', 'unknown']) };
            }, 4) };
        }, 2) };
    }, 12) };
}
export function parseTurn(value: unknown, requestId: string): AssistantTurn {
  const r = record(value);
  if (r.request_id !== requestId) throw new ContractError('پاسخ متعلق به درخواست فعلی نیست.');
  const status = oneOf(r.status, ['needs_input', 'results', 'no_evidence']);
  const query = nullableText(r.query, 120), category_name = nullableText(r.category_name), question = nullableText(r.question);
  const question_code = nullableText(r.question_code, 40), max_price_toman = money(r.max_price_toman);
  const products = r.products === null ? null : parseCataloguePage(r.products);
  const need_state = parseNeedState(r.need_state), battery_requirement = parseBattery(r.battery_requirement);
  const offer_sort = oneOf(r.offer_sort, sorts), explanation = parseExplanation(r.explanation);
  if ((status === 'needs_input' && (!question || !question_code || products !== null || explanation !== null)) ||
      (status !== 'needs_input' && (!query || question !== null || question_code !== null || products === null)) ||
      (status === 'results' && products?.items.length === 0) || (status === 'no_evidence' && products?.items.length !== 0) ||
      need_state.offer_sort !== offer_sort || JSON.stringify(need_state.battery_requirement) !== JSON.stringify(battery_requirement)) throw new ContractError();
  return { request_id: requestId, status, query, category_name, max_price_toman, question, question_code,
    products, need_state, offer_sort, battery_requirement, explanation };
}
export function parsePrepared(value: unknown): PreparedFollowup {
  const r = record(value), p = record(r.product), d = record(r.draft); provenance(r.provenance); instant(r.hours_evaluated_at);
  if (r.status !== 'prepared' || d.delivery_status !== 'draft_not_sent' || d.contact_channel_available !== false ||
      d.external_contact_attempted !== false) throw new ContractError();
  validateOffer(r.selected_offer);
  const page = parseOffers({ items: [r.selected_offer], has_more: false, limit: 1, offset: 0,
    hours_evaluated_at: r.hours_evaluated_at, provenance: r.provenance });
  const offer = page.items[0];
  if (!offer || offer.product_id !== p.product_id) throw new ContractError();
  return { status: 'prepared', product: { product_id: identifier(p.product_id), persian_title: nullableText(p.persian_title),
    brand_name: nullableText(p.brand_name), model: nullableText(p.model), category_name: nullableText(p.category_name) },
    selected_offer: offer, provenance: provenance(r.provenance), hours_evaluated_at: instant(r.hours_evaluated_at),
    draft: { delivery_status: 'draft_not_sent', text: text(d.text, 1200),
      contact_channel_available: false, external_contact_attempted: false }, limitations: list(r.limitations, x => text(x), 8) };
}
export function parseAlternatives(value: unknown): Alternatives {
  const r = record(value), o = record(r.outcome);
  if (o.verified_externally !== false || o.seller_confirmation !== false) throw new ContractError();
  const status = oneOf(r.status, ['alternatives_available', 'no_alternatives']);
  const product_id = identifier(r.product_id), reported_shop_id = identifier(r.reported_shop_id);
  const alternatives = parseOffers(r.alternatives);
  if (alternatives.items.some((item: Offer) => item.product_id !== product_id || item.shop_id === reported_shop_id) ||
      (status === 'no_alternatives' && (alternatives.items.length || alternatives.has_more))) throw new ContractError();
  return { status, product_id, reported_offer_id: identifier(r.reported_offer_id), reported_shop_id,
    excluded_offer_count: integer(r.excluded_offer_count), alternatives,
    outcome: { kind: oneOf(o.kind, ['no_answer', 'closed', 'out_of_stock']), source: oneOf(o.source, ['simulated', 'user_report']),
      received_at: instant(o.received_at), verified_externally: false, seller_confirmation: false },
    limitations: list(r.limitations, x => text(x), 8) };
}
