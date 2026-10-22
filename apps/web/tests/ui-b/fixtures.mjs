export const provenance = {
  snapshot_id: 'ui-b-fixture', dataset: 'controlled B test fixture', generated_at_utc: '2026-10-23T10:00:00Z',
  currency: 'toman', inventory_status: 'unconfirmed',
};

export function product(id = 'p1', title = 'گوشی نمونهٔ آزمون') {
  return { product_id: id, persian_title: title, brand_name: 'آزمون', model: null, category_name: 'گوشی موبایل',
    image_urls: [], specs: [], battery_capacity: null, nearest_offer: null,
    offer_summary: { offer_count: 3, min_price_toman: '1000000', max_price_toman: '9007199254740993', missing_price_count: 1 } };
}
export function page(items = [product()]) {
  return { items, has_more: false, limit: 12, offset: 0, category_name: 'گوشی موبایل', min_battery_capacity_mah: null, provenance };
}
export function offer(id = 'o1', shopId = 's1', overrides = {}) {
  const base = {
    offer_id: id, product_id: 'p1', shop_id: shopId,
    price_toman: shopId === 's2' ? '2500000' : '1000000', price_quality: 'not_assessed',
    last_price_changed_at: '2026-10-22T10:00:00Z', seller_title: null, description: null, warranty: null,
    inventory_status: 'unconfirmed', direct_distance_meters: 1200,
    shop: { name: `نام نمایشی ${shopId}`, location_label: `محدودهٔ ${shopId}`,
      address: `تهران، خیابان آزمون ${shopId}، پاساژ نمونه، طبقه دوم، واحد ۱۲`, lat: 35.7, lon: 51.4 },
    opening_hours: { status: 'unknown', reason: 'missing_schedule', local_day: 'fri', today_shifts: [],
      previous_day_overnight_shifts: [] },
    in_person_credit: { status: 'unknown', reason: 'not_recorded', options: [] },
  };
  return { ...base, ...overrides, shop: { ...base.shop, ...(overrides.shop ?? {}) } };
}
export function offers(items = [offer()], extra = {}) {
  return { items, has_more: false, limit: 20, offset: 0, hours_evaluated_at: '2026-10-23T10:00:00Z', provenance, ...extra };
}
export function prepared(offerValue = offer()) {
  return { status: 'prepared',
    product: { product_id: 'p1', persian_title: 'گوشی نمونهٔ آزمون', brand_name: null, model: null, category_name: 'گوشی موبایل' },
    selected_offer: offerValue,
    draft: { delivery_status: 'draft_not_sent', text: 'سلام؛ موجودی و قیمت روز این آفر را می‌پرسیم.',
      contact_channel_available: false, external_contact_attempted: false },
    limitations: ['این متن ارسال نشده است.', 'شماره تماس در دیتاست مصنوعی است.'],
    hours_evaluated_at: '2026-10-23T10:00:00Z', provenance };
}
export function alternatives(offerValue = offer(), next = offer('o3', 's2'), outcome = 'no_answer', source = 'simulated') {
  return { status: 'alternatives_available', product_id: 'p1', reported_offer_id: offerValue.offer_id,
    reported_shop_id: offerValue.shop_id, excluded_offer_count: 2,
    outcome: { kind: outcome, source, received_at: '2026-10-23T10:00:00Z',
      verified_externally: false, seller_confirmation: false },
    alternatives: offers([next]), limitations: ['گزارش شبیه‌سازی‌شده است؛ تأیید بیرونی نیست.',
      'همهٔ آفرهای فروشگاه گزارش‌شده کنار گذاشته شدند.'] };
}
export function noAlternatives(offerValue = offer(), outcome = 'out_of_stock', source = 'simulated') {
  return { ...alternatives(offerValue, undefined, outcome, source), status: 'no_alternatives', alternatives: offers([]),
    excluded_offer_count: 1 };
}
export const tileOk = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
  '<rect width="256" height="256" fill="#eceef2"/>' +
  '<path d="M0 128h256M128 0v256" stroke="#dde0e6" stroke-width="1"/></svg>');
