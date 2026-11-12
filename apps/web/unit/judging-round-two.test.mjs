import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseTopics,canUseSimplePurchase,restoredNeedSummary} from '../src/live/requestPlanning.ts';
import {wordToman,sellerPreferences} from '../src/live/sellerPreferences.ts';
import {visitIntent,needsProductInterpretation} from '../src/live/conversation.ts';
import {parseNeedState} from '../src/app/base/domain/parsers.ts';

test('correction and not-only preserve purchases while spare-part refusals stay excluded',()=>{
 assert.deepEqual(purchaseTopics('نه من لپتاپ برای دانشگاه میخوام، سقف چهل میلیون'),['لپ تاپ']);
 assert.deepEqual(new Set(purchaseTopics('نه فقط گوشی، هدفون هم میخوام')),new Set(['گوشی','هدفون']));
 assert.deepEqual(purchaseTopics('پاوربانک میخوام، نه ماژول و نه باتری یدکی'),['پاوربانک']);
});
test('half-million and ceiling edits preserve exact integer toman',()=>{
 assert.equal(wordToman('نیم میلیون'),'500000');
 assert.equal(wordToman('دوازده و نیم میلیون'),'12500000');
 assert.equal(wordToman('نیم'),null);
 assert.equal(sellerPreferences('شارژر تا نیم میلیون').max,'500000');
 assert.equal(sellerPreferences('نه من لپتاپ برای دانشگاه میخوام، سقف چهل میلیون').max,'40000000');
});
test('source-backed powerbank capacity survives parsing and cannot be silently relaxed',()=>{
 const old={version:1,topic_query:'پاوربانک',category_name:null,category_cleared:false,max_price_toman:'2000000',budget_needs_input:false,offer_sort:'price',battery_requirement:{status:'unspecified',minimum_mah:null},review_topics:[],pending_requirements:[]};
 const need=parseNeedState({...old,minimum_powerbank_mah:20000});
 assert.equal(need.minimum_powerbank_mah,20000);
 assert.equal(canUseSimplePurchase('پاوربانک',need),false);
 assert.match(restoredNeedSummary(need),/20000.*میلی‌آمپر/);
 assert.equal(parseNeedState(old).minimum_powerbank_mah,undefined);
 for(const value of [0,-1,1.5,1000001,'20000'])assert.throws(()=>parseNeedState({...old,minimum_powerbank_mah:value}));
});

test('nearby shortcuts never discard written RAM or powerbank capacity with a budget edit',()=>{
 for(const text of ['پاوربانک حداقل ظرفیت ۲۰۰۰۰ تا دو میلیون میخوام نزدیک من','لپ تاپ رم حداقل شانزده گیگ نزدیک من','ظرفیت حداقل ۲۰۰۰۰ باشد، بودجه تا سه میلیون']){
  assert.equal(needsProductInterpretation(text),true,text);
  assert.equal(visitIntent(text,'پاوربانک'),null,text);
 }
 assert.equal(needsProductInterpretation('پاوربانک نزدیک من'),false);
 assert.equal(visitIntent('پاوربانک نزدیک من',null).topic,'پاوربانک');
});
