import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshProgress,advancePurchase,rewindPurchase,purchaseAction} from '../src/live/purchaseProgress.ts';
test('arrival cannot happen before departure and purchased outcome requires an arrival report',()=>{
 const ready=freshProgress('a');assert.equal(advancePurchase(ready,'arrive'),ready);assert.equal(advancePurchase(ready,'purchased'),ready);const moving=advancePurchase(ready,'start','start');assert.equal(advancePurchase(freshProgress('a'),'closed').stage,'problem');
 const arrived=advancePurchase(moving,'arrive');const done=advancePurchase(arrived,'purchased','finish');assert.equal(done.result,'purchased');assert.equal(done.startedAt,'start');assert.equal(done.finishedAt,'finish');assert.equal(advancePurchase(done,'start'),done);
});
test('closed and unavailable destinations retain the purchase for a different shop',()=>{
 const arrived=advancePurchase(advancePurchase(freshProgress('a'),'start'),'arrive');for(const problem of ['closed','out_of_stock']){const p=advancePurchase(arrived,problem);assert.equal(p.stage,'problem');assert.equal(p.offerId,'a');assert.equal(p.result,null);assert.equal(p.problem,problem);}assert.equal(advancePurchase(freshProgress('b'),'later').result,'later');assert.equal(advancePurchase(arrived,'not_purchased').result,'not_purchased');
});
test('only direct progress reports are commands; hypotheticals and product needs stay conversations',()=>{
 for(const [text,action] of [['بزن بریم','start'],['رسیدم به فروشگاه','arrive'],['خریدم','purchased'],['نخریدم','not_purchased'],['بسته بود','closed'],['کالا موجود نبود','out_of_stock'],['منصرف شدم','cancelled']])assert.equal(purchaseAction(text),action);
 for(const text of ['اگه بسته بود چی؟','گوشی میخوام','هنوز نرسیدم','قبلا خریدم ولی الان هدفون میخوام','اگر موجود نبود چه کار کنیم؟'])assert.equal(purchaseAction(text),null);
});

test('back corrects visit progress without changing the destination or inventing inventory evidence',()=>{
 const ready={...freshProgress('shop'),evidence:{source:'user_report',outcome:'available'}};
 const moving=advancePurchase(ready,'start','departure'),arrived=advancePurchase(moving,'arrive'),done=advancePurchase(arrived,'purchased','finish');
 const corrected=rewindPurchase(done);assert.equal(corrected.stage,'arrived');assert.equal(corrected.result,null);assert.equal(corrected.finishedAt,null);assert.equal(corrected.offerId,'shop');assert.deepEqual(corrected.evidence,ready.evidence);
 assert.equal(rewindPurchase(arrived).stage,'en_route');assert.equal(rewindPurchase(moving).stage,'ready');assert.equal(rewindPurchase(moving).startedAt,null);assert.equal(rewindPurchase(ready),ready);const problem=advancePurchase(ready,'closed');assert.equal(rewindPurchase(problem),problem);
});
