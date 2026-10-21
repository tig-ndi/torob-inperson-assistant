export type Spec = {
  key: string | null;
  section: string | null;
  value: string | null;
};

export type Product = {
  product_id: string;
  persian_title: string | null;
  category_name: string | null;
  brand_name: string | null;
  model: string | null;
  image_urls: string[];
  specs: Spec[];
  offer_summary: {
    offer_count: number;
    min_price_toman: string | null;
    max_price_toman: string | null;
    missing_price_count: number;
  };
};

export type Shop = {
  name: string | null;
  address: string | null;
  location_label: string | null;
  lat: number | null;
  lon: number | null;
};

export const HOURS_REASON_TEXT = {
  within_declared_shift: 'داخل بازهٔ اعلام‌شده',
  outside_declared_shifts: 'خارج از بازه‌های اعلام‌شده',
  declared_closed_day: 'برای امروز شیفتی اعلام نشده و روز بسته ثبت شده است',
  missing_schedule: 'ساعت کاری امروز ثبت نشده است',
  unsupported_schedule: 'برنامهٔ ثبت‌شده قابل تفسیر نیست',
  invalid_schedule: 'اطلاعات ساعات ثبت‌شده ناسازگار یا نامعتبر است',
  no_valid_shifts: 'بازهٔ معتبر برای امروز ثبت نشده است',
  previous_day_unknown: 'ساعت روز قبل نامشخص است؛ ادامهٔ شیفت قابل تعیین نیست',
} as const;

export type OpeningShift = { start_time: string; end_time: string; ends_next_day: boolean };
export type OpeningHours = {
  status: 'declared_open' | 'declared_closed' | 'unknown';
  reason: keyof typeof HOURS_REASON_TEXT;
  local_day: string;
  today_shifts: OpeningShift[];
  previous_day_overnight_shifts: OpeningShift[];
};

export const CREDIT_STATUS_TEXT = {
  matches_declared_terms: 'منطبق با شرایط ثبت‌شدهٔ خرید اعتباری حضوری',
  does_not_match: 'شرایط ثبت‌شده با این آفر تطابق ندارند',
  unknown: 'وضعیت خرید اعتباری حضوری نامشخص',
} as const;
export const CREDIT_REASON_TEXT = {
  matched: 'با قیود ثبت‌شده تطابق دارد',
  channel_unknown: 'حضوری بودن این روش در منبع مشخص نشده است',
  unsupported_channel: 'کانال ثبت‌شده برای خرید حضوری قابل ارزیابی نیست',
  price_unknown: 'قیمت آفر نامشخص است؛ تطابق مبلغ قابل بررسی نیست',
  product_category_unknown: 'دستهٔ محصول برای بررسی این شرط نامشخص است',
  category_mismatch: 'دستهٔ محصول با دسته‌های اعلام‌شده تطابق ندارد',
  below_minimum: 'قیمت آفر کمتر از کف مبلغ ثبت‌شده است',
  above_maximum: 'قیمت آفر بیشتر از سقف مبلغ ثبت‌شده است',
  invalid_conditions: 'اطلاعات این روش ناقص یا ناسازگار است',
} as const;
export type CreditOption = {
  option_index: number;
  provider_name: string | null;
  channel: string | null;
  min_price_toman: string | null;
  max_price_toman: string | null;
  category_names: string[] | null;
  status: keyof typeof CREDIT_STATUS_TEXT;
  reason: keyof typeof CREDIT_REASON_TEXT;
};
export type InPersonCredit = {
  status: keyof typeof CREDIT_STATUS_TEXT;
  reason: 'matching_option' | 'all_recorded_options_mismatch' | 'incomplete_conditions' | 'not_recorded' | 'invalid_data';
  options: CreditOption[];
};

export type Offer = {
  offer_id: string;
  product_id: string;
  shop_id: string;
  price_toman: string | null;
  price_quality: 'missing' | 'above_js_safe_integer' | 'not_assessed';
  last_price_changed_at: string | null;
  seller_title: string | null;
  description: string | null;
  warranty: unknown;
  inventory_status: 'unconfirmed';
  direct_distance_meters: number | null;
  opening_hours: OpeningHours;
  in_person_credit: InPersonCredit;
  shop: Shop;
};

export type ProductPage = {
  items: Product[];
  has_more: boolean;
};

export type OfferPage = {
  items: Offer[];
  has_more: boolean;
  limit: number;
  offset: number;
  hours_evaluated_at: string;
};

export type ProductDetail = {
  product: Product;
};

export type SpecKey = {
  section: string;
  key: string;
  displaySection: string;
  displayKey: string;
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('پاسخ کاتالوگ قابل خواندن نیست. دوباره تلاش کنید.');
  }
  return value as Record<string, unknown>;
}

function nullableText(value: unknown): string | null {
  if (value === undefined || value === null || typeof value === 'string') return value ?? null;
  throw new Error('ساختار اطلاعات محصول معتبر نیست.');
}

function money(value: unknown): string | null {
  const text = nullableText(value);
  if (text !== null && !/^[0-9]+$/.test(text)) throw new Error('قیمت ثبت‌شده قابل خواندن نیست.');
  return text;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('ساختار تعداد آفرها معتبر نیست.');
  }
  return value;
}

export function parseProduct(item: unknown): Product {
  const product = record(item);
  const summary = record(product.offer_summary);
  if (typeof product.product_id !== 'string' || !product.product_id) {
    throw new Error('شناسهٔ محصول در پاسخ کاتالوگ معتبر نیست.');
  }
  const rawSpecs = Array.isArray(product.specs) ? product.specs : [];
  const specs: Spec[] = rawSpecs.map((s: unknown): Spec => {
    const specRecord = record(s);
    return {
      key: nullableText(specRecord.key),
      section: nullableText(specRecord.section),
      value: nullableText(specRecord.value),
    };
  });
  const rawImages = Array.isArray(product.image_urls) ? product.image_urls : [];
  const image_urls: string[] = rawImages.filter((img): img is string => typeof img === 'string');

  return {
    product_id: product.product_id,
    persian_title: nullableText(product.persian_title),
    category_name: nullableText(product.category_name),
    brand_name: nullableText(product.brand_name),
    model: nullableText(product.model),
    image_urls,
    specs,
    offer_summary: {
      offer_count: count(summary.offer_count),
      missing_price_count: count(summary.missing_price_count),
      min_price_toman: money(summary.min_price_toman),
      max_price_toman: money(summary.max_price_toman),
    },
  };
}

export function parsePage(value: unknown): ProductPage {
  const page = record(value);
  const source = record(page.provenance);
  if (source.currency !== 'toman' || source.inventory_status !== 'unconfirmed' ||
      !Array.isArray(page.items) || typeof page.has_more !== 'boolean') {
    throw new Error('قرارداد پاسخ کاتالوگ معتبر نیست.');
  }
  const items = page.items.map(parseProduct);
  return { items, has_more: page.has_more };
}

export function parseProductDetail(value: unknown): ProductDetail {
  const detail = record(value);
  const source = record(detail.provenance);
  if (source.currency !== 'toman' || source.inventory_status !== 'unconfirmed') {
    throw new Error('قرارداد پاسخ کاتالوگ معتبر نیست.');
  }
  return { product: parseProduct(detail.product) };
}

function parseShifts(value: unknown): OpeningShift[] {
  if (!Array.isArray(value)) throw new Error('بازه‌های ساعت کاتالوگ معتبر نیستند.');
  return value.map((item: unknown) => {
    const shift = record(item);
    const clock = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if (typeof shift.start_time !== 'string' || !clock.test(shift.start_time) ||
        typeof shift.end_time !== 'string' || !clock.test(shift.end_time) ||
        typeof shift.ends_next_day !== 'boolean') throw new Error('بازهٔ ساعت کاتالوگ معتبر نیست.');
    return { start_time: shift.start_time, end_time: shift.end_time, ends_next_day: shift.ends_next_day };
  });
}

function parseOpeningHours(value: unknown): OpeningHours {
  const hours = record(value);
  const status = hours.status;
  const reason = hours.reason;
  if ((status !== 'declared_open' && status !== 'declared_closed' && status !== 'unknown') ||
      typeof reason !== 'string' || !Object.hasOwn(HOURS_REASON_TEXT, reason) ||
      typeof hours.local_day !== 'string' || !['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(hours.local_day)) {
    throw new Error('وضعیت ساعات کاتالوگ معتبر نیست.');
  }
  return { status, reason: reason as keyof typeof HOURS_REASON_TEXT, local_day: hours.local_day,
    today_shifts: parseShifts(hours.today_shifts),
    previous_day_overnight_shifts: parseShifts(hours.previous_day_overnight_shifts) };
}

function parseCredit(value: unknown): InPersonCredit {
  const credit = record(value);
  function status(value: unknown): keyof typeof CREDIT_STATUS_TEXT {
    if (typeof value !== 'string' || !Object.hasOwn(CREDIT_STATUS_TEXT, value)) throw new Error('وضعیت شرایط اعتباری معتبر نیست.');
    return value as keyof typeof CREDIT_STATUS_TEXT;
  }
  const reason = credit.reason;
  if (reason !== 'matching_option' && reason !== 'all_recorded_options_mismatch' &&
      reason !== 'incomplete_conditions' && reason !== 'not_recorded' && reason !== 'invalid_data') {
    throw new Error('علت وضعیت اعتباری معتبر نیست.');
  }
  if (!Array.isArray(credit.options)) throw new Error('فهرست شرایط اعتباری معتبر نیست.');
  const options = credit.options.map((value: unknown, index: number): CreditOption => {
    const o = record(value);
    if (count(o.option_index) !== index || typeof o.reason !== 'string' || !Object.hasOwn(CREDIT_REASON_TEXT, o.reason) ||
        !Object.hasOwn(o, 'min_price_toman') || !Object.hasOwn(o, 'max_price_toman') ||
        (o.category_names !== null && (!Array.isArray(o.category_names) || o.category_names.some((c: unknown) => typeof c !== 'string')))) {
      throw new Error('شرایط روش اعتباری معتبر نیست.');
    }
    return { option_index: index, provider_name: nullableText(o.provider_name), channel: nullableText(o.channel),
      min_price_toman: money(o.min_price_toman), max_price_toman: money(o.max_price_toman),
      category_names: o.category_names as string[] | null, status: status(o.status),
      reason: o.reason as keyof typeof CREDIT_REASON_TEXT };
  });
  return { status: status(credit.status), reason, options };
}

export function parseOfferPage(value: unknown): OfferPage {
  const page = record(value);
  const source = record(page.provenance);
  if (source.currency !== 'toman' || source.inventory_status !== 'unconfirmed' ||
      !Array.isArray(page.items) || typeof page.has_more !== 'boolean') {
    throw new Error('قرارداد پاسخ کاتالوگ معتبر نیست.');
  }
  if (typeof page.hours_evaluated_at !== 'string' || !/T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(page.hours_evaluated_at) ||
      !Number.isFinite(Date.parse(page.hours_evaluated_at))) {
    throw new Error('زمان بررسی ساعات کاتالوگ معتبر نیست.');
  }
  const items = page.items.map((item: unknown): Offer => {
    const o = record(item);
    const s = record(o.shop);
    if (typeof o.offer_id !== 'string' || !o.offer_id ||
        typeof o.product_id !== 'string' || !o.product_id ||
        typeof o.shop_id !== 'string' || !o.shop_id) {
      throw new Error('شناسهٔ آفر یا فروشگاه در پاسخ کاتالوگ معتبر نیست.');
    }
    const quality = o.price_quality;
    if (quality !== 'missing' && quality !== 'above_js_safe_integer' && quality !== 'not_assessed') {
      throw new Error('کیفیت قیمت در پاسخ کاتالوگ معتبر نیست.');
    }
    const lat = typeof s.lat === 'number' && Number.isFinite(s.lat) ? s.lat : null;
    const lon = typeof s.lon === 'number' && Number.isFinite(s.lon) ? s.lon : null;
    const direct_distance_meters =
      typeof o.direct_distance_meters === 'number' && Number.isFinite(o.direct_distance_meters)
        ? Math.round(o.direct_distance_meters)
        : null;

    return {
      offer_id: o.offer_id,
      product_id: o.product_id,
      shop_id: o.shop_id,
      price_toman: money(o.price_toman),
      price_quality: quality,
      last_price_changed_at: nullableText(o.last_price_changed_at),
      seller_title: nullableText(o.seller_title),
      description: nullableText(o.description),
      warranty: o.warranty ?? null,
      inventory_status: 'unconfirmed',
      direct_distance_meters,
      opening_hours: parseOpeningHours(o.opening_hours),
      in_person_credit: parseCredit(o.in_person_credit),
      shop: {
        name: nullableText(s.name),
        address: nullableText(s.address),
        location_label: nullableText(s.location_label),
        lat,
        lon,
      },
    };
  });
  return {
    items,
    has_more: page.has_more,
    limit: typeof page.limit === 'number' ? page.limit : 20,
    offset: typeof page.offset === 'number' ? page.offset : 0,
    hours_evaluated_at: page.hours_evaluated_at,
  };
}

export const PAGE_SIZE = 12;
export const OFFERS_PAGE_SIZE = 10;

export async function searchProducts(
  query: string,
  offset: number,
  maxPrice: string | null,
  signal: AbortSignal
): Promise<ProductPage> {
  const params = new URLSearchParams({ q: query, limit: String(PAGE_SIZE), offset: String(offset) });
  if (maxPrice) {
    params.set('max_price_toman', maxPrice);
  }
  let response: Response;
  try {
    response = await fetch(`/api/products?${params}`, { signal });
  } catch (error: unknown) {
    if (signal.aborted) throw error;
    throw new Error('ارتباط با کاتالوگ برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.');
  }
  if (!response.ok) {
    if (response.status === 422) throw new Error('جست‌وجو را با ۱ تا ۱۲ واژهٔ ساده وارد کنید.');
    throw new Error('کاتالوگ در دسترس نیست. کمی بعد دوباره تلاش کنید.');
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('پاسخ کاتالوگ قابل خواندن نیست. دوباره تلاش کنید.');
  }
  return parsePage(body);
}

export async function fetchProductDetail(productId: string, signal: AbortSignal): Promise<ProductDetail> {
  let response: Response;
  try {
    response = await fetch(`/api/products/${encodeURIComponent(productId)}`, { signal });
  } catch (error: unknown) {
    if (signal.aborted) throw error;
    throw new Error('ارتباط با کاتالوگ برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.');
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error('محصول مورد نظر در کاتالوگ یافت نشد.');
    throw new Error('کاتالوگ در دسترس نیست. کمی بعد دوباره تلاش کنید.');
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('پاسخ کاتالوگ قابل خواندن نیست. دوباره تلاش کنید.');
  }
  return parseProductDetail(body);
}

export async function fetchProductOffers(
  productId: string,
  offset: number,
  maxPrice: string | null,
  userLat: number | null,
  userLon: number | null,
  maxDistanceKm: number | null,
  openNowOnly: boolean,
  inPersonCreditOnly: boolean,
  signal: AbortSignal
): Promise<OfferPage> {
  const params = new URLSearchParams({
    limit: String(OFFERS_PAGE_SIZE),
    offset: String(offset),
  });
  if (maxPrice) {
    params.set('max_price_toman', maxPrice);
  }
  if (userLat !== null && userLon !== null) {
    params.set('user_lat', String(userLat));
    params.set('user_lon', String(userLon));
  }
  if (maxDistanceKm !== null) {
    params.set('max_distance_km', String(maxDistanceKm));
  }
  if (openNowOnly) params.set('open_now_only', 'true');
  if (inPersonCreditOnly) params.set('in_person_credit_only', 'true');
  let response: Response;
  try {
    response = await fetch(`/api/products/${encodeURIComponent(productId)}/offers?${params}`, { signal, cache: 'no-store' });
  } catch (error: unknown) {
    if (signal.aborted) throw error;
    throw new Error('ارتباط با کاتالوگ برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.');
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error('محصول مورد نظر در کاتالوگ یافت نشد.');
    if (response.status === 422) throw new Error('پارامترهای موقعیت یا شعاع فاصله نامعتبر است.');
    throw new Error('کاتالوگ در دسترس نیست. کمی بعد دوباره تلاش کنید.');
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('پاسخ کاتالوگ قابل خواندن نیست. دوباره تلاش کنید.');
  }
  return parseOfferPage(body);
}

export function parseCoordinate(input: string): number | null {
  const normalized = input
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .trim();
  if (!normalized) return null;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return num;
}

export function formatDistance(meters: number | null): string {
  if (meters === null || meters === undefined) return 'فاصله نامشخص';
  const faNum = new Intl.NumberFormat('fa-IR');
  if (meters < 1000) {
    return `${faNum.format(meters)} متر`;
  }
  const km = (meters / 1000).toFixed(1);
  return `${faNum.format(Number(km))} کیلومتر`;
}

export function normalizeBudget(input: string): string {
  return input
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[\s,،_٬]/g, '');
}

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون', 'کوادریلیون', 'کوینتیلیون'];

function chunkToWords(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const hWord = HUNDREDS[h];
  if (h > 0 && hWord) parts.push(hWord);
  if (rem >= 10 && rem < 20) {
    const teenWord = TEENS[rem - 10];
    if (teenWord) parts.push(teenWord);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    const tWord = TENS[t];
    const oWord = ONES[o];
    if (t > 0 && tWord) parts.push(tWord);
    if (o > 0 && oWord) parts.push(oWord);
  }
  return parts.join(' و ');
}

export function numberToPersianWords(input: string): string | null {
  if (!input) return null;
  const normalized = normalizeBudget(input);
  if (!normalized || !/^\d+$/.test(normalized)) return null;

  const digits = normalized.replace(/^0+/, '');
  if (!digits) return 'صفر تومان';

  const chunks: number[] = [];
  let s = digits;
  while (s.length > 0) {
    const end = s.length;
    const start = Math.max(0, end - 3);
    chunks.push(parseInt(s.slice(start, end), 10));
    s = s.slice(0, start);
  }

  if (chunks.length > SCALES.length) return null;

  const parts: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (chunk === undefined || chunk === 0) continue;
    let word = chunkToWords(chunk);
    const scale = SCALES[i];
    if (scale) {
      word += ' ' + scale;
    }
    parts.push(word);
  }
  if (parts.length === 0) return 'صفر تومان';
  return parts.join(' و ') + ' تومان';
}

export function formatBudgetInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const isSeparatorsOrDigits = /^[\d۰-۹٠-٩\s,،_٬]+$/.test(trimmed);
  if (!isSeparatorsOrDigits) {
    return raw;
  }

  const isPersian = /[۰-۹٠-٩]/.test(trimmed);

  let digits = trimmed
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[^\d]/g, '');

  if (!digits) return '';

  if (digits.length > 1 && digits.startsWith('0')) {
    digits = digits.replace(/^0+/, '') || '0';
  }

  const parts: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) {
    parts.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  const formattedEnglish = parts.join(',');

  if (isPersian) {
    return formattedEnglish
      .replace(/\d/g, d => String.fromCharCode(Number(d) + 1776))
      .replace(/,/g, '٬');
  }

  return formattedEnglish;
}

export function validateBudget(budgetStr: string): { valid: boolean; error?: string } {
  if (!budgetStr) return { valid: true };
  if (!/^[0-9]+$/.test(budgetStr)) {
    return { valid: false, error: 'بودجه باید فقط شامل ارقام عددی باشد.' };
  }
  if (budgetStr.length > 19) {
    return { valid: false, error: 'سقف بودجه حداکثر می‌تواند ۱۹ رقم باشد.' };
  }
  if (BigInt(budgetStr) > 9223372036854775807n) {
    return { valid: false, error: 'بودجه از محدودهٔ عددی پشتیبانی‌شده بیشتر است.' };
  }
  return { valid: true };
}

export function formatTehranDateTime(isoString: string | null, includeSeconds = false): string {
  if (!isoString) return 'تاریخ ثبت نشده';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
    }).format(date);
  } catch {
    return isoString;
  }
}

export function formatWarranty(warranty: unknown): string {
  if (warranty === null || warranty === undefined) return 'ثبت نشده';
  if (typeof warranty === 'string') return warranty.trim() || 'ثبت نشده';
  if (typeof warranty === 'number' || typeof warranty === 'boolean') return String(warranty);
  if (typeof warranty === 'object') {
    const record = warranty as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof record.description === 'string' && record.description.trim()) parts.push(record.description.trim());
    if (typeof record.provider === 'string' && record.provider.trim()) parts.push(record.provider.trim());
    if (typeof record.duration === 'string' && record.duration.trim()) parts.push(record.duration.trim());
    if (typeof record.type === 'string' && record.type.trim()) parts.push(record.type.trim());
    if (parts.length > 0) return parts.join(' · ');
    try {
      return JSON.stringify(warranty);
    } catch {
      return 'ثبت شده';
    }
  }
  return 'ثبت نشده';
}

export function extractAllSpecKeys(products: Product[]): SpecKey[] {
  const seen = new Set<string>();
  const keys: SpecKey[] = [];
  for (const product of products) {
    for (const spec of product.specs) {
      const section = spec.section?.trim() || '';
      const key = spec.key?.trim() || '';
      if (!section && !key) continue;
      const id = `${section}:::${key}`;
      if (!seen.has(id)) {
        seen.add(id);
        keys.push({
          section,
          key,
          displaySection: section || 'مشخصات عمومی',
          displayKey: key || 'ویژگی بدون عنوان',
        });
      }
    }
  }
  keys.sort((a, b) => {
    const sDiff = a.displaySection.localeCompare(b.displaySection, 'fa');
    if (sDiff !== 0) return sDiff;
    return a.displayKey.localeCompare(b.displayKey, 'fa');
  });
  return keys;
}

export function getProductSpecValue(product: Product, section: string, key: string): string {
  const match = product.specs.find(
    s => (s.section?.trim() || '') === section && (s.key?.trim() || '') === key
  );
  if (!match || !match.value || !match.value.trim()) {
    return 'اطلاعات ثبت نشده';
  }
  return match.value.trim();
}
