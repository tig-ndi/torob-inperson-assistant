import test from 'node:test';
import assert from 'node:assert/strict';
import {restoredPurchaseEdit,budgetOnlyEdit,queuedPurchase,purchaseTopics,directPurchaseQuery,canUseSimplePurchase} from '../src/live/requestPlanning.ts';
import {purchaseQuestion} from '../src/live/purchaseQuestions.ts';
import {travelLimit,hasTravelDeadline} from '../src/live/delegatedVisit.ts';

test('returning to a purchase separates new instructions from a plain history question',()=>{
 assert.equal(restoredPurchaseEdit('برگردیم به همان گوشی ولی بودجه را پنج میلیون کن','گوشی'),'بودجه را پنج میلیون کن');
 assert.equal(restoredPurchaseEdit('برگرد به گوشی؛ رنگ سفید باشد','گوشی'),'رنگ سفید باشد');
 assert.equal(restoredPurchaseEdit('برگردیم به همان گوشی؛ چه شرط‌هایی داشتم؟','گوشی'),null);
 assert.equal(restoredPurchaseEdit('برگردیم به همان گوشی','گوشی'),null);
 assert.equal(budgetOnlyEdit('بودجه را پنج میلیون کن'),'5000000');
 assert.equal(budgetOnlyEdit('بودجه رو ۵ میلیون کن'),'5000000');
 assert.equal(budgetOnlyEdit('بودجه را پنج میلیون کن و رنگ سفید باشد'),undefined);
});

test('a purchase combined with seller contact still reaches the purchase interpreter',()=>{
 for(const text of ['کابل تایپ سی تا پانصد هزار تومان می‌خواهم و به فروشنده زنگ بزن','هدفون لازم دارم؛ رزرو واقعی انجام بده','شارژر تا یک میلیون پیدا کن و زنگ بزن','یخچال می‌خواهم؛ به فروشنده زنگ بزن','یک کابل بخر و به فروشنده زنگ بزن'])assert.equal(purchaseQuestion(text),null);
 assert.equal(purchaseQuestion('پس رزرو قطعی شد یا نه؟'),'reservation');
 assert.equal(purchaseQuestion('به فروشنده همین گوشی زنگ بزن'),'reservation');
 assert.equal(purchaseQuestion('قیمت ثبت‌شده با قیمت پاسخ فروشنده یکی است؟'),'price');
});

test('queue keeps each item attributes without borrowing those of the next item',()=>{
 const source='گوشی اندرویدی با باتری حداقل ۵۰۰۰ و هدفون بی‌سیم می‌خواهم؛ برای هر کالا ده میلیون تومان';
 const phone=queuedPurchase(source,'گوشی','10000000');
 assert.match(phone,/اندرویدی.*باتری حداقل ۵۰۰۰/);assert.doesNotMatch(phone,/هدفون|بی سیم/);
 const headphones=queuedPurchase(source,'هدفون','2000000');
 assert.match(headphones,/هدفون بی سیم/);assert.doesNotMatch(headphones,/اندروید|۵۰۰۰|باتری/);
 assert.deepEqual(purchaseTopics(phone),['گوشی']);assert.deepEqual(purchaseTopics(headphones),['هدفون']);
 assert.match(headphones,/2000000 تومان/);assert.doesNotMatch(headphones,/ده میلیون/);
});

test('queue preserves accessory device and connector while replacing an old allocation',()=>{
 const source='شارژر و کابل تایپ سی برای گوشی سامسونگ A54 تا یک میلیون می‌خواهم';
 for(const chosen of ['شارژر','کابل']){
  const value=queuedPurchase(source,chosen,'500000');
  assert.match(value,/تایپ سی/);assert.match(value,/برای گوشی سامسونگ A54/);assert.match(value,/500000 تومان/);
  assert.doesNotMatch(value,/یک میلیون/);assert.equal(purchaseTopics(value).length,1);
 }
 assert.match(queuedPurchase('لپ تاپ لنوو و هدفون بی سیم میخواهم','لپ تاپ','10000000'),/لنوو/);
 const separate='شارژر USB-A برای گوشی سامسونگ A54 و کابل تایپ سی برای لپ تاپ لنوو می‌خواهم';
 const charger=queuedPurchase(separate,'شارژر','500000');
 assert.match(charger,/USB-A.*برای گوشی سامسونگ A54/);assert.doesNotMatch(charger,/تایپ سی|لنوو|کابل/);
 const cable=queuedPurchase(separate,'کابل','500000');
 assert.match(cable,/تایپ سی.*برای لپ تاپ لنوو/);assert.doesNotMatch(cable,/سامسونگ|شارژر|USB-A/);
});

test('travel deadlines parse entire Persian amounts and hours, never the numeric suffix',()=>{
 for(const [text,want] of [
  ['فقط ۲۵ دقیقه برای رسیدن وقت دارم',25],
  ['فقط بیست و پنج دقیقه برای رسیدن وقت دارم',25],
  ['بیست و پنج دقیقه بیشتر وقت ندارم',25],
  ['نیم ساعت بیشتر وقت ندارم',30],
  ['فقط یک ساعت و نیم برای رفتن وقت دارم',90],
  ['یک ساعت و پانزده دقیقه بیشتر وقت ندارم',75],
  ['صد و بیست و سه دقیقه بیشتر وقت ندارم',123],
  ['حداکثر ۱۰ دقیقه برای رفتن وقت دارم',10],
  ['محدودیت زمان مهم نیست',null],
 ])assert.equal(travelLimit(text),want,text);
});

test('ambiguous or impossible deadlines ask for clarification without altering the previous cap',()=>{
 for(const text of ['فقط ده یا بیست دقیقه برای رسیدن وقت دارم','فقط صفر دقیقه وقت دارم','فقط -۵ دقیقه وقت دارم','فقط ۱۰۰۰ دقیقه برای رفتن وقت دارم']){
  assert.equal(travelLimit(text),undefined,text);assert.equal(hasTravelDeadline(text),true,text);
 }
 assert.equal(travelLimit('قیمت ده میلیون است'),undefined);assert.equal(hasTravelDeadline('قیمت ده میلیون است'),false);
});

test('simple recovery only accepts explicit item and validated budget, never drops other requirements',()=>{
 assert.equal(directPurchaseQuery('گوشی تا پنج میلیون می‌خواهم'),'گوشی');
 for(const text of ['گوشی اندروید سفید تا پنج میلیون می‌خواهم','گوشی و هدفون می‌خواهم','گوشی با باتری حداقل ۵۰۰۰ می‌خواهم'])assert.equal(directPurchaseQuery(text),null);
});

test('ordinary typed laptop spellings use the same conservative direct search',()=>{
 for(const text of ['لپ تاپ میخوام','لپ‌تاپ می‌خوام','لپتاپ میخوام','لب تاب میخوام','لپ تاب تا ده میلیون میخوام'])assert.equal(directPurchaseQuery(text),'لپ تاپ',text);
 assert.equal(directPurchaseQuery('گوشی میخوام'),'گوشی');
 assert.equal(directPurchaseQuery('لپتاپ سبک برای برنامه نویسی میخوام'),null);
});

test('automatic recovery cannot silently relax a qualified same-family purchase',()=>{
 const plain={topic_query:'گوشی',category_cleared:false,budget_needs_input:false,max_price_toman:'5000000',review_topics:[],pending_requirements:[],battery_requirement:{status:'unspecified',minimum_mah:null}};
 assert.equal(canUseSimplePurchase('گوشی',plain),true);
 for(const edit of [{topic_query:'گوشی اندروید'},{source_filters:{colour:'سفید'}},{pending_requirements:[{key:'گارانتی'}]},{battery_requirement:{status:'minimum',minimum_mah:5000}},{preferences:['camera']},{budget_needs_input:true}])assert.equal(canUseSimplePurchase('گوشی',{...plain,...edit}),false);
 assert.equal(canUseSimplePurchase('لپ تاپ',{...plain,topic_query:'گوشی اندروید'}),true);
 assert.equal(canUseSimplePurchase('گوشی',null,'گوشی اندرویدی سفید میخوام'),false);
 assert.equal(canUseSimplePurchase('لپ تاپ',null,'گوشی اندرویدی سفید میخوام'),true);
});
