import test from 'node:test';
import assert from 'node:assert/strict';

import { tehranDistricts, districtById } from '../src/tehranNeighborhoods.ts';

test('districts have unique ids, labels and Tehran-bound coordinates', () => {
  const ids = new Set();
  for (const d of tehranDistricts) {
    assert.ok(!ids.has(d.id), `duplicate id ${d.id}`);
    ids.add(d.id);
    assert.ok(d.label.length > 0, `empty label for ${d.id}`);
    assert.ok(d.lat >= 35.5 && d.lat <= 35.9, `lat out of Tehran bounds for ${d.id}: ${d.lat}`);
    assert.ok(d.lon >= 51.15 && d.lon <= 51.6, `lon out of Tehran bounds for ${d.id}: ${d.lon}`);
  }
  assert.ok(tehranDistricts.length >= 16, 'expected at least 16 districts');
});

test('districtById resolves existing ids and rejects unknown ones', () => {
  const first = tehranDistricts[0];
  assert.equal(districtById(first.id), first);
  assert.equal(districtById('d-nope'), undefined);
  assert.equal(districtById(''), undefined);
});
