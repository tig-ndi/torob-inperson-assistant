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

export function parseOfferPage(value: unknown): OfferPage {
  const page = record(value);
  const source = record(page.provenance);
  if (source.currency !== 'toman' || source.inventory_status !== 'unconfirmed' ||
      !Array.isArray(page.items) || typeof page.has_more !== 'boolean') {
    throw new Error('قرارداد پاسخ کاتالوگ معتبر نیست.');
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
  signal: AbortSignal
): Promise<OfferPage> {
  const params = new URLSearchParams({
    limit: String(OFFERS_PAGE_SIZE),
    offset: String(offset),
  });
  if (maxPrice) {
    params.set('max_price_toman', maxPrice);
  }
  let response: Response;
  try {
    response = await fetch(`/api/products/${encodeURIComponent(productId)}/offers?${params}`, { signal });
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
  return parseOfferPage(body);
}

export function normalizeBudget(input: string): string {
  return input
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[\s,،_]/g, '');
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

export function formatTehranDateTime(isoString: string | null): string {
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
