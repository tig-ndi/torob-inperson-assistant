import type { Alternatives, AssistantTurn, CataloguePage, CatalogueProduct, CatalogueSearch, Filters, NeedState, Offer, OfferPage, Position, PreparedFollowup, ProductResults, Screen } from '../domain/contracts.ts';
import { ContractError, money, pairedCoordinates } from '../domain/validation.ts';

export type WorkspaceState = {
  revision: number;
  screen: Screen;
  navigation: Screen[];
  query: string;
  filters: Filters;
  position: Position | null;
  locationStatus: 'ask' | 'gps' | 'manual' | 'denied';
  needState: NeedState | null;
  lastTurn: AssistantTurn | null;
  productResults: ProductResults | null;
  productResultsRequest: string | null;
  history: { role: 'user' | 'assistant'; content: string }[];
  product: CatalogueProduct | null;
  compareProducts: CatalogueProduct[];
  selectedOffer: Offer | null;
  selectionNeedsReview: boolean;
  compareOffers: Offer[];
  loadedOffers: { key: string; page: OfferPage } | null;
  focusedShopId: string | null;
  cameraIntent: { revision: number; kind: 'all' | 'user' | 'selection' } | null;
  visitPlan: { primary: Offer; alternative: Offer | null } | null;
  followups: Record<string, { prepared: PreparedFollowup | null; alternatives: Alternatives | null }>;
  theme: 'system' | 'light' | 'dark';
  notice: string | null;
};
export function initialWorkspace(): WorkspaceState {
  return { revision: 0, screen: 'home', navigation: [], query: '',
    filters: { maxPrice: null, radiusKm: null, openNowOnly: false, creditOnly: false, sort: 'price' },
    position: null, locationStatus: 'ask', needState: null, lastTurn: null, productResults: null, productResultsRequest: null, history: [],
    product: null, compareProducts: [], selectedOffer: null, selectionNeedsReview: false,
    compareOffers: [], loadedOffers: null, focusedShopId: null, cameraIntent: null,
    visitPlan: null, followups: {}, theme: 'system', notice: null };
}
export type WorkspaceAction =
  | { type: 'navigate'; screen: Screen }
  | { type: 'back' }
  | { type: 'query'; value: string }
  | { type: 'filters'; value: Partial<Filters> }
  | { type: 'position'; value: Position }
  | { type: 'locationDenied' }
  | { type: 'beginProductResults'; token: string }
  | { type: 'assistant'; result: AssistantTurn; userMessage: string; expectedRevision: number; expectedResultsRequest?: string }
  | { type: 'catalogue'; page: CataloguePage; search: CatalogueSearch; expectedRevision: number; expectedResultsRequest?: string }
  | { type: 'moreProducts'; base: ProductResults; page: CataloguePage; expectedRevision: number; expectedResultsRequest: string }
  | { type: 'newConversation' }
  | { type: 'product'; value: CatalogueProduct }
  | { type: 'compareProduct'; value: CatalogueProduct }
  | { type: 'selectOffer'; value: Offer }
  | { type: 'compareOffer'; value: Offer }
  | { type: 'offersLoaded'; key: string; page: OfferPage }
  | { type: 'focusShop'; shopId: string }
  | { type: 'mapCamera'; kind: 'all' | 'user' | 'selection' }
  | { type: 'plan'; primary: Offer; alternative?: Offer | null }
  | { type: 'prepared'; result: PreparedFollowup; expectedRevision: number }
  | { type: 'alternatives'; result: Alternatives; expectedRevision: number }
  | { type: 'theme'; value: WorkspaceState['theme'] }
  | { type: 'notice'; value: string | null };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'navigate':
      return action.screen === state.screen ? state : { ...state, screen: action.screen, navigation: [...state.navigation.slice(-19), state.screen] };
    case 'back':
      return { ...state, screen: state.navigation.at(-1) ?? 'home', navigation: state.navigation.slice(0, -1) };
    case 'query': return action.value === state.query ? state : { ...state, query: action.value, revision: state.revision + 1 };
    case 'filters': {
      const filters = { ...state.filters, ...action.value };
      money(filters.maxPrice);
      if (filters.radiusKm !== null && (!Number.isFinite(filters.radiusKm) || filters.radiusKm <= 0 || filters.radiusKm > 1000)) {
        return { ...state, notice: 'شعاع معتبر وارد کنید.' };
      }
      if (!state.position && (filters.radiusKm !== null || filters.sort === 'nearest')) return { ...state, notice: 'ابتدا موقعیت را مشخص کنید.' };
      return { ...state, filters, revision: state.revision + 1, selectionNeedsReview: state.selectedOffer !== null };
    }
    case 'position': {
      pairedCoordinates(action.value.lat, action.value.lon);
      return { ...state, position: action.value, locationStatus: action.value.source, revision: state.revision + 1,
        selectionNeedsReview: state.selectedOffer !== null };
    }
    case 'locationDenied': return { ...state, locationStatus: 'denied', notice: 'موقعیت دریافت نشد؛ انتخاب دستی همچنان در دسترس است.' };
    case 'beginProductResults': return { ...state, productResultsRequest: action.token };
    case 'catalogue':
      if (action.expectedRevision !== state.revision ||
        (action.expectedResultsRequest !== undefined && action.expectedResultsRequest !== state.productResultsRequest)) return state;
      return { ...state, productResults: { source: 'manual', page: action.page, initialOffset: action.page.offset, search: action.search, explanation: null } };
    case 'moreProducts':
      if (action.expectedRevision !== state.revision || action.expectedResultsRequest !== state.productResultsRequest || state.productResults !== action.base) return state;
      return { ...state, productResults: appendProductPage(action.base, action.page) };
    case 'assistant': {
      if (action.expectedRevision !== state.revision ||
        (action.expectedResultsRequest !== undefined && action.expectedResultsRequest !== state.productResultsRequest)) return state;
      const result = action.result;
      const answer = result.question ?? result.explanation?.summary ?? `نتایج ثبت‌شده برای «${result.query ?? ''}»`;
      return { ...state, needState: result.need_state, lastTurn: result, revision: state.revision + 1,
        productResults: result.products ? { source: 'assistant', page: result.products, initialOffset: result.products.offset, explanation: result.explanation,
          search: { query: result.query ?? result.need_state.topic_query ?? '', maxPrice: result.max_price_toman,
            categoryName: result.products.category_name, categoryCleared: result.need_state.category_cleared,
            minimumBattery: result.need_state.battery_requirement.status === 'minimum' ? result.need_state.battery_requirement.minimum_mah : null,
            sort: result.offer_sort === 'nearest' ? 'nearest' : 'relevance', position: state.position } } : null,
        query: result.need_state.topic_query ?? state.query,
        filters: { ...state.filters, maxPrice: result.max_price_toman, sort: result.offer_sort },
        history: [...state.history, { role: 'user' as const, content: action.userMessage },
          { role: 'assistant' as const, content: answer }].slice(-10),
        selectionNeedsReview: state.selectedOffer !== null };
    }
    case 'newConversation':
      return { ...state, needState: null, lastTurn: null, productResults: null, productResultsRequest: null, history: [], query: '', revision: state.revision + 1,
        notice: 'گفت‌وگوی تازه؛ بودجه و موقعیت فعلی حفظ شدند.' };
    case 'product': {
      if (state.product?.product_id === action.value.product_id) return { ...state, product: action.value };
      return { ...state, product: action.value, selectedOffer: null, compareOffers: [], loadedOffers: null,
        focusedShopId: null, visitPlan: null, followups: {},
        revision: state.revision + 1, selectionNeedsReview: false };
    }
    case 'compareProduct': {
      const existing = state.compareProducts.some(p => p.product_id === action.value.product_id);
      if (!existing && state.compareProducts.length === 3) return { ...state, notice: 'حداکثر ۳ محصول را می‌توانید هم‌زمان مقایسه کنید.' };
      return { ...state, compareProducts: existing ? state.compareProducts.filter(p => p.product_id !== action.value.product_id)
        : [...state.compareProducts, action.value] };
    }
    case 'selectOffer':
      if (action.value.product_id !== state.product?.product_id) return { ...state, notice: 'آفر به محصول فعلی تعلق ندارد.' };
      return { ...state, selectedOffer: action.value, selectionNeedsReview: false };
    case 'offersLoaded':
      if (action.key !== offerQueryKey(state.product?.product_id ?? null, state.filters, state.position)) return state;
      return { ...state, loadedOffers: { key: action.key, page: action.page } };
    case 'focusShop': return { ...state, focusedShopId: action.shopId };
    case 'mapCamera': return { ...state, cameraIntent: { revision: (state.cameraIntent?.revision ?? 0) + 1, kind: action.kind } };
    case 'compareOffer': {
      if (action.value.product_id !== state.product?.product_id) return { ...state, notice: 'برای مقایسه، آفرهای همان محصول را انتخاب کنید.' };
      const existing = state.compareOffers.some(o => o.offer_id === action.value.offer_id);
      if (!existing && state.compareOffers.length === 3) return { ...state, notice: 'حداکثر ۳ آفر را می‌توانید مقایسه کنید.' };
      return { ...state, compareOffers: existing ? state.compareOffers.filter(o => o.offer_id !== action.value.offer_id)
        : [...state.compareOffers, action.value] };
    }
    case 'plan':
      if (action.primary.product_id !== state.product?.product_id ||
          (action.alternative && (action.alternative.product_id !== action.primary.product_id || action.alternative.shop_id === action.primary.shop_id))) {
        return { ...state, notice: 'مقصد و جایگزین باید برای همان کالا و فروشگاه‌های متفاوت باشند.' };
      }
      return { ...state, visitPlan: { primary: action.primary, alternative: action.alternative ?? null } };
    case 'prepared': {
      if (action.expectedRevision !== state.revision || action.result.product.product_id !== state.product?.product_id) return state;
      const key = action.result.selected_offer.offer_id;
      return { ...state, followups: { ...state.followups, [key]: { prepared: action.result, alternatives: state.followups[key]?.alternatives ?? null } } };
    }
    case 'alternatives': {
      if (action.expectedRevision !== state.revision || action.result.product_id !== state.product?.product_id) return state;
      const key = action.result.reported_offer_id;
      return { ...state, followups: { ...state.followups, [key]: { prepared: state.followups[key]?.prepared ?? null, alternatives: action.result } } };
    }
    case 'theme': return { ...state, theme: action.value };
    case 'notice': return { ...state, notice: action.value };
  }
}

/** Context for a new direct search; unrelated conversation constraints are not silently inherited. */
export function catalogueSearchForWorkspace(state: WorkspaceState): CatalogueSearch {
  const context = state.needState?.topic_query === state.query ? state.needState : null;
  return { query: state.query, maxPrice: state.filters.maxPrice,
    categoryName: context?.category_name, categoryCleared: context?.category_cleared,
    minimumBattery: context?.battery_requirement.status === 'minimum' ? context.battery_requirement.minimum_mah : null,
    sort: state.filters.sort === 'nearest' ? 'nearest' : 'relevance', position: state.position };
}

// Memory-only comparison. Never log or persist the key: it includes user coordinates.
export function catalogueSearchKey(search: CatalogueSearch): string {
  return JSON.stringify([search.query.trim(), search.maxPrice, search.categoryCleared ? null : search.categoryName ?? null,
    search.categoryCleared ?? false, search.minimumBattery ?? null, search.sort ?? 'relevance',
    search.position?.lat ?? null, search.position?.lon ?? null]);
}

/** Merge only the next page of the same snapshot/constraints; keep the original explanation scoped to its IDs. */
export function appendProductPage(base: ProductResults, page: CataloguePage): ProductResults {
  const previous = base.page;
  if (!previous.has_more || page.offset !== previous.offset + previous.limit || page.limit !== previous.limit ||
    (page.has_more && page.items.length === 0)) throw new ContractError('صفحهٔ برگشتی با ادامهٔ این نتایج سازگار نیست؛ دوباره جست‌وجو کنید.');
  if (page.provenance.snapshot_id !== previous.provenance.snapshot_id ||
    page.provenance.dataset !== previous.provenance.dataset || page.provenance.generated_at_utc !== previous.provenance.generated_at_utc) {
    throw new ContractError('نسخهٔ کاتالوگ تغییر کرده است؛ برای دریافت نتایج یکسان از نو جست‌وجو کنید.');
  }
  if (page.category_name !== previous.category_name || page.min_battery_capacity_mah !== previous.min_battery_capacity_mah) {
    throw new ContractError('شرایط صفحهٔ جدید با نتایج قبلی یکسان نیست؛ از نو جست‌وجو کنید.');
  }
  const products = new Map(previous.items.map(product => [product.product_id, product]));
  for (const product of page.items) products.set(product.product_id, product);
  return { ...base, page: { ...page, items: [...products.values()] } };
}

// In-memory key only. Never log, persist or put it in a URL: it contains location.
export function offerQueryKey(productId: string | null, filters: Filters, position: Position | null): string {
  return JSON.stringify([productId, filters.maxPrice, filters.radiusKm, filters.openNowOnly, filters.creditOnly,
    filters.sort, position?.lat ?? null, position?.lon ?? null]);
}
export function mergeOffers(previous: readonly Offer[], next: readonly Offer[]): Offer[] {
  const offers = new Map(previous.map(o => [o.offer_id, o]));
  for (const offer of next) offers.set(offer.offer_id, offer);
  return [...offers.values()];
}
