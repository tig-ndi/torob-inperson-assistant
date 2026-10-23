import test from 'node:test';
import assert from 'node:assert/strict';
import { measureMapPadding } from '../../src/app/base/shell/mapPadding.ts';
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test('a sibling panel and search outside a mobile map are not counted as occlusion', () => {
  assert.deepEqual(measureMapPadding(rect(0, 150, 390, 220), [rect(0, 370, 390, 500), rect(0, 0, 390, 150)]),
    { top: 20, right: 20, bottom: 20, left: 20 });
});
test('floating panels use measured widths and search uses its actual lower edge', () => {
  const map = rect(0, 0, 1440, 900);
  assert.deepEqual(measureMapPadding(map, [rect(928, 12, 500, 876), rect(60, 16, 700, 108)]),
    { top: 144, right: 532, bottom: 20, left: 20 });
  assert.equal(measureMapPadding(map, [rect(788, 12, 640, 876)]).right, 672);
});
test('a bottom overlay excludes its overlap once, with map-relative coordinates', () => {
  assert.deepEqual(measureMapPadding(rect(10, 100, 390, 600), [rect(10, 500, 390, 400)]),
    { top: 20, right: 20, bottom: 220, left: 20 });
});
test('a tiny map retains finite non-negative space and hidden maps have a safe default', () => {
  const value = measureMapPadding(rect(0, 0, 40, 30), [rect(0, 0, 40, 30)]);
  for (const amount of Object.values(value)) assert.ok(Number.isFinite(amount) && amount >= 0);
  assert.ok(value.left + value.right <= 20);
  assert.ok(value.top + value.bottom <= 15);
  assert.deepEqual(measureMapPadding(rect(0, 0, 0, 0), []), { top: 20, right: 20, bottom: 20, left: 20 });
});
