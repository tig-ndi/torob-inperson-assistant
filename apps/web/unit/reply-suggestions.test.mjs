import test from 'node:test';
import assert from 'node:assert/strict';
import {replyPlan,budgetPresets} from '../src/live/replySuggestions.ts';
const base={screen:'results',topic:'گوشی',questionCode:'',lastQuestion:'',history:'گوشی می‌خواهم',budget:'',needsLocation:false,selected:false,openOnly:false,batteryStatus:'unspecified',pending:[],completed:false,hasResults:true};
test('answers address the actual blocking question before ordinary shopping actions',()=>{
  const plan=replyPlan({...base,questionCode:'budget',pending:['رنگ'],batteryStatus:'awaiting_minimum'});
  assert.equal(plan.primary.length,3);assert.ok(plan.primary.every(a=>a.kind==='budget'));
  const capacity=replyPlan({...base,batteryStatus:'awaiting_minimum'});
  assert.ok(capacity.primary.every(a=>a.kind==='message'));assert.match(capacity.primary[0].text,/میلی‌آمپرساعت/);
});
test('charger clarification answers name the charger and its device together',()=>{
  const plan=replyPlan({...base,screen:'decide',topic:'',questionCode:'product_kind',lastQuestion:'شارژر را برای چه دستگاهی می‌خواهی؟'});
  assert.deepEqual(plan.primary.map(a=>a.text),['شارژر برای گوشی می‌خواهم','شارژر برای لپ‌تاپ می‌خواهم']);
});
test('a use-case question keeps the existing product in every suggested reply',()=>{
  const plan=replyPlan({...base,topic:'کفش زنانه',questionCode:'priority'});
  assert.ok(plan.primary.every(action=>action.kind==='message'&&action.text.startsWith('کفش زنانه')));
  assert.match(plan.primary[0].text,/پیاده‌روی/);
});
test('walking shoe audience and next budget choices do not repeat an answered question',()=>{
  const ask=replyPlan({...base,topic:'کفش',history:'کفش برای پیاده‌روی می‌خواهم'});
  assert.equal(ask.primary.length,3);assert.ok(ask.primary.every(a=>a.id.startsWith('shoe-')));
  const answered=replyPlan({...base,topic:'کفش زنانه',history:'کفش زنانه برای پیاده‌روی می‌خواهم'});
  assert.equal(answered.primary.length,2);assert.equal(answered.primary[0].kind,'budget');assert.equal(answered.primary[0].value,'3000000');
  assert.ok(answered.primary.some(a=>a.id==='compare'));
});
test('unknown source constraints have explicit choices and the open filter can be removed',()=>{
  const plan=replyPlan({...base,pending:['سایز','رنگ']});
  assert.equal(plan.primary[0].panel,'requirements');assert.match(plan.primary[1].text,/اجرا نشده/);
  const stores=replyPlan({...base,screen:'stores',openOnly:true});assert.match(stores.primary[1].text,/بردار/);
});
test('empty results offer corrections instead of comparing nonexistent products',()=>{
  const plan=replyPlan({...base,hasResults:false});
  assert.deepEqual(plan.primary.map(action=>action.panel),['budget','topic']);
  assert.ok([...plan.primary,...plan.more].every(action=>action.kind!=='message'));
});
test('presets are exact optional user budgets, and compact answers contain no emoji',()=>{
  for(const topic of ['کفش','گوشی','گوشی دکمه‌ای','لپ تاپ','شارژر موبایل']){
    const presets=budgetPresets(topic);assert.equal(presets.length,3);assert.ok(presets.every(p=>/^\d+$/.test(p.value)));
    const plan=replyPlan({...base,topic});assert.ok(plan.primary.length<=3);
    for(const action of [...plan.primary,...plan.more])assert.doesNotMatch(action.label,/\p{Extended_Pictographic}/u);
  }
});
