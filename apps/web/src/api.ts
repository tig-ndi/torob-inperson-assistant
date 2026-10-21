export type Product = {
  product_id: string;
  persian_title: string | null;
  category_name: string | null;
  brand_name: string | null;
  offer_summary: {
    offer_count: number;
    min_price_toman: string | null;
    max_price_toman: string | null;
    missing_price_count: number;
  };
};

export type ProductPage = { items: Product[]; has_more: boolean };

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('پاسخ کاتالوگ قابل خواندن نیست. دوباره تلاش کنید.');
  }
  return value as Record<string, unknown>;
}

function nullableText(value: unknown): string | null {
  if (value === null || typeof value === 'string') return value;
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

export function parsePage(value: unknown): ProductPage {
  const page = record(value);
  const source = record(page.provenance);
  if (source.currency !== 'toman' || source.inventory_status !== 'unconfirmed' ||
      !Array.isArray(page.items) || typeof page.has_more !== 'boolean') {
    throw new Error('قرارداد پاسخ کاتالوگ معتبر نیست.');
  }
  const items = page.items.map((item: unknown): Product => {
    const product = record(item);
    const summary = record(product.offer_summary);
    if (typeof product.product_id !== 'string' || !product.product_id) {
      throw new Error('شناسهٔ محصول در پاسخ کاتالوگ معتبر نیست.');
    }
    return {
      product_id: product.product_id,
      persian_title: nullableText(product.persian_title),
      category_name: nullableText(product.category_name),
      brand_name: nullableText(product.brand_name),
      offer_summary: {
        offer_count: count(summary.offer_count),
        missing_price_count: count(summary.missing_price_count),
        min_price_toman: money(summary.min_price_toman),
        max_price_toman: money(summary.max_price_toman),
      },
    };
  });
  return { items, has_more: page.has_more };
}

export const PAGE_SIZE = 12;

export async function searchProducts(query: string, offset: number, signal: AbortSignal): Promise<ProductPage> {
  const params = new URLSearchParams({ q: query, limit: String(PAGE_SIZE), offset: String(offset) });
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
