import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceGroups, focusFromNeed, previewEvidence } from '../src/specEvidenceData.ts';

const spec = (key, value, section = 'مشخصات کلی') => ({ key, value, section });
const phone = specs => ({ product_id: 'synthetic', category_name: 'گوشی موبایل', specs });

test('source section, key, value and original index remain exact', () => {
  const specs = [spec('وزن', '۱۷۵ گرم'), spec('ظرفیت باتری', '۵٬۰۰۰ میلی‌آمپر ساعت')];
  const [group] = evidenceGroups(phone(specs), 'battery');
  assert.deepEqual(group.entries[0], { index: 1, spec: specs[1], topic: 'battery', state: 'recorded' });
  assert.equal(group.entries[0].spec.value, '۵٬۰۰۰ میلی‌آمپر ساعت');
});
test('display resolution and values that merely mention camera are not camera evidence', () => {
  const groups = evidenceGroups(phone([spec('رزولوشن', '1080×2400'), spec('رنگ', 'دوربین آبی')]), 'camera');
  assert.deepEqual(groups[0].entries, []);
});
test('absence stays a negative source value, not a missing value or positive capability', () => {
  const [group] = evidenceGroups(phone([spec('دوربین', 'ندارد'), spec('دوربین اصلی', 'title')]), 'camera');
  assert.equal(group.entries[0].state, 'negative');
  assert.equal(group.entries[0].spec.value, 'ندارد');
  assert.equal(group.entries[1].state, 'unknown');
  const placeholder = evidenceGroups(phone([spec('دوربین', 'None')]), 'camera')[0].entries[0];
  assert.equal(placeholder.state, 'unknown');
  assert.equal(placeholder.spec.value, 'None');
});
test('no specs and unknown source values remain distinct', () => {
  assert.equal(evidenceGroups(phone([]), 'battery')[0].entries.length, 0);
  const [group] = evidenceGroups(phone([spec('ظرفیت باتری', null)]), 'battery');
  assert.equal(group.entries.length, 1);
  assert.equal(group.entries[0].state, 'unknown');
});
test('negative battery replaceability does not erase a recorded capacity', () => {
  const [group] = evidenceGroups(phone([spec('باتری قابل تعویض', 'ندارد'), spec('ظرفیت باتری', '5000 mAh')]), 'battery');
  assert.equal(group.entries[0].spec.key, 'ظرفیت باتری');
  assert.equal(group.entries[0].state, 'recorded');
  assert.equal(group.entries[1].state, 'negative');
});
test('conflicting rows keep their independent source values', () => {
  const [group] = evidenceGroups(phone([spec('دوربین', 'ندارد'), spec('دوربین', 'دارد')]), 'camera');
  assert.deepEqual(group.entries.map(e => e.spec.value), ['ندارد', 'دارد']);
});
test('preview is bounded, includes both requested topics and retains remaining evidence', () => {
  const specs = [spec('دوربین', 'بدون دوربین'), spec('دوربین سلفی', 'ندارد'), spec('ظرفیت باتری', '1000 mAh'), spec('نوع باتری', 'لیتیومی')];
  const groups = evidenceGroups(phone(specs), 'both');
  const preview = previewEvidence(groups);
  assert.equal(preview.length, 3);
  assert.deepEqual(new Set(preview.map(e => e.topic)), new Set(['camera', 'battery']));
  assert.equal(groups.flatMap(g => g.entries).length, 4);
});
test('accessories and stethoscopes are not phone capability evidence', () => {
  for (const category_name of ['باتری گوشی موبایل', 'گوشی پزشکی', null]) {
    assert.deepEqual(evidenceGroups({ ...phone([spec('ظرفیت باتری', '5000')]), category_name }, 'battery'), []);
  }
});
test('interest selection does not score quality or invent a requirement', () => {
  assert.equal(focusFromNeed('گوشی برای عکاسی'), 'camera');
  assert.equal(focusFromNeed('باتری و دوربين'), 'both');
  assert.equal(focusFromNeed('battery'), 'battery');
  assert.equal(focusFromNeed('گوشی خوب'), null);
});
