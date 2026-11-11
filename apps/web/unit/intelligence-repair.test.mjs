import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseTopics,queuedPurchase,restoredNeedSummary} from '../src/live/requestPlanning.ts';
import {answerPurchaseQuestion} from '../src/live/purchaseQuestions.ts';
import {travelLimit,withinTravelLimit,selectVisit} from '../src/live/delegatedVisit.ts';

test('conditional accessory discussion never creates a shopping queue',()=>{
 for(const s of ['اگر فقط کابل همراهش تایپ سی بود ولی خود شارژر USB-A بود پیشنهاد نده','اگه کابل همراه شارژر بود، گوشی را جدا حساب نکن'])assert.deepEqual(purchaseTopics(s),[]);
 assert.deepEqual(new Set(purchaseTopics('شارژر و کابل برای گوشی میخواهم')),new Set(['شارژر','کابل']));
});
test('each queued accessory receives shared device, connector and an explicit allocation',()=>{
 const original='شارژر و کابل تایپ سی برای گوشی سامسونگ A54 تا یک میلیون می‌خواهم.';
 const cable=queuedPurchase(original,'کابل','500000');
 assert.match(cable,/کابل تایپ سی برای گوشی سامسونگ A54/);assert.match(cable,/500000 تومان/);assert.doesNotMatch(cable,/شارژر/);
 const charger=queuedPurchase(original,'شارژر','1000000');assert.match(charger,/A54/);assert.doesNotMatch(charger,/کابل/);
});
test('restored purchase summary states typed constraints without changing their meaning',()=>{
 const s=restoredNeedSummary({topic_query:'گوشی اندروید غیرسامسونگ',max_price_toman:'20000000',source_filters:{colour:'سفید',size:null,connector:null},battery_requirement:{minimum_mah:5000},pending_requirements:[]});
 for(const word of ['اندروید','غیرسامسونگ','سفید','20000000','5000'])assert.ok(s.includes(word));
});
test('price and reservation questions answer directly without claiming a real action',()=>{
 const context={product:null,recommended:null,products:[],selected:null,offers:[],checks:{},routes:[],note:''};
 assert.match(answerPurchaseQuestion('پس رزرو قطعی شد یا نه؟',context),/^نه؛/);
 const answer=answerPurchaseQuestion('قیمت ثبت‌شده با قیمت پاسخ فروشنده یکی است؟',context);
 assert.match(answer,/دادهٔ منبع/);assert.match(answer,/آزمایشی/);
});
test('recommendation explanation quotes source witnesses and compares the same fields',()=>{
 const p={product_id:'a',persian_title:'الف',specs:[{key:'دوربین اصلی',value:'8 مگاپیکسل'}]};
 const other={product_id:'b',persian_title:'ب',specs:[{key:'دوربین اصلی',value:'0.3 مگاپیکسل'}]};
 const result=answerPurchaseQuestion('چرا این را پیشنهاد دادی؟',{product:null,recommended:p,products:[p,other],selected:null,offers:[],checks:{},routes:[],note:''});
 assert.match(result,/8 مگاپیکسل/);assert.match(result,/0.3 مگاپیکسل/);assert.match(result,/به‌تنهایی معیار کیفیت عکس نیست/);
});
test('a user travel deadline is separate from shopping margin and survives unknown estimates safely',()=>{
 assert.equal(travelLimit('فقط ده دقیقه برای رفتن وقت دارم؛ پیاده می‌روم'),10);
 assert.equal(travelLimit('ده دقیقه بیشتر وقت ندارم؛ پیاده می‌روم'),10);
 assert.equal(travelLimit('حداکثر ۱۵ دقیقه برای رسیدن فرصت دارم'),15);
 assert.equal(travelLimit('محدودیت زمان مهم نیست'),null);
 assert.equal(travelLimit('قیمت ده میلیون است'),undefined);
 const far={offer_id:'far',shop_id:'s',price_toman:'1'},near={offer_id:'near',shop_id:'n',price_toman:'2'};
 const checks={far:{risk:'ready',basis:'street_route',minutes_max:105},near:{risk:'ready',basis:'street_route',minutes_max:9}};
 const routes=[{offer_id:'far',duration_seconds:6300,distance_meters:4000},{offer_id:'near',duration_seconds:540,distance_meters:500}];
 assert.equal(withinTravelLimit(far,checks,10),false);assert.equal(withinTravelLimit(far,{},10),false);
 assert.equal(selectVisit([far,near],checks,routes,'cheapest',[],10),near);
 assert.equal(selectVisit([far],checks,routes,'nearest',[],10),null);
});

import {rankingNeedContext} from '../src/live/requestPlanning.ts';
import {parseTurn} from '../src/app/base/domain/parsers.ts';
test('status answers satisfy the existing turn boundary without fabricated results',()=>{
 const battery={status:'unspecified',minimum_mah:null};
 const need={version:1,topic_query:'گوشی',category_name:'گوشی موبایل',category_cleared:false,max_price_toman:'20000000',budget_needs_input:false,offer_sort:'price',battery_requirement:battery,review_topics:[],pending_requirements:[]};
 const result=parseTurn({request_id:'abcdef12-1234-1234-1234-123456789012',status:'needs_input',query:'گوشی',category_name:'گوشی موبایل',max_price_toman:'20000000',question:'نه؛ رزرو قطعی انجام نشده است.',question_code:'purchase_status',products:null,explanation:null,battery_requirement:battery,offer_sort:'price',need_state:need},'abcdef12-1234-1234-1234-123456789012');
 assert.equal(result.question_code,'purchase_status');assert.equal(result.need_state.max_price_toman,'20000000');
 assert.match(rankingNeedContext({...need,review_topics:['camera'],preferences:['coding']}),/برنامه نویسی.*دوربین/);
});
