import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonValue as value} from '../src/live/comparisonValues.ts';
test('equal source quantities ignore typography and Persian digits',()=>{
  assert.equal(value('800 میلی‌آمپر ساعت'),value('۸۰۰ میلی آمپر ساعت'));
  assert.equal(value('۳۲ گیگابایت'),value('32 GB'));
  assert.equal(value('يک  كالا'),value('یک کالا'));
});
test('units, unknowns, absence and constraints remain distinct',()=>{
  for(const [a,b] of [['800 میلی آمپر','800 میلی آمپر ساعت'],['حداقل 800 میلی آمپر ساعت','800 میلی آمپر ساعت'],['ندارد','دارد'],['ثبت نشده','صفر'],['800 میلی آمپر ساعت','900 میلی آمپر ساعت']])assert.notEqual(value(a),value(b));
});
