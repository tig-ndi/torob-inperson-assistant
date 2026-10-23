import type { Offer, Product, OfferPage as LegacyOfferPage, ProductPage } from '../../../api.ts';

export type { Offer, Product, ProductPage };
export type Provenance = { snapshot_id: string; dataset: string; generated_at_utc: string;
  currency: 'toman'; inventory_status: 'unconfirmed' };
export type OfferPage = LegacyOfferPage & { provenance: Provenance };
export type ReviewTopic = 'camera' | 'battery';
export type OfferSort = 'price' | 'nearest';
export type BatteryRequirement = {
  status: 'unspecified' | 'awaiting_minimum' | 'no_minimum' | 'minimum';
  minimum_mah: number | null;
};
export type NeedState = {
  version: 1;
  topic_query: string | null;
  category_name: string | null;
  category_cleared: boolean;
  max_price_toman: string | null;
  budget_needs_input: boolean;
  offer_sort: OfferSort;
  battery_requirement: BatteryRequirement;
  review_topics: ReviewTopic[];
  pending_requirements: { key: string; source_text: string; status: 'unsupported' }[];
};
export type Position = {
  lat: number;
  lon: number;
  source: 'gps' | 'manual';
  label: string;
  accuracyMeters: number | null;
};
export type Filters = {
  maxPrice: string | null;
  radiusKm: number | null;
  openNowOnly: boolean;
  creditOnly: boolean;
  sort: OfferSort;
};
export type NearestOffer = Pick<Offer, 'offer_id' | 'product_id' | 'shop_id' | 'price_toman' |
  'last_price_changed_at' | 'inventory_status'> & { direct_distance_meters: number };
export type CatalogueProduct = Product & { nearest_offer: NearestOffer | null };
export type CataloguePage = Omit<ProductPage, 'items'> & {
  items: CatalogueProduct[];
  limit: number;
  offset: number;
  provenance: Provenance;
};
export type CatalogueSearch = {
  query: string; offset?: number; limit?: number; maxPrice: string | null;
  categoryName?: string | null; categoryCleared?: boolean; minimumBattery?: number | null;
  sort?: 'relevance' | 'nearest'; position?: Position | null;
};
export type ProductResults = {
  source: 'manual' | 'assistant';
  page: CataloguePage;
  initialOffset: number;
  search: CatalogueSearch;
  explanation: Explanation | null;
};
export type Explanation = {
  query: string;
  category_name: string | null;
  max_price_toman: string | null;
  ranking_basis: 'lexical_match_then_product_id';
  topics: ReviewTopic[];
  summary: string;
  limitations: string[];
  products: {
    product_id: string;
    reasons: string[];
    suitability: 'not_verified';
    budget_offer: (Pick<NearestOffer, 'offer_id' | 'product_id' | 'shop_id' | 'last_price_changed_at' |
      'inventory_status'> & { price_toman: string; selection_basis: 'lowest_recorded_qualifying_price_then_offer_id' }) | null;
    topics: {
      topic: ReviewTopic;
      status: 'recorded' | 'missing' | 'source_warning' | 'conflicting' | 'not_assessed';
      summary: string;
      evidence_count: number;
      evidence: { source_index: number; section: string | null; key: string | null; value: string | null;
        state: 'recorded' | 'negative' | 'unknown' }[];
    }[];
  }[];
  provenance: Provenance;
};
export type AssistantTurn = {
  request_id: string;
  status: 'needs_input' | 'results' | 'no_evidence';
  query: string | null;
  category_name: string | null;
  max_price_toman: string | null;
  question: string | null;
  question_code: string | null;
  products: CataloguePage | null;
  need_state: NeedState;
  offer_sort: OfferSort;
  battery_requirement: BatteryRequirement;
  explanation: Explanation | null;
};
export type Selection = { product_id: string; offer_id: string; shop_id: string };
export type PreparedFollowup = {
  status: 'prepared';
  product: Pick<Product, 'product_id' | 'persian_title' | 'brand_name' | 'model' | 'category_name'>;
  selected_offer: Offer;
  draft: { delivery_status: 'draft_not_sent'; text: string;
    contact_channel_available: false; external_contact_attempted: false };
  limitations: string[];
  provenance: Provenance;
  hours_evaluated_at: string;
};
export type FollowupOutcome = 'no_answer' | 'closed' | 'out_of_stock';
export type Alternatives = {
  status: 'alternatives_available' | 'no_alternatives';
  product_id: string;
  reported_offer_id: string;
  reported_shop_id: string;
  excluded_offer_count: number;
  outcome: { kind: FollowupOutcome; source: 'simulated' | 'user_report'; received_at: string;
    verified_externally: false; seller_confirmation: false };
  alternatives: OfferPage;
  limitations: string[];
};
export type Screen = 'home' | 'decide' | 'results' | 'stores' | 'compare' | 'contact' | 'trip';
export type RequestState<T> =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: T | null; error: string };
