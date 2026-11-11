import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseTopics,accessoryDeviceReply,shortPurchaseTopic,directPurchaseQuery} from '../src/live/requestPlanning.ts';
import {visitIntent} from '../src/live/conversation.ts';
import {replyPlan} from '../src/live/replySuggestions.ts';

test('replacement and refusal discard old items while genuine lists remain lists',()=>{
 assert.deepEqual(purchaseTopics('به جای هدفون یک پاوربانک میخوام'),['پاوربانک']);
 assert.deepEqual(purchaseTopics('فقط شارژر میخوام، نه خود گوشی'),['شارژر']);
 assert.deepEqual(new Set(purchaseTopics('شارژر و کابل میخوام')),new Set(['شارژر','کابل']));
});
test('device clarification and long location continuation preserve the purchase boundary',()=>{
 assert.equal(accessoryDeviceReply('برای گوشی سامسونگ A54، تایپ سی','شارژر سامسونگ'),true);
 assert.equal(accessoryDeviceReply('خود گوشی سامسونگ میخوام','شارژر سامسونگ'),false);
 assert.equal(shortPurchaseTopic('گوشی میخوام؛ نزدیک ترین جا رو خودت انتخاب کن تا پیاده برم؛ گوشی هوشمند میخواهم'), 'گوشی');
 assert.equal(visitIntent('گوشی نزدیک من میخوام؛ زنگ بزن بپرس موجوده',null),null);
});
test('battery question code takes precedence even if the old battery state has not arrived',()=>{
 const plan=replyPlan({screen:'decide',topic:'گوشی',questionCode:'battery_capacity',lastQuestion:'حداقل ظرفیت؟',history:'',budget:'',needsLocation:false,selected:false,openOnly:false,batteryStatus:'unspecified',pending:[],completed:false,hasResults:false});
 assert.deepEqual(plan.primary.map(x=>x.id),['battery-5000','no-battery-min']);
 assert.equal(plan.more[0].panel,'battery');
});


test('phone properties and accessory target devices are not queued purchases',()=>{
 assert.deepEqual(purchaseTopics('گوشی اندرویدی تا بیست میلیون برای عکس گرفتن از بچه‌ام می‌خواهم؛ باتری هم خوب باشد.'),['گوشی']);
 assert.deepEqual(new Set(purchaseTopics('شارژر و کابل تایپ سی برای گوشی سامسونگ A54 تا یک میلیون می‌خواهم.')),new Set(['شارژر','کابل']));
 assert.deepEqual(purchaseTopics('اول فقط کابل را بررسی کن؛ شارژر برای بعد.'),['کابل']);
 assert.deepEqual(new Set(purchaseTopics('گوشی و باتری می‌خواهم')),new Set(['گوشی','باتری']));
});


test('offline requests extract only simple products and refuse unsupported clauses',()=>{
 for(const text of ['گوشی تا ده میلیون می‌خواهم.','گوشی تا ده میلیون تومان می‌خواهم.','هدفون تا ۲ میلیون میخوام','کفش میخواهم'])assert.ok(directPurchaseQuery(text),text);
 for(const text of ['گوشی تا 10000 می‌خواهم','گوشی تا منفی ده میلیون می‌خواهم','گوشی با دوربین خوب تا ده میلیون می‌خواهم','گوشی تا ده میلیون با گارانتی می‌خواهم','گوشی و کابل میخواهم','گوشی سامسونگ نمیخواهم'])assert.equal(directPurchaseQuery(text),null,text);
});

import {sellerPreferences,wordToman} from '../src/live/sellerPreferences.ts';
import {formatWarranty} from '../src/api.ts';

test('release all seller payment constraints without losing product budget',()=>{
 assert.deepEqual(sellerPreferences('قسطی لازم نیست؛ همه فروشگاه‌ها را با همان بودجه بررسی کن.'),{credit:false,pay:false,kala:false});
 assert.equal(sellerPreferences('ترب پی را حذف نکن').pay,undefined);
 assert.deepEqual(sellerPreferences('قسطی را حذف نکن؛ همه فروشگاه‌ها را ببین'),{});
 assert.equal(sellerPreferences('گوشی تا ده میلیون می‌خواهم.').max,'10000000');
 assert.equal(sellerPreferences('کفش تا سه میلیون میخواهم').max,'3000000');
 assert.equal(wordToman('سه و دو میلیون'),null);
 assert.equal(wordToman('دو میلیارد و پانصد میلیون'),'2500000000');
});
test('warranty objects render source values and unknown duration without JSON',()=>{
 assert.equal(formatWarranty({description:null,period_months:null,provider:'تست و تحویل در حضور مشتری'}),'تست و تحویل در حضور مشتری · مدت گارانتی ثبت نشده');
 assert.match(formatWarranty({description:'گارانتی ثبت‌شده',period_months:18}),/۱۸ ماه/);
 assert.equal(formatWarranty(null),'ثبت نشده');
 assert.equal(formatWarranty('ضمانت فروشگاه'),'ضمانت فروشگاه');
 assert.doesNotMatch(formatWarranty({unexpected:'value'}),/[{}]|unexpected/);
});
