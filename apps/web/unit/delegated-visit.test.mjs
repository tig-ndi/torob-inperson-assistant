import test from 'node:test';
import assert from 'node:assert/strict';
import {visitCommand,visitGoal,phoneKind,broadPhone,selectVisit} from '../src/live/delegatedVisit.ts';
import {replyPlan} from '../src/live/replySuggestions.ts';
import {selectedProductIndex,samePurchaseFamily} from '../src/live/requestPlanning.ts';

test('explicit delegation is distinct from suggestions, questions, refusals and hypothetical trips',()=>{
 for(const text of ['خودت نزدیک ترین جا رو انتخاب کن برم','نزدیک‌ترین رو برام انتخابش کن','مسیر را تعیین کن برم','همین خوبه','برنامه رفتن را بچین'])assert.equal(visitCommand(text),'delegate',text);
 for(const text of ['نزدیک ترین را بگو','می تونی خودت انتخاب کنی؟','اگر این بسته بود فروشگاه دیگر انتخاب کن','گوشی میخوام'])assert.equal(visitCommand(text),null,text);
 assert.equal(visitCommand('خودت انتخاب نکن'),'cancel');assert.equal(visitCommand('یک فروشگاه دیگر انتخاب کن'),'alternative');
});
test('only a broad phone needs a kind question; any-kind consent is explicit',()=>{
 assert.equal(broadPhone('گوشی'),true);assert.equal(broadPhone('گوشی سامسونگ A54'),false);assert.equal(phoneKind('نوع گوشی فرقی ندارد'),'any');assert.equal(phoneKind('هوشمند'),'smart');assert.equal(phoneKind('گوشی دکمه‌ای'),'basic');
 const plan=replyPlan({questionCode:'phone_kind'});assert.equal(plan.primary.length,3);assert.equal(selectedProductIndex('دومی خوبه',3),1);
});
const rows=[{offer_id:'a',shop_id:'a',price_toman:'200',direct_distance_meters:100},{offer_id:'b',shop_id:'b',price_toman:'300',direct_distance_meters:900},{offer_id:'c',shop_id:'c',price_toman:'100',direct_distance_meters:50}];
const routes=[{offer_id:'a',duration_seconds:1500,distance_meters:2000},{offer_id:'b',duration_seconds:600,distance_meters:1000},{offer_id:'c',duration_seconds:100,distance_meters:200}];
const checks={a:{risk:'ready',basis:'street_route'},b:{risk:'ready',basis:'street_route'},c:{risk:'closing_soon',basis:'street_route'}};
test('the fastest safe street route wins instead of the closest straight line or closing shop',()=>{
 assert.equal(selectVisit(rows,checks,routes,'nearest').offer_id,'b');assert.equal(visitGoal('ارزان ترین را انتخاب کن'),'cheapest');assert.equal(selectVisit(rows,checks,routes,'cheapest').offer_id,'a');
});
test('unverified routing, failed routes and excluded shops cannot become automatic departure plans',()=>{
 assert.equal(selectVisit(rows,{},routes,'nearest'),null);assert.equal(selectVisit(rows,checks,[],'nearest'),null);assert.equal(selectVisit(rows,checks,routes,'nearest',['b']).offer_id,'a');assert.equal(selectVisit(rows,{...checks,a:{risk:'ready',basis:'rough_walking_range'}},routes,'nearest',['b']),null);
});

test('refining a phone kind keeps the current purchase, unlike a charger',()=>{assert.equal(samePurchaseFamily('گوشی دکمه ای','گوشی'),true);assert.equal(samePurchaseFamily('گوشی','شارژر موبایل'),false);});
