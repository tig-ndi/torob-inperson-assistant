import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonRows } from '../../src/app/screens/a/comparisonData.ts';
import { product } from '../ui-base/fixtures.mjs';

const spec = (section, key, value) => ({ section, key, value });
const withSpecs = (id, specs) => ({ ...product(id), specs });

test('only exact section/key pairs align, with no inferred unit or numeral equivalence', () => {
  const rows = comparisonRows([
    withSpecs('a', [spec('دوربین', 'نوع', 'بدون دوربین'), spec('نمایشگر', 'نوع', 'OLED'), spec('باتری', 'ظرفیت', '۵۰۰۰')]),
    withSpecs('b', [spec('نمایشگر', 'نوع', 'OLED'), spec('باتری', 'ظرفیت', '5000')]),
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find(row => row.section === 'دوربین').difference, 'unknown');
  assert.deepEqual(rows.find(row => row.section === 'دوربین').cells[1], []);
  assert.equal(rows.find(row => row.section === 'نمایشگر').difference, 'same');
  assert.equal(rows.find(row => row.section === 'باتری').difference, 'different');
});

test('duplicate source rows, negative values and null remain distinct and input is not mutated', () => {
  const products = [withSpecs('a', [spec('باتری', 'ظرفیت', '۵۰۰۰'), spec('باتری', 'ظرفیت', '۴۰۰۰'), spec('دوربین', 'وضعیت', 'بدون دوربین')]),
    withSpecs('b', [spec('باتری', 'ظرفیت', null), spec('دوربین', 'وضعیت', null)])];
  const original = JSON.stringify(products), rows = comparisonRows(products);
  assert.equal(JSON.stringify(products), original);
  assert.deepEqual(rows[0].cells[0], [{ sourceIndex: 0, value: '۵۰۰۰' }, { sourceIndex: 1, value: '۴۰۰۰' }]);
  assert.equal(rows[0].difference, 'unknown');
  assert.equal(rows[1].cells[0][0].value, 'بدون دوربین');
  assert.equal(rows[1].cells[1][0].value, null);
});

test('missing section/key cannot silently align unrelated fields under a placeholder label', () => {
  const rows = comparisonRows([
    withSpecs('a', [spec(null, 'وزن', '۱۷۰'), spec(' ', 'نوع', 'الف')]),
    withSpecs('b', [spec(null, 'وزن', '۱۹۰'), spec(' ', 'نوع', 'ب')]),
  ]);
  assert.equal(rows.length, 4);
  assert.equal(rows.every(row => !row.aligned && row.difference === 'unknown'), true);
  assert.equal(rows.every(row => row.cells.filter(cell => cell.length).length === 1), true);
});

test('equal literal value sets do not become a quality claim or differ only because duplicate rows repeat', () => {
  const rows = comparisonRows([
    withSpecs('a', [spec('نمایشگر', 'نوع', 'OLED'), spec('نمایشگر', 'نوع', 'OLED')]),
    withSpecs('b', [spec('نمایشگر', 'نوع', 'OLED')]),
    withSpecs('c', [spec('نمایشگر', 'نوع', 'OLED')]),
  ]);
  assert.equal(rows[0].difference, 'same');
  assert.equal(rows[0].cells[0].length, 2);
  assert.deepEqual(comparisonRows([withSpecs('a', []), withSpecs('b', [])]), []);
});
