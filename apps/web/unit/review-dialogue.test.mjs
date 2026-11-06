import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseTopics,accessoryDeviceReply,shortPurchaseTopic} from '../src/live/requestPlanning.ts';
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
