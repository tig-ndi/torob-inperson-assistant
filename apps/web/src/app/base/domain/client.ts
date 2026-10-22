import { parseProductDetail } from '../../../api.ts';
import type { AssistantMessage } from '../../../api.ts';
import type { Alternatives, AssistantTurn, CataloguePage, Filters, NeedState, Position, PreparedFollowup,
  Selection, FollowupOutcome, BatteryRequirement, OfferSort, ReviewTopic, CatalogueSearch } from './contracts.ts';
import { parseAlternatives, parseBattery, parseCataloguePage, parseNeedState, parseOffers, parsePrepared, parseTurn } from './parsers.ts';
import { bool, ContractError, identifier, integer, money, oneOf, pairedCoordinates, record } from './validation.ts';

const errorMessages: Record<number, string> = {
  404: 'این کالا یا آفر در کاتالوگ پیدا نشد؛ انتخاب را دوباره بررسی کنید.',
  409: 'کالا، آفر و فروشگاه با هم منطبق نیستند؛ دوباره انتخاب کنید.',
  422: 'ورودی یا شرایط جست‌وجو معتبر نیست؛ فیلترها را بررسی کنید.',
  429: 'سقف درخواست دستیار رسیده است؛ جست‌وجوی مستقیم همچنان در دسترس است.',
  503: 'سرویس فعلاً در دسترس نیست؛ دوباره تلاش کنید.',
  504: 'پاسخ سرویس طول کشید؛ ارسال دوباره فقط با انتخاب شما انجام می‌شود.',
};
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code = 'request_failed') {
    super(errorMessages[status] ?? (status === 0 ? 'ارتباط برقرار نشد؛ اتصال را بررسی کنید.' : 'درخواست انجام نشد؛ دوباره تلاش کنید.'));
    this.name = 'ApiError'; this.status = status; this.code = code;
  }
}
async function request<T>(path: string, parse: (value: unknown) => T, signal: AbortSignal,
  body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal, cache: 'no-store', credentials: 'same-origin',
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  } catch (error: unknown) {
    if (signal.aborted) throw error;
    throw new ApiError(0);
  }
  if (!response.ok) {
    let code = 'request_failed';
    try { const value = record(await response.json());
      if (typeof value.code === 'string' && /^[a-z_]{1,60}$/.test(value.code)) code = value.code;
    } catch { /* Error bodies are not source evidence; retain the HTTP failure. */ }
    throw new ApiError(response.status, code);
  }
  let value: unknown;
  try { value = await response.json(); } catch { throw new ContractError(); }
  return parse(value);
}
function locationParams(position: Position | null): Record<string, number> {
  if (!position) return {};
  const p = pairedCoordinates(position.lat, position.lon);
  return p ? { user_lat: p.lat, user_lon: p.lon } : {};
}
function filterParams(filters: Filters, position: Position | null): Record<string, string | number | boolean | null> {
  money(filters.maxPrice);
  if (filters.radiusKm !== null && (!Number.isFinite(filters.radiusKm) || filters.radiusKm <= 0 || filters.radiusKm > 1000)) throw new ContractError('شعاع معتبر لازم است.');
  if ((filters.sort === 'nearest' || filters.radiusKm !== null) && !position) throw new ContractError('ابتدا موقعیت جست‌وجو را مشخص کنید.');
  oneOf(filters.sort, ['price', 'nearest']);
  return { max_price_toman: filters.maxPrice, max_distance_km: filters.radiusKm,
    open_now_only: bool(filters.openNowOnly), in_person_credit_only: bool(filters.creditOnly),
    sort_by: filters.sort, ...locationParams(position) };
}
function queryString(values: Record<string, string | number | boolean | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined) query.set(key, String(value));
  return query.toString();
}
export type SearchInput = CatalogueSearch;
export function searchCatalogue(input: SearchInput, signal: AbortSignal): Promise<CataloguePage> {
  if (!input.query.trim() || input.query.length > 120) throw new ContractError('عبارت کالا باید بین ۱ تا ۱۲۰ نویسه باشد.');
  money(input.maxPrice);
  if (input.sort === 'nearest' && !input.position) throw new ContractError('ابتدا موقعیت جست‌وجو را مشخص کنید.');
  const params = queryString({ q: input.query, offset: integer(input.offset ?? 0, 0, 1000000), limit: integer(input.limit ?? 12, 1, 50),
    max_price_toman: input.maxPrice, category_cleared: input.categoryCleared,
    category_name: input.categoryCleared ? null : input.categoryName,
    min_battery_capacity_mah: input.minimumBattery == null ? null : integer(input.minimumBattery, 0, 1000000),
    sort_by: input.sort ?? 'relevance', ...locationParams(input.position ?? null) });
  return request(`/api/products?${params}`, parseCataloguePage, signal);
}
export function loadProduct(productId: string, signal: AbortSignal) {
  return request(`/api/products/${encodeURIComponent(identifier(productId))}`, parseProductDetail, signal);
}
export function loadOffers(productId: string, filters: Filters, position: Position | null, signal: AbortSignal,
  offset = 0, limit = 20) {
  const params = queryString({ ...filterParams(filters, position), offset: integer(offset, 0, 1000000), limit: integer(limit, 1, 50) });
  return request(`/api/products/${encodeURIComponent(identifier(productId))}/offers?${params}`, value => {
    const result = parseOffers(value);
    if (result.items.some(item => item.product_id !== productId)) throw new ContractError();
    return result;
  }, signal);
}
export type AssistantInput = {
  messages: AssistantMessage[];
  needState: NeedState | null;
  position: Position | null;
  // Omission keeps state budget; explicit null clears it. Never supply a default null.
  budgetOverride?: string | null;
  offerSortOverride?: OfferSort;
  batteryOverride?: BatteryRequirement;
  reviewTopicsOverride?: ReviewTopic[];
};
export function assistantBody(input: AssistantInput, requestId: string): Record<string, unknown> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(requestId)) throw new ContractError();
  const messages = input.messages;
  if (!messages.length || messages.length > 5 || messages.length % 2 === 0 ||
      messages.some((m, i) => m.role !== (i % 2 ? 'assistant' : 'user') || !m.content.trim() || m.content.length > 1000) ||
      messages.reduce((sum, m) => sum + m.content.length, 0) > 3000) throw new ContractError('پیام‌ها باید کوتاه و به ترتیب گفت‌وگو باشند.');
  if (input.reviewTopicsOverride && (input.reviewTopicsOverride.length > 2 || input.reviewTopicsOverride.some(t => !['camera', 'battery'].includes(t)))) throw new ContractError();
  return { request_id: requestId, messages, ...(input.needState ? { context_need_state: parseNeedState(input.needState) } : {}),
    ...(Object.hasOwn(input, 'budgetOverride') ? { max_price_toman: money(input.budgetOverride) } : {}),
    ...(input.offerSortOverride === undefined ? {} : { context_offer_sort: oneOf(input.offerSortOverride, ['price', 'nearest']) }),
    ...(input.batteryOverride === undefined ? {} : { context_battery_requirement: parseBattery(input.batteryOverride) }),
    ...(input.reviewTopicsOverride === undefined ? {} : { context_topics: input.reviewTopicsOverride }),
    ...locationParams(input.position) };
}
export function sendAssistant(input: AssistantInput, signal: AbortSignal): Promise<AssistantTurn> {
  const requestId = crypto.randomUUID();
  return request('/api/assistant/turn', value => parseTurn(value, requestId), signal, assistantBody(input, requestId));
}
export function assistantStatus(signal: AbortSignal) {
  return request('/api/assistant/status', value => {
    const s = record(value);
    return { ready: bool(s.ready), reason: oneOf(s.reason, ['ready', 'disabled', 'missing_key', 'invalid_config', 'attempt_limit']),
      remainingCalls: integer(s.remaining_calls) };
  }, signal);
}
function selectionBody(selection: Selection, position: Position | null) {
  return { product_id: identifier(selection.product_id), offer_id: identifier(selection.offer_id),
    shop_id: identifier(selection.shop_id), ...locationParams(position) };
}
export function prepareFollowup(selection: Selection, position: Position | null, signal: AbortSignal): Promise<PreparedFollowup> {
  return request('/api/followups/prepare', value => {
    const result = parsePrepared(value), offer = result.selected_offer;
    if (offer.product_id !== selection.product_id || offer.offer_id !== selection.offer_id || offer.shop_id !== selection.shop_id) throw new ContractError();
    return result;
  }, signal, selectionBody(selection, position));
}
export function findAlternatives(selection: Selection, outcome: FollowupOutcome, filters: Filters, position: Position | null,
  signal: AbortSignal, offset = 0, source: 'simulated' | 'user_report' = 'simulated'): Promise<Alternatives> {
  return request('/api/followups/alternatives', value => {
    const result = parseAlternatives(value);
    if (result.product_id !== selection.product_id || result.reported_offer_id !== selection.offer_id ||
        result.reported_shop_id !== selection.shop_id) throw new ContractError();
    return result;
  }, signal, { ...selectionBody(selection, position), ...filterParams(filters, position),
    outcome: oneOf(outcome, ['no_answer', 'closed', 'out_of_stock']), outcome_source: oneOf(source, ['simulated', 'user_report']),
    offset: integer(offset, 0, 1000000), limit: 20 });
}
