import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCoordinate,
  parseCoordinateWithValidation,
  normalizeBudget,
  validateBudget,
  parseAssistantResult,
  parsePage,
} from '../src/api.ts';

test('parseCoordinateWithValidation distinguishes empty from invalid input', () => {
  const emptyRes = parseCoordinateWithValidation('', 'lat');
  assert.equal(emptyRes.status, 'empty');
  assert.equal(emptyRes.value, null);

  const spacesRes = parseCoordinateWithValidation('   ', 'lon');
  assert.equal(spacesRes.status, 'empty');
  assert.equal(spacesRes.value, null);

  const invalidRes = parseCoordinateWithValidation('abc', 'lat');
  assert.equal(invalidRes.status, 'invalid');
  assert.equal(invalidRes.value, null);
  assert.match(invalidRes.error, /عرض جغرافیایی/);

  const invalidLonRes = parseCoordinateWithValidation('xyz', 'lon');
  assert.equal(invalidLonRes.status, 'invalid');
  assert.equal(invalidLonRes.value, null);
  assert.match(invalidLonRes.error, /طول جغرافیایی/);
});

test('parseCoordinateWithValidation handles Persian/Arabic digits and decimal comma', () => {
  const faLat = parseCoordinateWithValidation('۳۵٫۷', 'lat');
  assert.equal(faLat.status, 'valid');
  assert.equal(faLat.value, 35.7);

  const faLon = parseCoordinateWithValidation('۵۱٫۴', 'lon');
  assert.equal(faLon.status, 'valid');
  assert.equal(faLon.value, 51.4);

  const arComma = parseCoordinateWithValidation('۳۵،۶۸۹۲', 'lat');
  assert.equal(arComma.status, 'valid');
  assert.equal(arComma.value, 35.6892);
});

test('parseCoordinateWithValidation enforces lat/lon geographical bounds', () => {
  const latOver = parseCoordinateWithValidation('91.5', 'lat');
  assert.equal(latOver.status, 'invalid');
  assert.match(latOver.error, /۹۰/);

  const latUnder = parseCoordinateWithValidation('-90.1', 'lat');
  assert.equal(latUnder.status, 'invalid');

  const lonOver = parseCoordinateWithValidation('180.5', 'lon');
  assert.equal(lonOver.status, 'invalid');
  assert.match(lonOver.error, /۱۸۰/);
});

test('parseCoordinate helper retains null for both empty and invalid', () => {
  assert.equal(parseCoordinate(''), null);
  assert.equal(parseCoordinate('abc'), null);
  assert.equal(parseCoordinate('35.7'), 35.7);
  assert.equal(parseCoordinate('۳۵٫۷'), 35.7);
});

test('validateBudget enforces boundaries without turning null to zero', () => {
  assert.deepEqual(validateBudget(''), { valid: true });
  assert.deepEqual(validateBudget('10000000'), { valid: true });
  assert.equal(validateBudget('abc').valid, false);
  assert.equal(validateBudget('100000000000000000000').valid, false); // >19 digits
});

test('parseAssistantResult parses battery_requirement and explanation without dropping state', () => {
  const sample = {
    request_id: 'req-123',
    status: 'results',
    query: 'گوشی',
    category_name: 'گوشی موبایل',
    max_price_toman: '15000000',
    question: null,
    products: {
      provenance: { currency: 'toman', inventory_status: 'unconfirmed' },
      items: [
        {
          product_id: 'prod-1',
          persian_title: 'گوشی تست',
          category_name: 'گوشی موبایل',
          brand_name: 'سامسونگ',
          model: 'A55',
          image_urls: [],
          specs: [],
          offer_summary: {
            offer_count: 2,
            missing_price_count: 0,
            min_price_toman: '14000000',
            max_price_toman: '14500000',
          },
          battery_capacity: {
            status: 'known',
            capacity_mah: 5000,
            reason: 'ثبت شده در مشخصات منبع',
          },
        },
      ],
      has_more: true,
      min_battery_capacity_mah: 5000,
    },
    battery_requirement: {
      status: 'minimum',
      minimum_mah: 5000,
    },
    explanation: {
      query: 'گوشی',
      category_name: 'گوشی موبایل',
      max_price_toman: '15000000',
      ranking_basis: 'lexical_match_then_product_id',
      topics: ['battery'],
      products: [],
    },
  };

  const parsed = parseAssistantResult(sample, 'req-123');
  assert.equal(parsed.status, 'results');
  assert.equal(parsed.battery_requirement?.status, 'minimum');
  assert.equal(parsed.battery_requirement?.minimum_mah, 5000);
  assert.deepEqual(parsed.explanation?.topics, ['battery']);
  assert.equal(parsed.products?.min_battery_capacity_mah, 5000);
  assert.equal(parsed.products?.items[0]?.battery_capacity?.capacity_mah, 5000);
});

test('parsePage parses min_battery_capacity_mah accurately', () => {
  const pageRaw = {
    provenance: { currency: 'toman', inventory_status: 'unconfirmed' },
    items: [],
    has_more: false,
    category_name: 'گوشی موبایل',
    min_battery_capacity_mah: 6000,
  };
  const parsed = parsePage(pageRaw);
  assert.equal(parsed.min_battery_capacity_mah, 6000);
  assert.equal(parsed.category_name, 'گوشی موبایل');
});
