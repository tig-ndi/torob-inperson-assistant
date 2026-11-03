import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedProductIndex} from '../src/live/requestPlanning.ts';
import {visitIntent} from '../src/live/conversation.ts';
import {comparisonPriceSummary} from '../src/live/comparisonSummary.ts';

test('short product references select only an existing visible option',()=>{
 assert.equal(selectedProductIndex('همین اولی رو میخوام',3),0);
 assert.equal(selectedProductIndex('گزینه دوم را انتخاب کن',3),1);
 assert.equal(selectedProductIndex('سومی را می‌خواهم',2),null);
 for(const text of ['همین اولی رنگ سفیدش را می‌خواهم','دومی سایز ۳۸ می‌خواهم','گوشی اولی را می‌خواهم','اولی را نمی‌خواهم'])assert.equal(selectedProductIndex(text,3),null);
});
test('price summary compares exact large integers without claiming suitability',()=>{
 const summary=comparisonPriceSummary(['9007199254740993','9007199254740995']);
 assert.match(summary,/۲ تومان/);assert.match(summary,/گزینهٔ ۱/);assert.match(summary,/تناسب و موجودی/);
 assert.match(comparisonPriceSummary(['10','10']),/برابر/);
 assert.equal(comparisonPriceSummary([null,'10']),null);
 assert.match(comparisonPriceSummary(['0','10']),/گزینهٔ ۱/);
});

test('the local nearest shortcut never drops an operating system requirement',()=>{
 for(const text of ['گوشی اندرویدی نزدیک من می‌خواهم','گوشی با سیستم عامل اندروید نزدیک من کجا پیدا می‌شود؟','گوشی ios نزدیک من'])assert.equal(visitIntent(text,null),null);
 assert.equal(visitIntent('گوشی نزدیک من می‌خواهم',null).topic,'گوشی');
});
