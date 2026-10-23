export const provenance = { snapshot_id: 'fixture', dataset: 'controlled test fixture',
  generated_at_utc: '2026-10-23T10:00:00Z', currency: 'toman', inventory_status: 'unconfirmed' };

export function product(id = 'p1') {
  return { product_id: id, persian_title: 'گوشی نمونهٔ آزمون', brand_name: 'آزمون', model: null, category_name: 'گوشی موبایل',
    image_urls: [], specs: [], offer_summary: { offer_count: 3, min_price_toman: '0', max_price_toman: '9007199254740993',
      missing_price_count: 1 }, battery_capacity: null, nearest_offer: null };
}

export function cataloguePage(items = [product()], hasMore = false) {
  return { items, has_more: hasMore, limit: 12, offset: 0, category_name: 'گوشی موبایل',
    min_battery_capacity_mah: null, provenance };
}

export function needState(overrides = {}) {
  return { version: 1, topic_query: 'گوشی', category_name: 'گوشی موبایل', category_cleared: false,
    max_price_toman: '10000000', budget_needs_input: false, offer_sort: 'price',
    battery_requirement: { status: 'unspecified', minimum_mah: null }, review_topics: ['camera'],
    pending_requirements: [{ key: 'student_discount', source_text: 'تخفیف دانشجویی', status: 'unsupported' }],
    ...overrides };
}

export function needsInputTurn(question = 'سقف بودجه‌تان چقدر است؟', overrides = {}) {
  const need = needState(overrides.need);
  return { request_id: '', status: 'needs_input', query: null, category_name: null,
    max_price_toman: need.max_price_toman, question, question_code: 'internal_budget_check', products: null,
    need_state: need, offer_sort: need.offer_sort, battery_requirement: need.battery_requirement, explanation: null };
}

export function resultsTurn(overrides = {}) {
  const need = needState(overrides.need);
  return { request_id: '', status: 'results', query: 'گوشی', category_name: 'گوشی موبایل',
    max_price_toman: need.max_price_toman, question: null, question_code: null, products: cataloguePage(),
    need_state: need, offer_sort: need.offer_sort, battery_requirement: need.battery_requirement,
    explanation: { query: 'گوشی', category_name: 'گوشی موبایل', max_price_toman: need.max_price_toman,
      ranking_basis: 'lexical_match_then_product_id', topics: ['camera'],
      summary: 'این پاسخ از کاتالوگ ثبت‌شده ساخته شده است.',
      limitations: ['موجودی تأیید نشده', 'تناسب کالا با نیاز تأیید نشده'], products: [], provenance } };
}

export function noEvidenceTurn() {
  const need = needState();
  return { request_id: '', status: 'no_evidence', query: 'گوشی', category_name: null,
    max_price_toman: need.max_price_toman, question: null, question_code: null, products: cataloguePage([], false),
    need_state: need, offer_sort: need.offer_sort, battery_requirement: need.battery_requirement, explanation: null };
}
