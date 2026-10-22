export const provenance = { snapshot_id: 'fixture', dataset: 'controlled test fixture', generated_at_utc: '2026-10-23T10:00:00Z', currency: 'toman', inventory_status: 'unconfirmed' };
export function product(id = 'p1') {
  return { product_id: id, persian_title: 'گوشی نمونهٔ آزمون', brand_name: 'آزمون', model: null, category_name: 'گوشی موبایل', image_urls: [], specs: [],
    offer_summary: { offer_count: 3, min_price_toman: '0', max_price_toman: '9007199254740993', missing_price_count: 1 }, battery_capacity: null, nearest_offer: null };
}
export function page(items = [product()]) {
  return { items, has_more: false, limit: 12, offset: 0, category_name: 'گوشی موبایل', min_battery_capacity_mah: null, provenance };
}
export function offer(id = 'o1', shop = 's1', productId = 'p1') {
  return { offer_id: id, product_id: productId, shop_id: shop, price_toman: '9007199254740993', price_quality: 'above_js_safe_integer',
    last_price_changed_at: '2026-10-22T10:00:00Z', seller_title: null, description: null, warranty: null, inventory_status: 'unconfirmed',
    direct_distance_meters: 120, shop: { name: 'نام نمایشی آزمون', location_label: 'محدودهٔ آزمون', address: 'خیابان آزمون، پاساژ نمونه، طبقه دوم، واحد ۱۲', lat: 35.7, lon: 51.4 },
    opening_hours: { status: 'unknown', reason: 'missing_schedule', local_day: 'fri', today_shifts: [], previous_day_overnight_shifts: [] },
    in_person_credit: { status: 'unknown', reason: 'not_recorded', options: [] } };
}
export function offers(items = [offer()]) { return { items, has_more: false, limit: 20, offset: 0, hours_evaluated_at: '2026-10-23T10:00:00Z', provenance }; }
export function needState() { return { version: 1, topic_query: 'گوشی', category_name: 'گوشی موبایل', category_cleared: false, max_price_toman: null,
  budget_needs_input: false, offer_sort: 'price', battery_requirement: { status: 'unspecified', minimum_mah: null }, review_topics: ['camera'], pending_requirements: [] }; }
export const requestId = '00000000-0000-4000-8000-000000000001';
export function turn() { return { request_id: requestId, status: 'results', query: 'گوشی', category_name: 'گوشی موبایل', max_price_toman: null,
  question: null, question_code: null, products: page(), need_state: needState(), offer_sort: 'price', battery_requirement: needState().battery_requirement,
  explanation: { query: 'گوشی', category_name: 'گوشی موبایل', max_price_toman: null, ranking_basis: 'lexical_match_then_product_id', topics: ['camera'],
    summary: 'شواهد ثبت‌شده، نه اثبات کیفیت', limitations: ['موجودی تأییدنشده', 'درخواست تماس انجام نشده'], products: [], provenance } }; }
export function prepared() { return { status: 'prepared', product: { product_id: 'p1', persian_title: 'گوشی نمونهٔ آزمون', brand_name: null, model: null, category_name: 'گوشی موبایل' },
  selected_offer: offer(), draft: { delivery_status: 'draft_not_sent', text: 'پیش‌نویس ارسال‌نشده', contact_channel_available: false, external_contact_attempted: false },
  limitations: ['تماس واقعی انجام نشده'], hours_evaluated_at: '2026-10-23T10:00:00Z', provenance }; }
export function alternatives() { return { status: 'alternatives_available', product_id: 'p1', reported_offer_id: 'o1', reported_shop_id: 's1', excluded_offer_count: 2,
  outcome: { kind: 'no_answer', source: 'simulated', received_at: '2026-10-23T10:00:00Z', verified_externally: false, seller_confirmation: false },
  alternatives: offers([offer('o3', 's2')]), limitations: ['گزارش شبیه‌سازی‌شده است'] }; }
