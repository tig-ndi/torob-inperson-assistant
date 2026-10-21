export const unknownCredit = () => ({ status: 'unknown', reason: 'not_recorded', options: [] });

export const syntheticCredit = (changes = {}) => ({
  status: 'matches_declared_terms', reason: 'matching_option', options: [{
    option_index: 0, provider_name: 'ارائه‌دهندهٔ آزمایشی', channel: 'in_person',
    min_price_toman: null, max_price_toman: null, category_names: [],
    status: 'matches_declared_terms', reason: 'matched',
  }], ...changes,
});
